import type { PluginOptions, Register } from 'claude-code'

import { guidance, viewerPrompt } from './guidance'
import { startHelper } from './helper'
import type { HelperHandle } from './helper'
import { LIMITS, SCENE_TYPES, validateScene } from './scene'
import type { Scene } from './scene'

export const TOOL = 'mcp__jarvis-viewer__mostrar_cena'

export const TOOL_DESCRIPTION = `Mostra uma explicação como cena animada (3D) no navegador embutido do app desktop, com legenda e narração passo a passo. Use quando mostrar ajuda mais do que texto: arquitetura, fluxo de um processo, comparação, evolução no tempo, números em gráfico. Para respostas curtas, siga só com texto.

Entrada: { scene } mostra uma cena nova; { replay: true, from?: N } repete a última cena a partir do passo N (1 = início).

Toda cena tem title, type e steps. Cada passo tem say (até ${LIMITS.say} caracteres, o texto que aparece e é narrado) e, opcionalmente, focus (ids a destacar), hops (pares [de, para] por onde um pacote viaja), path, highlight. Todo id usado num passo precisa existir na cena; ids não se repetem. Limites: até ${LIMITS.steps} passos e ${LIMITS.pieces} peças.

Tipos e suas listas:
- arquitetura: nodes {id,label,sub?,group?,shape?}, links {from,to,label?}
- fluxo: nodes {id,label,kind: inicio|etapa|decisao|fim}, edges {from,to,label?}
- grafico: chart barras|linhas|rosca|dispersao, categories [textos], series {id,label,values[]} (dispersao: series com points {x,y}), unit?
- timeline: events {id,date,label,detail?}
- sequencia: actors {id,label}, messages {id,label,from,to}
- estados: states {id,label,initial?}, transitions {from,to,label?}
- camadas: layers {id,label,items?[]}
- arvore: nodes {id,label,parent?} (uma só raiz, sem parent)
- comparacao: sides (exatamente 2) {id,label,items:[{id,label,value?}]}
- metafora: objects {id,shape,pos:[x,y,z],size?,color?,text?}; steps com actions {target,do: mover|girar|pulsar|aparecer|sumir|seguir,to?,path?,ms?}

Se a cena for recusada, a resposta lista cada erro com o caminho do campo; corrija e chame de novo. Se a resposta pedir para abrir um endereço, abra-o no navegador embutido com preview_start (parâmetro url); a cena aparece sozinha.

Exemplo arquitetura:
{"scene":{"title":"Pedido","type":"arquitetura","nodes":[{"id":"web","label":"Site"},{"id":"api","label":"API"}],"links":[{"from":"web","to":"api"}],"steps":[{"say":"O site chama a API.","focus":["web"],"hops":[["web","api"]]}]}}

Exemplo grafico:
{"scene":{"title":"Vendas","type":"grafico","chart":"barras","categories":["Jan","Fev"],"series":[{"id":"v","label":"Vendas","values":[10,14]}],"steps":[{"say":"Fevereiro cresceu.","highlight":["v#1"]}]}}`

export const TOOL_SCHEMA = {
  type: 'object',
  properties: {
    scene: {
      type: 'object',
      description: `Cena nova. Tipos: ${SCENE_TYPES.join(', ')}. O detalhe de cada tipo está na descrição da ferramenta.`,
    },
    replay: { type: 'boolean', description: 'Repete a última cena da sessão em vez de mostrar uma nova.' },
    from: { type: 'number', description: 'Com replay: passo inicial, de 1 ao número de passos.' },
  },
}

// Per-session state; reset at session.start.
export let lastScene: { id: string; scene: Scene } | null = null
let counter = 0
let handle: HelperHandle | undefined
let starting: Promise<HelperHandle> | undefined
let lastHandle: HelperHandle | undefined

export const register: Register = (on, options: PluginOptions) => {
  on('session.start', async ($, e, next) => {
    await shutdown()
    lastScene = null
    counter = 0
    lastHandle = undefined
    await $.tool.register({ name: 'mostrar_cena', description: TOOL_DESCRIPTION, inputSchema: TOOL_SCHEMA, isDeferred: false })
    await $.command.register({ name: 'viewer', description: 'Mostra no viewer a explicação anterior ou um assunto' })
    return next(e)
  })

  on('command.run', { command: 'viewer' }, async ($, e) => {
    // The host refuses a submit made while this hook holds the turn, so it goes out from a timer.
    const text = viewerPrompt(e.args)
    $.clock.after(0, () => void $.prompt.submit({ text, asUser: true }))
    return { text: 'Pedindo a cena ao Claude…' }
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    const mode = String(options?.presentation ?? 'IA escolhe')
    return { ...composed, sections: [...composed.sections, { id: 'jarvis-viewer', text: guidance(mode), scope: 'session' as const }] }
  })

  on('session.end', async ($, e, next) => {
    await shutdown()
    return next(e)
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    const surfaces = await $.session.surfaces()
    if (surfaces.length > 0 && !surfaces.includes('desktop')) {
      return { deny: 'O viewer só funciona no app desktop; siga só com texto.' }
    }

    // The engine puts the tool's arguments beside `tool` on the event (ToolCallEnvelope).
    const input = { scene: e.scene, replay: e.replay === true, from: typeof e.from === 'number' ? e.from : undefined }
    let sent: { id: string; scene: Scene }
    let from = 0
    if (input.replay) {
      if (!lastScene) return { deny: 'Ainda não há cena nesta sessão.' }
      sent = lastScene
      const n = sent.scene.steps.length
      if (input.from !== undefined) {
        if (!Number.isInteger(input.from) || input.from < 1 || input.from > n) return { deny: `from: entre 1 e ${n}` }
        from = input.from - 1
      }
    } else {
      if (input.scene === undefined) return { deny: 'Informe scene (cena nova) ou replay: true.' }
      const checked = validateScene(input.scene)
      if (!checked.ok) return { deny: `Cena recusada:\n${checked.errors.join('\n')}` }
      sent = { id: `s${++counter}`, scene: checked.scene }
    }

    let helper: HelperHandle
    try {
      helper = handle ?? (await (starting ??= launch($)))
    } catch (err) {
      return { deny: (err as Error).message }
    }

    // A replay on a helper that never saw the scene (it was respawned) sends the scene again.
    if (input.replay && lastHandle === helper) await helper.send({ type: 'play', id: sent.id, from })
    else await helper.send({ type: 'scene', id: sent.id, scene: sent.scene, narrator: 'page', from })
    lastScene = sent
    lastHandle = helper

    const n = sent.scene.steps.length
    if ((await helper.pages()) > 0) return { result: `Cena exibida: ${n} passos.` }
    return {
      result: `Abra ${helper.url} no navegador embutido com preview_start (parâmetro url). Em seguida a cena aparece sozinha.`,
    }
  })
}

/** Stops the running helper (also one still starting) and forgets it. */
async function shutdown(): Promise<void> {
  const pending = starting
  const running = handle
  handle = undefined
  starting = undefined
  const h = running ?? (pending ? await pending.catch(() => undefined) : undefined)
  await h?.stop()
}

function launch($: Parameters<typeof startHelper>[0]): Promise<HelperHandle> {
  return (async () => {
    let dead = false
    let mine: HelperHandle | undefined
    try {
      const h = await startHelper($, event => {
        if (event.type !== 'exit' && event.type !== 'error') return
        dead = true
        if (mine && handle === mine) handle = undefined
      })
      mine = h
      if (!dead) handle = h
      return h
    } finally {
      starting = undefined
    }
  })()
}
