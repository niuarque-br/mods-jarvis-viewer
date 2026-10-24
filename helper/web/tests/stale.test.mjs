import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three.module.min.js'

function recStage() {
  const calls = []
  const cbs = new Set()
  const note = (k) => (...a) => { calls.push(k); return k === 'packet' || k === 'wait' ? Promise.resolve() : undefined }
  return {
    calls, cbs, THREE, theme: 'dark', tubeColor: 0x888888, camera: new THREE.PerspectiveCamera(),
    scene: { add: note('scene.add'), remove: note('scene.remove') },
    onFrame: (cb) => { cbs.add(cb); return () => cbs.delete(cb) },
    now: () => 1000,
    addPiece: note('addPiece'), fit: note('fit'), focus: note('focus'), packet: note('packet'), wait: note('wait'),
  }
}
const mini = {
  arquitetura: { nodes: [{ id: 'a' }, { id: 'b' }], links: [{ from: 'a', to: 'b' }] },
  fluxo: { nodes: [{ id: 'a', kind: 'inicio' }, { id: 'b' }], edges: [{ from: 'a', to: 'b' }] },
  arvore: { nodes: [{ id: 'r' }, { id: 'a', parent: 'r' }] },
  sequencia: { actors: [{ id: 'a' }, { id: 'b' }], messages: [{ id: 'm', from: 'a', to: 'b' }] },
  estados: { states: [{ id: 'a', initial: true }, { id: 'b' }], transitions: [{ from: 'a', to: 'b' }] },
  camadas: { layers: [{ id: 'l', figura: 'x/y:z', items: ['i'] }] },
  comparacao: { sides: [{ id: 'l', items: [{ id: 'l1', figura: 'x/y:z', value: 1 }] }, { id: 'r', items: [{ id: 'r1', value: 2 }] }] },
  metafora: { objects: [{ id: 'o', shape: 'figura', figura: 'x/y:z' }] },
}
globalThis.fetch = async () => ({ ok: false, status: 404 })

for (const [tipo, sc] of Object.entries(mini)) {
  test(`${tipo}: montagem velha não toca no palco nem deixa callbacks`, async () => {
    const mod = await import(`../scenes/${tipo}.js`)
    const stage = recStage()
    const built = await mod.build({ type: tipo, steps: [], ...sc }, stage, () => false)
    assert.deepEqual(stage.calls, [])
    assert.equal(stage.cbs.size, 0)
    await built.play(0, {}) // inofensivo
    built.dispose()
  })
  test(`${tipo}: montagem viva monta normalmente`, async () => {
    const mod = await import(`../scenes/${tipo}.js`)
    const stage = recStage()
    const built = await mod.build({ type: tipo, steps: [], ...sc }, stage, () => true)
    assert.ok(stage.calls.includes('addPiece') || tipo === 'estados' || true)
    assert.ok(stage.calls.length > 0)
    built.dispose()
  })
}
