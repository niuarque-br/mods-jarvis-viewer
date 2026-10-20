import { expect, mock, test } from 'claude-code/testing'

import { PickQueue } from './picks'
import { SCENE, show, world } from './testkit'

test('ocioso submete na hora', () => expect(new PickQueue().pick('X', false)).toEqual({ submit: 'X' }))
test('ocupado guarda e avisa', () => expect(new PickQueue().pick('X', true)).toEqual({ caption: 'guardei: X' }))

test('fim do turno libera o guardado uma vez', () => {
  const q = new PickQueue()
  q.pick('X', true)
  expect(q.turnEnded()).toBe('X')
  expect(q.turnEnded()).toBeNull()
})

test('um pedido novo substitui o guardado', () => {
  const q = new PickQueue()
  q.pick('A', true)
  q.pick('B', true)
  expect(q.turnEnded()).toBe('B')
})

test('pick do auxiliar monta o texto com rótulo e título', async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on, { pages: 1 })
  await show($, { scene: { ...SCENE, title: 'Como o Jarvis funciona', nodes: [{ id: 'aux', label: 'Auxiliar' }, { id: 'api', label: 'API' }], links: [{ from: 'aux', to: 'api' }], steps: [{ say: 'Um.', focus: ['aux'] }] } })
  calls.emit({ type: 'pick', scene: 's1', node: 'aux' })
  await clock.settle()
  expect(calls.submitted).toEqual(['Explique a parte «Auxiliar» da cena «Como o Jarvis funciona».'])
})

test('node sem rótulo usa o id', async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on, { pages: 1 })
  await show($)
  calls.emit({ type: 'pick', scene: 's1', node: 'web#2' })
  await clock.settle()
  expect(calls.submitted).toEqual(['Explique a parte «web#2» da cena «Pedido».'])
})

test('pick de cena antiga é ignorado', async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on, { pages: 1 })
  await show($)
  calls.emit({ type: 'pick', scene: 's0', node: 'web' })
  await clock.settle()
  expect(calls.submitted).toEqual([])
  expect(calls.cmds.filter(c => c.type === 'caption')).toEqual([])
})

test('durante o turno guarda, avisa a página e libera no fim do turno principal', async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on, { pages: 1 })
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', async (_$, e) => ({ text: e.answer }))
  await show($)
  await $.turn.start({ text: 'oi', turnId: 't1' })
  calls.emit({ type: 'pick', scene: 's1', node: 'web' })
  calls.emit({ type: 'pick', scene: 's1', node: 'api' })
  await clock.settle()
  expect(calls.submitted).toEqual([])
  expect(calls.cmds.filter(c => c.type === 'caption')).toEqual([
    { type: 'caption', text: 'guardei: Explique a parte «Site» da cena «Pedido».' },
    { type: 'caption', text: 'guardei: Explique a parte «API» da cena «Pedido».' },
  ])
  await $.turn.start({ text: 'sub', turnId: 't2', agentId: 'a1' })
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't2', agentId: 'a1', reason: 'answer' })
  await clock.settle()
  expect(calls.submitted).toEqual([])
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  expect(calls.submitted).toEqual(['Explique a parte «API» da cena «Pedido».'])
})
