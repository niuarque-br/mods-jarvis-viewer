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

import { pieceOptions as treePiece, treePositions } from '../scenes/arvore.js'

test('árvore horizontal: raiz à esquerda e x cresce com a profundidade', () => {
  const h = treePositions(nodes, { arranjo: 'horizontal' })
  assert.ok(h.get('r')[0] < h.get('a')[0] && h.get('a')[0] < h.get('b')[0])
  assert.equal(h.get('a')[0], h.get('c')[0])
  const v = treePositions(nodes, undefined)
  assert.ok(v.get('r')[1] > v.get('a')[1])
})

test('árvore: padrão esfera, estilo.forma e figura respeitados', () => {
  const o = treePiece({}, { estilo: { forma: 'caixa' } })
  assert.equal(o.padrao, 'esfera')
  assert.equal(o.estilo.forma, 'caixa')
})
