import { test } from 'node:test'
import assert from 'node:assert/strict'
import { actionDuration, lerpPath, actionRoute, stateAt, particleOffsets } from '../scenes/metafora.js'

test('actionDuration é o máximo dos ms (padrão 1200)', () => {
  assert.equal(actionDuration([{ ms: 500 }, { ms: 2000 }, {}]), 2000)
  assert.equal(actionDuration([{}, { ms: 300 }]), 1200)
  assert.equal(actionDuration([{ ms: 300 }]), 300)
  assert.equal(actionDuration([]), 0)
  assert.equal(actionDuration(undefined), 0)
  assert.equal(actionDuration([null, { ms: 'x' }]), 1200) // ms inválido cai no padrão
})

test('lerpPath passa pelos pontos', () => {
  const p = [[0, 0, 0], [10, 0, 0], [10, 10, 0]]
  assert.deepEqual(lerpPath(p, 0), [0, 0, 0])
  assert.deepEqual(lerpPath(p, 0.5), [10, 0, 0])
  assert.deepEqual(lerpPath(p, 1), [10, 10, 0])
  assert.deepEqual(lerpPath(p, 0.25), [5, 0, 0])
  assert.deepEqual(lerpPath(p, 7), [10, 10, 0]) // t fora de 0..1 fica nas pontas
  assert.deepEqual(lerpPath(p, -1), [0, 0, 0])
})

test('lerpPath com 0 ou 1 ponto não quebra', () => {
  assert.deepEqual(lerpPath([], 0.5), [0, 0, 0])
  assert.deepEqual(lerpPath([[1, 2, 3]], 0.5), [1, 2, 3])
  assert.deepEqual(lerpPath(null, 0.5), [0, 0, 0])
})

test('actionRoute parte da posição atual; só mover/seguir deslocam', () => {
  assert.deepEqual(actionRoute([0, 0, 0], { do: 'mover', to: [2, 0, 0] }), [[0, 0, 0], [2, 0, 0]])
  assert.deepEqual(actionRoute([0, 0, 0], { do: 'seguir', path: [[1, 0, 0], [1, 1, 0]] }), [[0, 0, 0], [1, 0, 0], [1, 1, 0]])
  assert.deepEqual(actionRoute([0, 0, 0], { do: 'seguir', path: [[0, 0, 0], [1, 0, 0]] }), [[0, 0, 0], [1, 0, 0]]) // path que já começa no objeto
  assert.equal(actionRoute([0, 0, 0], { do: 'pulsar' }), null)
  assert.equal(actionRoute([0, 0, 0], { do: 'mover' }), null)
})

const OBJECTS = [
  { id: 'a', shape: 'caixa', pos: [0, 0, 0] },
  { id: 'b', shape: 'esfera', pos: [5, 0, 0] },
  { id: 'c', shape: 'cone', pos: [0, 3, 0] },
]
const STEPS = [
  { say: '1', actions: [{ target: 'a', do: 'mover', to: [1, 0, 0] }, { target: 'b', do: 'aparecer' }] },
  { say: '2', actions: [{ target: 'a', do: 'seguir', path: [[1, 1, 0], [2, 2, 0]] }, { target: 'c', do: 'sumir' }] },
  { say: '3', actions: [{ target: 'b', do: 'sumir' }, { target: 'fantasma', do: 'mover', to: [9, 9, 9] }, { target: 'a', do: 'pulsar' }] },
]

test('stateAt: inicial + ações dos passos anteriores aplicadas na hora', () => {
  const s0 = stateAt(OBJECTS, STEPS, 0)
  assert.deepEqual(s0.get('a'), { pos: [0, 0, 0], visible: true })
  assert.equal(s0.get('b').visible, false) // a 1ª ação de b é aparecer
  assert.equal(s0.get('c').visible, true) // a 1ª ação de c é sumir: começa visível
  const s1 = stateAt(OBJECTS, STEPS, 1)
  assert.deepEqual(s1.get('a').pos, [1, 0, 0])
  assert.equal(s1.get('b').visible, true)
  const s3 = stateAt(OBJECTS, STEPS, 3)
  assert.deepEqual(s3.get('a').pos, [2, 2, 0])
  assert.equal(s3.get('b').visible, false)
  assert.equal(s3.get('c').visible, false)
  assert.equal(s3.has('fantasma'), false) // alvo inexistente é ignorado
})

test('stateAt é idempotente e não depende da ordem das chamadas', () => {
  const direto = stateAt(OBJECTS, STEPS, 2)
  stateAt(OBJECTS, STEPS, 3)
  stateAt(OBJECTS, STEPS, 0)
  assert.deepEqual(stateAt(OBJECTS, STEPS, 2), direto)
  assert.deepEqual(stateAt(OBJECTS, STEPS, 99), stateAt(OBJECTS, STEPS, 3)) // além do fim = estado final
})

test('stateAt: objeto que some e volta, e que aparece depois de sumir, começa visível', () => {
  const objs = [{ id: 'x', shape: 'caixa', pos: [0, 0, 0] }]
  const steps = [{ say: 'a', actions: [{ target: 'x', do: 'sumir' }] }, { say: 'b', actions: [{ target: 'x', do: 'aparecer' }] }]
  assert.equal(stateAt(objs, steps, 0).get('x').visible, true)
  assert.equal(stateAt(objs, steps, 1).get('x').visible, false)
  assert.equal(stateAt(objs, steps, 2).get('x').visible, true)
})

test('stateAt tolera entradas malformadas', () => {
  assert.equal(stateAt(undefined, undefined, 0).size, 0)
  assert.equal(stateAt([{ id: 'q', pos: 'x' }], [{ actions: [null, 3, { target: 'q', do: 'mover', to: 'x' }] }], 1).get('q').pos.length, 3)
})

test('particleOffsets: 200 pontos dentro do raio, sempre os mesmos', () => {
  const a = particleOffsets(200, 2, 7)
  assert.equal(a.length, 600)
  for (let i = 0; i < 200; i++) assert.ok(Math.hypot(a[i * 3], a[i * 3 + 1], a[i * 3 + 2]) <= 2 + 1e-5)
  assert.deepEqual([...particleOffsets(200, 2, 7)], [...a])
  assert.notDeepEqual([...particleOffsets(200, 2, 8)], [...a])
})

import { usesFigure } from '../scenes/metafora.js'

test('metáfora: shape figura com nome usa figura; sem nome cai nas primitivas', () => {
  assert.equal(usesFigure({ shape: 'figura', figura: 'a/b:c' }), true)
  assert.equal(usesFigure({ shape: 'figura' }), false)
  assert.equal(usesFigure({ shape: 'caixa', figura: 'a/b:c' }), false)
})
