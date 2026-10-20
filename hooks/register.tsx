import type { PluginOptions, Register } from 'claude-code'

import { guidance, viewerPrompt } from './guidance'
import { startHelper } from './helper'
import type { HelperHandle } from './helper'
import { Cancel, STEP_DONE_TIMEOUT_MS, jarvisLink, narrateWithJarvis } from './jarvis'
import type { JarvisLink } from './jarvis'
import type { Narrator } from './narration'
import { NARRATION_KEY, chooseNarrator, narrationOn } from './narration'
import { PickQueue } from './picks'
import { LIMITS, SCENE_TYPES, pieceLabel, validateScene } from './scene'
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
let mainTurn: string | undefined
let picks = new PickQueue()
// Jarvis narration: one loop at a time, for the live scene only.
let link: JarvisLink | undefined
let sceneNarrator: Narrator | undefined
let pendingStart: { id: string; from: number } | null = null
let loop: { cancel: Cancel } | null = null
let loopDone: Promise<unknown> = Promise.resolve()
let loopTicket = 0
let waiting: { scene: string; step: number; resolve: () => void } | null = null

export const register: Register = (on, options: PluginOptions) => {
  on('session.start', async ($, e, next) => {
    await stopLoop()
    await shutdown()
    lastScene = null
    counter = 0
    link = undefined
    sceneNarrator = undefined
    pendingStart = null
    lastHandle = undefined
    mainTurn = undefined
    picks = new PickQueue()
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

  on('turn.start', async ($, e, next) => {
    const started = await next(e)
    if (e.agentId === undefined) mainTurn = e.turnId
    return started
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined && e.turnId === mainTurn) {
      mainTurn = undefined
      const text = picks.turnEnded()
      // Not awaited: the host refuses a submit made while this hook holds the turn.
      if (text !== null) void $.prompt.submit({ text, asUser: true })
    }
    return result
  })

  on('session.end', async ($, e, next) => {
    pendingStart = null
    await stopLoop()
    await shutdown()
    return next(e)
  })

  // The Jarvis answers each `say` by writing its own `said`.
  on('state.set', { plugin: 'modo-conversa', key: 'said' }, async ($, e, next) => {
    const result = await next(e)
    link?.heard(e.value)
    return result
  })

  // The Jarvis went off: a sentence it was asked for will never be said, so fall back now, not in 30 s.
  // The Jarvis came on: it takes the live scene over (the page stops its voice and waits for ▶).
  on('state.set', { plugin: 'modo-conversa', key: 'mode' }, async ($, e, next) => {
    const result = await next(e)
    link?.modeChanged(e.value)
    if (e.value === 'on') $.clock.after(0, () => void jarvisTookOver($, options))
    return result
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
      helper = handle ?? (await (starting ??= launch($, options)))
    } catch (err) {
      return { deny: (err as Error).message }
    }

    const jarvis = linkOf($)
    // Whatever the Jarvis was narrating is over: a scene (or a replay) takes the page.
    pendingStart = null
    void stopLoop()
    let narrator: Narrator
    // A replay on a helper that never saw the scene (it was respawned) sends the scene again.
    if (input.replay && lastHandle === helper) {
      // The Jarvis may have gone on or off since the scene was shown: the page learns the narrator first.
      const narration = await localNarration($, options)
      narrator = chooseNarrator(await jarvis.isOn(), narration)
      if (narrator !== sceneNarrator) await helper.send({ type: 'mode', narrator, narration })
      await helper.send({ type: 'play', id: sent.id, from })
    } else {
      narrator = chooseNarrator(await jarvis.isOn(), await localNarration($, options))
      await helper.send({ type: 'scene', id: sent.id, scene: sent.scene, narrator, from })
    }
    lastScene = sent
    lastHandle = helper
    sceneNarrator = narrator
    // With the Jarvis narrating, the loop starts once a page is there (now, or at page-open).
    if (narrator === 'jarvis') pendingStart = { id: sent.id, from }

    const n = sent.scene.steps.length
    const pages = await helper.pages()
    if (pages > 0) startPending($, options, helper)
    if (pages > 0) return { result: `Cena exibida: ${n} passos.` }
    return {
      result: `Abra ${helper.url} no navegador embutido com preview_start (parâmetro url). Em seguida a cena aparece sozinha.`,
    }
  })
}

async function localNarration($: EngineOf, options: PluginOptions | undefined): Promise<boolean> {
  let saved: unknown
  try {
    saved = await $.store.get(NARRATION_KEY)
  } catch {
    saved = undefined
  }
  return narrationOn(optionOf(options), saved)
}

/** The Jarvis came on while the page narrates the live scene: the page hands it over and waits for ▶ (resume). */
async function jarvisTookOver($: EngineOf, options: PluginOptions | undefined): Promise<void> {
  const helper = handle
  if (!helper || !lastScene || lastHandle !== helper || sceneNarrator === 'jarvis') return
  sceneNarrator = 'jarvis'
  const narration = await localNarration($, options)
  try {
    await helper.send({ type: 'mode', narrator: 'jarvis', narration })
  } catch {
    // helper gone; nothing to tell
  }
}

