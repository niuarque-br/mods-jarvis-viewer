import { test } from 'node:test'
import assert from 'node:assert/strict'
import { row, grid, layered, tree, bounds, safeBounds } from '../engine/layout.js'

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

test('row centrado', () => assert.deepEqual(row(3, 4).map((p) => p[0]), [-4, 0, 4]))

test('row com 0 e 1 elemento', () => {
  assert.deepEqual(row(0, 4), [])
  assert.deepEqual(row(1, 4), [[0, 0, 0]])
})

test('grid centrado, linhas para baixo', () => {
  const g = grid(5, 3, 2)
  assert.equal(g.length, 5)
  assert.deepEqual(g.slice(0, 3).map((p) => p[0]), [-2, 0, 2])
  assert.ok(g[3][1] < g[0][1])
  const b = bounds(g)
  assert.ok(Math.abs(b.min[0] + b.max[0]) < 1e-9)
  assert.ok(Math.abs(b.min[1] + b.max[1]) < 1e-9)
})

function sample() {
  const nodes = Array.from({ length: 12 }, (_, i) => ({ id: 'n' + i }))
  const edges = [
    ['n0', 'n1'], ['n0', 'n2'], ['n0', 'n3'], ['n1', 'n4'], ['n1', 'n5'],
    ['n2', 'n5'], ['n2', 'n6'], ['n3', 'n6'], ['n4', 'n7'], ['n5', 'n7'],
    ['n5', 'n8'], ['n6', 'n9'], ['n7', 'n10'], ['n8', 'n10'], ['n9', 'n11'],
  ]
  return { nodes, edges }
}

test('layered: nenhum par de nós a menos de 1,5 unidade', () => {
  const { nodes, edges } = sample()
  const pos = layered(nodes, edges)
  assert.equal(pos.size, 12)
  const pts = [...pos.values()]
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) assert.ok(dist(pts[i], pts[j]) >= 1.5, `${i}-${j}`)
})

test('layered: aresta sempre desce de nível quando não há ciclo', () => {
  const { nodes, edges } = sample()
  const pos = layered(nodes, edges)
  for (const [a, b] of edges) assert.ok(pos.get(b)[1] < pos.get(a)[1], `${a}->${b}`)
})

test('layered: aceita ids simples e arestas em objeto', () => {
  const pos = layered(['a', 'b'], [{ from: 'a', to: 'b' }])
  assert.ok(pos.get('b')[1] < pos.get('a')[1])
})

test('layered: ciclo não trava', () => {
  const pos = layered([{ id: 'a' }, { id: 'b' }], [['a', 'b'], ['b', 'a']])
  assert.equal(pos.size, 2)
  assert.ok(dist(pos.get('a'), pos.get('b')) >= 1.5)
  const loop = layered(['x', 'y', 'z'], [['x', 'y'], ['y', 'z'], ['z', 'x'], ['x', 'x']])
  assert.equal(loop.size, 3)
})

test('layered: aresta para id desconhecido é ignorada', () => {
  assert.equal(layered(['a'], [['a', 'zzz']]).size, 1)
})

test('tree: filhos abaixo do pai e sem sobreposição', () => {
  const nodes = [
    { id: 'r' }, { id: 'a', parent: 'r' }, { id: 'b', parent: 'r' }, { id: 'c', parent: 'r' },
    { id: 'a1', parent: 'a' }, { id: 'a2', parent: 'a' }, { id: 'b1', parent: 'b' }, { id: 'c1', parent: 'c' }, { id: 'c2', parent: 'c' },
  ]
  const pos = tree(nodes)
  assert.equal(pos.size, nodes.length)
  for (const n of nodes) if (n.parent) assert.ok(pos.get(n.id)[1] < pos.get(n.parent)[1], n.id)
  const pts = [...pos.values()]
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) assert.ok(dist(pts[i], pts[j]) >= 1.5)
})

test('tree: aceita children, várias raízes e pai inexistente/ciclo', () => {
  const pos = tree([{ id: 'a', children: ['b'] }, { id: 'b' }, { id: 'c' }, { id: 'p', parent: 'q' }, { id: 'q', parent: 'p' }])
  assert.equal(pos.size, 5)
  assert.ok(pos.get('b')[1] < pos.get('a')[1])
})

test('bounds', () => {
  assert.deepEqual(bounds([[1, 2, 3], [-1, 5, 0]]), { min: [-1, 2, 0], max: [1, 5, 3] })
  assert.deepEqual(bounds([]), { min: [0, 0, 0], max: [0, 0, 0] })
})

test('safeBounds: vazio ou não finito devolve a caixa padrão', () => {
  for (const pts of [[], [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]], [[NaN, 0, 0]], undefined]) {
    const b = safeBounds(pts)
    assert.ok([...b.min, ...b.max].every(Number.isFinite))
    assert.ok(b.min[0] < b.max[0])
  }
  assert.deepEqual(safeBounds([[1, 2, 3], [-1, 5, 0], [NaN, 0, 0]]), { min: [-1, 2, 0], max: [1, 5, 3] })
})
