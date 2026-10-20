import { expect, mock, test } from 'claude-code/testing'

import { chooseNarrator, narrationOn } from './narration'
import { SCENE, show, world } from './testkit'

test('chooseNarrator: jarvis vence sempre', () => {
  expect(chooseNarrator(true, true)).toBe('jarvis')
  expect(chooseNarrator(true, false)).toBe('jarvis')
  expect(chooseNarrator(false, true)).toBe('page')
  expect(chooseNarrator(false, false)).toBe('caption')
})

test('narrationOn: o salvo vale com a mesma opção', () => {
  expect(narrationOn('ligada', { on: false, option: 'ligada' })).toBe(false)
  expect(narrationOn('desligada', { on: true, option: 'desligada' })).toBe(true)
})

test('narrationOn: opção mudada no /config passa a valer', () => {
  expect(narrationOn('desligada', { on: true, option: 'ligada' })).toBe(false)
  expect(narrationOn('ligada', { on: false, option: 'desligada' })).toBe(true)
})

test('narrationOn: sem nada salvo, ligada dá true', () => {
  expect(narrationOn('ligada', undefined)).toBe(true)
  expect(narrationOn(undefined, undefined)).toBe(true)
  expect(narrationOn('desligada', undefined)).toBe(false)
})

test('narration{on:false} grava no store e manda mode', async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on, { pages: 1 })
  await show($)
  calls.emit({ type: 'narration', on: false })
  await clock.settle()
  expect(calls.store.get('narration')).toEqual({ on: false, option: 'ligada' })
  expect(calls.cmds.at(-1)).toEqual({ type: 'mode', narrator: 'caption', narration: false })
})

test('com a preferência salva desligada, a cena sai com narrador caption', async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on, { pages: 1, store: { narration: { on: false, option: 'ligada' } } })
  await show($)
  await clock.settle()
  expect(calls.cmds[0]).toEqual({ type: 'scene', id: 's1', scene: SCENE, narrator: 'caption', from: 0 })
})

test('sem nada salvo e sem opção, a cena sai com narrador page', async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on, { pages: 1 })
  await show($)
  await clock.settle()
  expect(calls.cmds[0]).toMatchObject({ type: 'scene', narrator: 'page' })
})

test('opção desligada: cena sai com caption e o switch grava a opção atual', { options: { narration: 'desligada' } }, async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on, { pages: 1 })
  await show($)
  calls.emit({ type: 'narration', on: true })
  await clock.settle()
  expect(calls.cmds[0]).toMatchObject({ type: 'scene', narrator: 'caption' })
  expect(calls.store.get('narration')).toEqual({ on: true, option: 'desligada' })
  expect(calls.cmds.at(-1)).toEqual({ type: 'mode', narrator: 'page', narration: true })
})

test('store.get falha → a cena sai com o narrador da opção', async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on, { pages: 1, storeFails: ['get'] })
  const r = await show($)
  await clock.settle()
  expect(r.deny).toBeUndefined()
  expect(calls.cmds[0]).toMatchObject({ type: 'scene', narrator: 'page' })
})

test('store.set falha → mode sai mesmo assim, sem erro', async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on, { pages: 1, storeFails: ['set'] })
  await show($)
  calls.emit({ type: 'narration', on: false })
  await clock.settle()
  expect(calls.cmds.at(-1)).toEqual({ type: 'mode', narrator: 'caption', narration: false })
})

test('narration com on não booleano é ignorado', async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on, { pages: 1 })
  await show($)
  calls.emit({ type: 'narration', on: 'x' })
  await clock.settle()
  expect(calls.cmds.length).toBe(1)
  expect(calls.store.has('narration')).toBe(false)
})

test('narrationOn ignora valores salvos malformados', () => {
  for (const bad of [null, 'x', 5, {}, { on: 'x', option: 'ligada' }, { on: false }, { option: 'ligada' }]) {
    expect(narrationOn('ligada', bad as never)).toBe(true)
  }
})
