import { test } from 'node:test'
import assert from 'node:assert/strict'
import { layerY, spreadOffsets, focusedLayers, hopPlan, itemXs } from '../scenes/camadas.js'

test('layerY decrescente, de cima para baixo, centrado', () => {
  for (let n = 1; n <= 8; n++) {
    for (let i = 1; i < n; i++) assert.ok(layerY(i, n) < layerY(i - 1, n))
    assert.ok(Math.abs(layerY(0, n) + layerY(n - 1, n)) < 1e-9)
  }
})

test('spreadOffsets afasta as placas acima e abaixo do foco', () => {
  assert.deepEqual(spreadOffsets(5, [2], 1), [1, 1, 0, -1, -1])
  assert.deepEqual(spreadOffsets(5, [1, 2], 1), [1, 0, 0, -1, -1])
  assert.deepEqual(spreadOffsets(3, [], 1), [0, 0, 0])
  assert.deepEqual(spreadOffsets(3, [0, 2], 1), [0, 0, 0])
})

test('focusedLayers ignora ids que não são placas', () => {
  const layers = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  assert.deepEqual(focusedLayers(layers, ['c', 'x', 'a']), [0, 2])
  assert.deepEqual(focusedLayers(layers, undefined), [])
})

test('hopPlan sobe ou desce entre placas e ignora ids desconhecidos', () => {
  const ids = ['a', 'b', 'c']
  const plan = hopPlan(ids, [['a', 'c'], ['c', 'b'], ['a', 'zzz'], 'x'])
  assert.equal(plan.length, 2)
  assert.equal(plan[0].dir, -1) // desce: y diminui
  assert.equal(plan[1].dir, 1) // sobe
  assert.ok(plan[1].delayMs > plan[0].delayMs)
})

test('itemXs centrado e dentro da placa', () => {
  for (const n of [1, 2, 5, 9]) {
    const xs = itemXs(n)
    assert.equal(xs.length, n)
    assert.ok(Math.abs(xs[0] + xs[n - 1]) < 1e-9)
    assert.ok(Math.max(...xs.map(Math.abs)) < 4.5)
  }
})
