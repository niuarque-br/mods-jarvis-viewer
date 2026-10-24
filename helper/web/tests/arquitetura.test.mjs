import { test } from 'node:test'
import assert from 'node:assert/strict'
import { arcSide, laneArc, nodePositions, hopPlan } from '../scenes/arquitetura.js'

test('arcSide: +1 para a direita, -1 para a esquerda', () => {
  assert.equal(arcSide([0, 0, 0], [4, 0, 0]), 1)
  assert.equal(arcSide([4, 0, 0], [0, 0, 0]), -1)
  assert.equal(arcSide(-2, 3), 1)
  assert.equal(arcSide(3, -2), -1)
})

test('arcSide aceita objetos {x, y, z} como Vector3', () => {
  assert.equal(arcSide({ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }), 1)
  assert.equal(laneArc({ x: 4, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }), -1)
})

test('arcSide: na mesma coluna, descer é ida', () => {
  assert.equal(arcSide([0, 0, 0], [0, -2.6, 0]), 1)
  assert.equal(arcSide([0, -2.6, 0], [0, 0, 0]), -1)
})

test('laneArc mantém o sinal e cresce com a distância', () => {
  assert.equal(laneArc([0, 0, 0], [4, 0, 0]), 1)
  assert.ok(laneArc([4, 0, 0], [-8, 0, 0]) < -1)
})

test('até 6 nós ficam em fila; acima disso, em camadas', () => {
  const mk = (n) => Array.from({ length: n }, (_, i) => ({ id: 'n' + i }))
  const six = nodePositions(mk(6), [])
  assert.equal(new Set([...six.values()].map((p) => p[1])).size, 1)
  const links = [0, 1, 2, 3, 4, 5].map((i) => ({ from: 'n' + i, to: 'n' + (i + 1) }))
  const seven = nodePositions(mk(7), links)
  assert.equal(seven.size, 7)
  assert.ok(new Set([...seven.values()].map((p) => p[1])).size > 1)
})

test('hops numa aresta inexistente ainda animam; id desconhecido é ignorado', () => {
  const pos = new Map([['a', [0, 0, 0]], ['b', [4, 0, 0]], ['c', [8, 0, 0]]])
  const plan = hopPlan(pos, [['a', 'c'], ['c', 'a'], ['a', 'zzz'], ['b', 'a']])
  assert.equal(plan.length, 3)
  assert.deepEqual(plan.map((h) => Math.sign(h.arc)), [1, -1, -1])
  assert.deepEqual(plan.map((h) => h.delayMs), [0, 900, 3 * 900])
})

import { pieceOptions as archPiece } from '../scenes/arquitetura.js'
import { escolherForma as escolher } from '../engine/pieces.js'

test('arquitetura: figura > shape do nó > estilo.forma da cena > caixa', () => {
  const sc = { estilo: { forma: 'esfera' } }
  const o = (n) => archPiece(n, sc)
  assert.equal(escolher({ figura: 'a/b:c' }, o({}).estilo, o({}).padrao).kind, 'figura')
  assert.deepEqual(escolher({ shape: 'cilindro' }, o({ shape: 'cilindro' }).estilo, o({ shape: 'cilindro' }).padrao), { kind: 'forma', forma: 'cilindro' })
  assert.deepEqual(escolher({}, o({}).estilo, o({}).padrao), { kind: 'forma', forma: 'esfera' })
  const plain = archPiece({}, {})
  assert.deepEqual(escolher({}, plain.estilo, plain.padrao), { kind: 'forma', forma: 'caixa' })
})

test('arquitetura: shape inválido do nó não anula estilo.forma da cena', () => {
  const o = archPiece({ shape: 'bola' }, { estilo: { forma: 'esfera' } })
  assert.deepEqual(escolher({ shape: 'bola' }, o.estilo, o.padrao), { kind: 'forma', forma: 'esfera' })
})
