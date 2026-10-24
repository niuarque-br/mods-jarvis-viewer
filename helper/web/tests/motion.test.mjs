import { test } from 'node:test'
import assert from 'node:assert/strict'
import { motionAt, intensidade, MOVIMENTOS } from '../engine/motion.js'

test('intensidade por estado', () => {
  assert.equal(intensidade('foco'), 1)
  assert.equal(intensidade('normal'), 0.4)
  assert.equal(intensidade('apagada'), 0)
  assert.equal(intensidade(undefined), 0.4)
})

test('motionAt é periódico e limitado', () => {
  assert.ok(motionAt('girar', 2).rotY > motionAt('girar', 1).rotY)
  for (let t = 0; t < 20; t += 0.07) {
    const p = motionAt('pulsar', t, { intensidade: 1 })
    assert.ok(p.scale >= 0.9 - 1e-9 && p.scale <= 1.1 + 1e-9)
    const r = motionAt('respirar', t)
    assert.ok(r.scale >= 0.95 - 1e-9 && r.scale <= 1.05 + 1e-9)
    const b = motionAt('balancar', t)
    assert.ok(Math.abs(b.rotY) <= 0.35 + 1e-9)
    const s = motionAt('subir', t)
    assert.ok(s.dy >= 0 && s.dy <= 0.35 && s.opacity > 0 && s.opacity <= 1)
    const k = motionAt('piscar', t)
    assert.ok(k.opacity >= 0.3 - 1e-9 && k.opacity <= 1)
  }
  assert.ok(Math.abs(motionAt('pulsar', 0.3).scale - motionAt('pulsar', 0.3 + 1.2).scale) < 1e-9)
  assert.ok(Math.abs(motionAt('subir', 0.5).dy - motionAt('subir', 0.5 + 2.4).dy) < 1e-9)
})

test('intensidade 0 (apagada) deixa tudo neutro; tipo desconhecido também', () => {
  for (const tipo of [...MOVIMENTOS, 'xyz', undefined]) {
    assert.deepEqual(motionAt(tipo, 3.7, { intensidade: 0 }), { rotY: 0, scale: 1, dy: 0, opacity: 1 })
  }
  assert.deepEqual(motionAt('xyz', 3.7), { rotY: 0, scale: 1, dy: 0, opacity: 1 })
})

test('menos intensidade, menos amplitude', () => {
  const full = Math.abs(motionAt('pulsar', 0.3, { intensidade: 1 }).scale - 1)
  const low = Math.abs(motionAt('pulsar', 0.3, { intensidade: 0.4 }).scale - 1)
  assert.ok(low < full && low > 0)
})
