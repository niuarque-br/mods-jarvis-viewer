import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pairOf, sharedScale, barSpan, rowY, sideDigits, valueText } from '../scenes/comparacao.js'

const sides = [
  { id: 'a', label: 'A', items: [{ id: 'a1', value: 10 }, { id: 'a2', value: -40 }, { id: 'a3', value: 'rápido' }] },
  { id: 'b', label: 'B', items: [{ id: 'b1', value: 25 }, { id: 'b2' }] },
]

test('pairOf acha o item de mesmo índice no outro lado', () => {
  assert.equal(pairOf(sides, 'a1'), 'b1')
  assert.equal(pairOf(sides, 'b2'), 'a2')
  assert.equal(pairOf(sides, 'a3'), null) // o outro lado não tem o 3º item
  assert.equal(pairOf(sides, 'zzz'), null)
  assert.equal(pairOf([], 'a1'), null)
})

test('sharedScale é o máximo absoluto dos dois lados', () => {
  assert.equal(sharedScale(sides), 40)
  assert.equal(sharedScale([{ items: [{ value: 3 }] }, { items: [{ value: -7 }] }]), 7)
})

test('sharedScale ignora texto e vale 0 sem números', () => {
  assert.equal(sharedScale([{ items: [{ value: 'x' }] }, { items: [{}] }]), 0)
  assert.equal(sharedScale(null), 0)
  assert.equal(sharedScale([{ items: [{ value: NaN }] }, { items: [{ value: Infinity }] }]), 0)
})

test('barSpan: mesma escala dá mesmo comprimento nos dois lados; parte do zero', () => {
  const a = barSpan(20, 40, false, 4)
  const b = barSpan(20, 40, false, 4)
  assert.equal(a.len, b.len)
  assert.equal(a.len, 2)
  assert.equal(a.x0, -2)
  assert.equal(barSpan(40, 40, false, 4).len, 4)
  const neg = barSpan(-20, 40, true, 4)
  assert.equal(neg.x0, 0)
  assert.equal(neg.dir, -1)
  assert.equal(neg.len, 1)
  assert.equal(barSpan(5, 0, false, 4).len, 0) // sem escala não divide por zero
})

test('rowY estritamente decrescente', () => {
  for (let i = 1; i < 12; i++) assert.ok(rowY(i) < rowY(i - 1))
})

test('valores pequenos mantêm as casas da escala (0,004 não vira "0")', () => {
  const small = [{ items: [{ value: 0.004 }, { value: 0.002 }] }, { items: [{ value: 0.003 }] }]
  const d = sideDigits(small)
  assert.ok(d >= 3)
  assert.equal(valueText(0.004, d), '0,004')
  assert.equal(valueText(0.002, d), '0,002')
  assert.equal(sideDigits(sides), 2) // escala grande: o padrão de 2 casas
  assert.equal(valueText('rápido', 2), 'rápido')
  assert.equal(valueText(undefined, 2), undefined)
})

import { figureX } from '../scenes/comparacao.js'

test('comparação: a figura do item fica à esquerda da trilha, pequena', () => {
  assert.ok(figureX(-3.5) < -3.5 - 2.5)
  assert.ok(figureX(3.5) < 3.5 - 2.5)
})
