import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rootPath, pathEdges, depthOf, growDelay } from '../scenes/arvore.js'

const nodes = [
  { id: 'r' },
  { id: 'a', parent: 'r' },
  { id: 'b', parent: 'a' },
  { id: 'c', parent: 'r' },
]

test('rootPath vai da raiz até o nó', () => {
  assert.deepEqual(rootPath(nodes, 'b'), ['r', 'a', 'b'])
  assert.deepEqual(rootPath(nodes, 'r'), ['r'])
  assert.deepEqual(rootPath(nodes, 'c'), ['r', 'c'])
})

test('rootPath: id desconhecido ou ciclo dão lista vazia', () => {
  assert.deepEqual(rootPath(nodes, 'zzz'), [])
  const loop = [{ id: 'x', parent: 'y' }, { id: 'y', parent: 'x' }]
  assert.deepEqual(rootPath(loop, 'x'), [])
  assert.deepEqual(rootPath(undefined, 'x'), [])
})

test('pathEdges do caminho da raiz só tem pai→filho consecutivos', () => {
  assert.deepEqual(pathEdges(rootPath(nodes, 'b')), [['r', 'a'], ['a', 'b']])
  assert.deepEqual(pathEdges(['r']), [])
})

test('depthOf e growDelay: ramos mais fundos brotam depois', () => {
  assert.equal(depthOf(nodes, 'r'), 0)
  assert.equal(depthOf(nodes, 'b'), 2)
  assert.ok(growDelay(2) > growDelay(1))
  assert.equal(growDelay(1), 0)
})
