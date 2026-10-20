import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pathEdges, lastStop, flowBend, markerPos } from '../scenes/fluxo.js'

test('pathEdges só com pares consecutivos', () => {
  assert.deepEqual(pathEdges(['a', 'b', 'c']), [['a', 'b'], ['b', 'c']])
  assert.deepEqual(pathEdges(['a']), [])
  assert.deepEqual(pathEdges([]), [])
  assert.deepEqual(pathEdges(undefined), [])
})

test('lastStop: onde o marcador descansa no passo i', () => {
  const steps = [{ say: 'x' }, { path: ['a', 'b'] }, { say: 'y' }, { path: ['b', 'c', 'd'] }, {}]
  assert.equal(lastStop(steps, 0), null)
  assert.equal(lastStop(steps, 1), 'b')
  assert.equal(lastStop(steps, 2), 'b')
  assert.equal(lastStop(steps, 4), 'd')
  assert.equal(lastStop(undefined, 3), null)
})

test('flowBend: descida de um nível é reta; retorno e salto desviam', () => {
  assert.deepEqual(flowBend([0, 0, 0], [0, -2.6, 0]), [0, 0])
  const back = flowBend([0, -5.2, 0], [0, 0, 0])
  assert.ok(back[0] > 0)
  const skip = flowBend([0, 0, 0], [0, -5.2, 0])
  assert.ok(skip[0] !== 0)
  assert.ok(flowBend([0, 0, 0], [3.2, 0, 0]).every(Number.isFinite))
})

test('markerPos percorre os segmentos em ordem e termina no fim do último', () => {
  assert.deepEqual(markerPos(0, 1000, 100, 50), { seg: -1, u: 0, done: true })
  assert.deepEqual(markerPos(2, 1000, 100, 0), { seg: 0, u: 0, done: false })
  assert.deepEqual(markerPos(2, 1000, 100, 500), { seg: 0, u: 0.5, done: false })
  assert.deepEqual(markerPos(2, 1000, 100, 1050), { seg: 0, u: 1, done: false })
  assert.deepEqual(markerPos(2, 1000, 100, 1600), { seg: 1, u: 0.5, done: false })
  assert.deepEqual(markerPos(2, 1000, 100, 5000), { seg: 1, u: 1, done: true })
})
