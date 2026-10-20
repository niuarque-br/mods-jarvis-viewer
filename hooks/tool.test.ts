import { expect, mock, test } from 'claude-code/testing'

import { SCENE, TOOL, ready, show, world } from './testkit'
import { TOOL_DESCRIPTION } from './register'

const text = (r: { result?: unknown }): string => String((r.result as { text?: string } | string | undefined) && ((r.result as { text?: string }).text ?? r.result))

test('cena inválida → deny com os erros e nada enviado', async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on)
  const bad = { ...SCENE, steps: [{ say: 'x', focus: ['x'] }] }
  const r = await show($, { scene: bad })
  await clock.settle()
  expect(r.deny).toContain('steps[0].focus: id "x" não existe')
  expect(calls.cmds).toEqual([])
  expect(calls.spawned).toEqual([])
})

test('primeira cena sobe o auxiliar e devolve o endereço', async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on)
  const r = await show($)
  await clock.settle()
  expect(r.deny).toBeUndefined()
  expect(text(r)).toMatch(/^Abra http:\/\/127\.0\.0\.1:47821\/\?t=\S+ no navegador embutido com preview_start \(parâmetro url\)\. Em seguida a cena aparece sozinha\.$/)
  expect(calls.cmds).toEqual([{ type: 'scene', id: 's1', scene: SCENE, narrator: 'page', from: 0 }])
})

test('com página aberta devolve Cena exibida', async ($, on) => {
  const clock = mock.clock(on)
  world(on, { pages: 1 })
  const r = await show($)
  await clock.settle()
  expect(text(r)).toBe('Cena exibida: 3 passos.')
})

test('replay sem cena anterior', async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on)
  const r = await show($, { replay: true })
  await clock.settle()
  expect(r.deny).toBe('Ainda não há cena nesta sessão.')
  expect(calls.spawned).toEqual([])
})

test('replay from 3 reenvia a última cena a partir do passo 3', async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on, { pages: 1 })
  await show($)
  const r = await show($, { replay: true, from: 3 })
  await clock.settle()
  expect(text(r)).toBe('Cena exibida: 3 passos.')
  expect(calls.cmds.at(-1)).toEqual({ type: 'play', id: 's1', from: 2 })
})

test('replay sem from recomeça do passo 1', async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on, { pages: 1 })
  await show($)
  await show($, { replay: true })
  expect(calls.cmds.at(-1)).toEqual({ type: 'play', id: 's1', from: 0 })
})

test('from fora da faixa', async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on, { pages: 1 })
  await show($)
  for (const from of [0, 4]) expect((await show($, { replay: true, from })).deny).toBe('from: entre 1 e 3')
  await clock.settle()
  expect(calls.cmds).toHaveLength(1)
})

test('fora do app desktop', async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on, { surfaces: ['terminal'] })
  const r = await show($)
  await clock.settle()
  expect(r.deny).toBe('O viewer só funciona no app desktop; siga só com texto.')
  expect(calls.spawned).toEqual([])
})

test('lista de superfícies vazia conta como desktop', async ($, on) => {
  const clock = mock.clock(on)
  world(on, { surfaces: [] })
  const r = await show($)
  await clock.settle()
  expect(r.deny).toBeUndefined()
})

test('não sobe um segundo auxiliar e numera as cenas', async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on)
  await show($)
  await show($)
  await clock.settle()
  expect(calls.spawned).toHaveLength(1)
  expect(calls.cmds.map(c => c.id)).toEqual(['s1', 's2'])
})

test('chamadas simultâneas compartilham o mesmo auxiliar', async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on)
  await Promise.all([show($), show($)])
  await clock.settle()
  expect(calls.spawned).toHaveLength(1)
})

test('auxiliar que terminou é subido de novo', async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on, { chunks: [ready(47821)], ends: true })
  await show($)
  await clock.settle()
  await show($)
  await clock.settle()
  expect(calls.spawned).toHaveLength(2)
})

test('replay depois de religar o auxiliar manda a cena inteira', async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on, { chunks: [ready(47821)], ends: true })
  await show($)
  await clock.settle()
  await show($, { replay: true, from: 2 })
  await clock.settle()
  expect(calls.cmds.at(-1)).toEqual({ type: 'scene', id: 's1', scene: SCENE, narrator: 'page', from: 1 })
})

test('a descrição cabe em 4096 caracteres e traz os 10 tipos', async () => {
  expect(TOOL_DESCRIPTION.length).toBeLessThanOrEqual(4096)
  for (const t of ['arquitetura', 'fluxo', 'grafico', 'timeline', 'sequencia', 'estados', 'camadas', 'arvore', 'comparacao', 'metafora']) {
    expect(TOOL_DESCRIPTION).toContain(t)
  }
})

test('a ferramenta é registrada no session.start', async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.settle()
  expect(calls.registered.map(t => t.name)).toEqual(['mostrar_cena'])
  expect(calls.registered[0]!.inputSchema).toMatchObject({ type: 'object', properties: { scene: {}, replay: {}, from: {} } })
})
