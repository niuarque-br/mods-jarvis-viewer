import { test } from 'node:test'
import assert from 'node:assert/strict'
import { markerLayout, stepTargets, cameraTargets, cameraCenter, MARKER_GAP, LABEL_W, WINDOW } from '../scenes/timeline.js'

test('12 eventos: marcos na ordem, sem sobreposição, rótulos do mesmo lado afastados', () => {
  const lay = markerLayout(12)
  assert.equal(lay.length, 12)
  for (let i = 1; i < lay.length; i++) assert.ok(lay[i].x - lay[i - 1].x >= MARKER_GAP - 1e-9, `marco ${i}`)
  for (let i = 0; i < lay.length; i++) {
    for (let j = i + 1; j < lay.length; j++) {
      if (lay[i].side === lay[j].side) assert.ok(Math.abs(lay[i].x - lay[j].x) >= LABEL_W, `rótulos ${i}/${j}`)
    }
  }
  assert.ok(Math.abs(lay[0].x + lay[11].x) < 1e-9) // centrado
  assert.deepEqual(markerLayout(0), [])
  assert.deepEqual(markerLayout(1), [{ x: 0, side: 1 }])
})

const events = ['a', 'b', 'c', 'd'].map((id) => ({ id, date: '2020', label: id }))

test('stepTargets: highlight primeiro, depois focus; ids desconhecidos ignorados', () => {
  assert.deepEqual(stepTargets(events, { highlight: ['c'], focus: ['a'] }), [2])
  assert.deepEqual(stepTargets(events, { focus: ['b', 'zzz'] }), [1])
  assert.deepEqual(stepTargets(events, { highlight: ['zzz'], focus: ['d'] }), [3])
  assert.deepEqual(stepTargets(events, {}), [])
  assert.deepEqual(stepTargets(undefined, undefined), [])
})

test('cameraTargets carrega o último alvo; idempotente por índice', () => {
  const steps = [{ say: 'x' }, { highlight: ['b'] }, { say: 'y' }, { focus: ['d'] }]
  assert.deepEqual(cameraTargets(events, steps, 0), [])
  assert.deepEqual(cameraTargets(events, steps, 2), [1])
  assert.deepEqual(cameraTargets(events, steps, 3), [3])
  assert.deepEqual(cameraTargets(events, steps, 99), [3])
  assert.deepEqual(cameraTargets(events, steps, 2), cameraTargets(events, steps, 2))
})

test('cameraCenter: linha curta fica no meio; longa segue o alvo sem sair das pontas', () => {
  const short = markerLayout(3).map((m) => m.x)
  assert.equal(cameraCenter(short, short[2]), 0)
  const xs = markerLayout(12).map((m) => m.x)
  assert.ok(cameraCenter(xs, xs[6]) === xs[6])
  const left = cameraCenter(xs, xs[0])
  assert.ok(left >= xs[0] && left < xs[6])
  assert.ok(cameraCenter(xs, xs[11]) <= xs[11])
  assert.ok(xs[11] - cameraCenter(xs, xs[11]) <= WINDOW / 2) // o último marco continua na janela
  assert.ok(Number.isFinite(cameraCenter(xs, NaN)) && Number.isFinite(cameraCenter([], 3)))
})