/** Ends the running narration loop, if any (and a start still on its way), and waits until it let go (playing false). */
async function stopLoop(): Promise<void> {
  loopTicket++
  await haltLoop()
}

async function haltLoop(): Promise<void> {
  loop?.cancel.cancel()
  loop = null
  waiting = null
  await loopDone
}

/** Starts the loop asked for by the last scene, once. */
function startPending($: EngineOf, options: PluginOptions | undefined, helper: HelperHandle): void {
  const start = pendingStart
  pendingStart = null
  if (start) void startLoop($, options, helper, start.id, start.from)
}

/** Narrates the live scene with the Jarvis from `from`; replaces any loop still running. */
async function startLoop($: EngineOf, options: PluginOptions | undefined, helper: HelperHandle, id: string, from: number): Promise<void> {
  const ticket = ++loopTicket
  await haltLoop()
  if (ticket !== loopTicket) return
  const scene = lastScene
  if (!scene || scene.id !== id || from < 0 || from >= scene.scene.steps.length) return
  const cancel = new Cancel()
  loop = { cancel }
  const jarvis = linkOf($)
  const run = narrateWithJarvis(
    jarvis,
    cmd => helper.send(cmd),
    scene.scene,
    from,
    step =>
      new Promise<void>(resolve => {
        waiting = { scene: id, step, resolve }
      }),
    {
      cancel,
      localNarration: () => localNarration($, options),
      onFallback: narrator => {
        if (lastScene?.id === id) sceneNarrator = narrator
      },
      stepDoneTimer: () => {
        let fire = () => {}
        const done = new Promise<void>(resolve => {
          fire = resolve
        })
        const t = $.clock.after(STEP_DONE_TIMEOUT_MS, () => fire())
        return { done, cancel: () => t.cancel() }
      },
    },
  ).catch(() => 'error' as const)
  loopDone = run
  void run.then(() => {
    if (loopTicket === ticket) loop = null
  })
}

type EngineOf = Parameters<typeof startHelper>[0]

/** The session's channel with the Jarvis, made on first use. */
function linkOf($: EngineOf): JarvisLink {
  if (!link) link = jarvisLink($)
  return link
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

function optionOf(options: PluginOptions | undefined): string | undefined {
  const v = options?.narration
  return v === undefined ? undefined : String(v)
}

function launch($: Parameters<typeof startHelper>[0], options: PluginOptions | undefined): Promise<HelperHandle> {
  return (async () => {
    let dead = false
    let mine: HelperHandle | undefined
    try {
      const h = await startHelper($, event => {
        if (event.type === 'narration') {
          const flag = event.on as unknown
          if (typeof flag !== 'boolean') return
          void (async () => {
            const option = optionOf(options) ?? 'ligada'
            try {
              await $.store.set(NARRATION_KEY, { on: flag, option })
            } catch {
              // saving is best-effort; the page still gets the mode
            }
            try {
              const narrator = chooseNarrator(await linkOf($).isOn(), flag)
              if (lastScene) sceneNarrator = narrator
              await mine?.send({ type: 'mode', narrator, narration: flag })
            } catch {
              // helper gone; nothing to tell
            }
          })()
          return
        }
        if (event.type === 'page-open') {
          // A page that (re)opens shows the scene from step 1, waiting for ▶ when the Jarvis narrates.
          // A loop still running belongs to the page before the reload: its step-done will never come,
          // so it ends here (playing false) and the user's ▶ (resume) starts a new one.
          if (mine && pendingStart) startPending($, options, mine)
          else if (loop) void stopLoop()
          return
        }
        if (event.type === 'page-closed') {
          // Nobody is watching: end the loop so playing goes false and the Jarvis lets go of the scene.
          void stopLoop()
          return
        }
        if (event.type === 'step-done') {
          const w = waiting
          if (w && event.scene === w.scene && event.step === w.step) {
            waiting = null
            w.resolve()
          }
          return
        }
        if (event.type === 'paused') {
          // also stops a loop still starting (a resume a moment before)
          if (lastScene && event.scene === lastScene.id) void stopLoop()
          return
        }
        if (event.type === 'resume') {
          const sceneId = event.scene as unknown
          const step = event.step as unknown
          if (!mine || !lastScene || sceneId !== lastScene.id || typeof step !== 'number' || !Number.isInteger(step)) return
          pendingStart = null
          void startLoop($, options, mine, lastScene.id, step)
          return
        }
        if (event.type === 'pick') {
          const sceneId = event.scene as unknown
          const node = event.node as unknown
          if (typeof sceneId !== 'string' || typeof node !== 'string' || !lastScene || lastScene.id !== sceneId) return
          const label = pieceLabel(lastScene.scene, node) ?? node
          const out = picks.pick(`Explique a parte «${label}» da cena «${lastScene.scene.title}».`, mainTurn !== undefined)
          if (out.submit !== undefined) void $.prompt.submit({ text: out.submit, asUser: true })
          if (out.caption !== undefined) void mine?.send({ type: 'caption', text: out.caption }).catch(() => undefined)
          return
        }
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
