import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sequenceY, actorXs, revealedBy } from '../scenes/sequencia.js'

test('sequenceY estritamente decrescente', () => {
  for (let i = 0; i < 40; i++) assert.ok(sequenceY(i + 1) < sequenceY(i))
})

test('actorXs centrado e crescente', () => {
  const xs = actorXs(4)
  assert.equal(xs.length, 4)
  assert.ok(Math.abs(xs[0] + xs[3]) < 1e-9)
  for (let i = 1; i < 4; i++) assert.ok(xs[i] > xs[i - 1])
})

test('revealedBy acumula os highlights até o passo', () => {
  const steps = [{ highlight: ['m1'] }, {}, { highlight: ['m2', 'm3'] }]
  assert.deepEqual([...revealedBy(steps, 0)], ['m1'])
  assert.deepEqual([...revealedBy(steps, 1)], ['m1'])
  assert.deepEqual([...revealedBy(steps, 2)].sort(), ['m1', 'm2', 'm3'])
})

import { pieceOptions as seqPiece } from '../scenes/sequencia.js'

test('sequência: ator usa o padrão caixa e repassa estilo', () => {
  const o = seqPiece({ id: 'a' }, { estilo: { forma: 'pessoa' } })
  assert.equal(o.padrao, 'caixa')
  assert.equal(o.estilo.forma, 'pessoa')
})
