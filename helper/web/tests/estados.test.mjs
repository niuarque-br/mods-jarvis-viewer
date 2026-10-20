import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ringPositions, pathEdges, transitionBend, entryArrow } from '../scenes/estados.js'

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])

test('ringPositions: equidistantes no anel', () => {
  for (const n of [3, 4, 5, 8, 12]) {
    const p = ringPositions(n)
    assert.equal(p.length, n)
    const r = Math.hypot(p[0][0], p[0][1])
    for (const q of p) assert.ok(Math.abs(Math.hypot(q[0], q[1]) - r) < 1e-9)
    const d = dist(p[0], p[1])
    for (let i = 0; i < n; i++) assert.ok(Math.abs(dist(p[i], p[(i + 1) % n]) - d) < 1e-9, `n=${n} i=${i}`)
    assert.ok(d >= 2.9, `vizinhos longe o bastante (n=${n}, d=${d})`)
  }
})

test('ringPositions: casos pequenos', () => {
  assert.deepEqual(ringPositions(0), [])
  assert.deepEqual(ringPositions(1), [[0, 0, 0]])
  assert.equal(ringPositions(2).length, 2)
})

test('pathEdges só com pares consecutivos', () => {
  assert.deepEqual(pathEdges(['a', 'b', 'a']), [['a', 'b'], ['b', 'a']])
  assert.deepEqual(pathEdges(['a']), [])
})

test('transitionBend: ida e volta curvam para lados opostos', () => {
  const ab = transitionBend([0, 0, 0], [4, 0, 0])
  const ba = transitionBend([4, 0, 0], [0, 0, 0])
  assert.ok(Math.abs(ab[1] + ba[1]) < 1e-9 && Math.abs(ab[1]) > 0.3)
  assert.ok(transitionBend([1, 1, 0], [1, 1, 0]).every(Number.isFinite))
})

test('entryArrow aponta de fora do anel para o estado', () => {
  const [from, to] = entryArrow([3, 0, 0])
  assert.ok(from[0] > to[0] && to[0] > 3)
  const solo = entryArrow([0, 0, 0])
  assert.ok(solo[0].every(Number.isFinite))
})
