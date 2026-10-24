import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three.module.min.js'
import { escolherForma, makePiece, makeShape } from '../engine/pieces.js'
import { clearFigureCache } from '../engine/figure.js'

test('escolherForma: figura vence estilo.forma; estilo.forma vence padrão; padrão sem nada', () => {
  assert.deepEqual(escolherForma({ figura: 'tabler/outline:database' }, { forma: 'esfera' }, 'caixa'), { kind: 'figura', nome: 'tabler/outline:database' })
  assert.deepEqual(escolherForma({}, { forma: 'esfera' }, 'caixa'), { kind: 'forma', forma: 'esfera' })
  assert.deepEqual(escolherForma({}, {}, 'cilindro'), { kind: 'forma', forma: 'cilindro' })
  assert.deepEqual(escolherForma({}, undefined, undefined), { kind: 'forma', forma: 'caixa' })
  assert.deepEqual(escolherForma({ figura: '' }, { forma: 'bola' }, 'pessoa'), { kind: 'forma', forma: 'pessoa' })
})

function fakeStage() {
  const cbs = new Set()
  return {
    THREE, theme: 'dark', camera: new THREE.PerspectiveCamera(),
    onFrame: (cb) => { cbs.add(cb); return () => cbs.delete(cb) },
    now: () => 1000,
    tick: () => cbs.forEach((cb) => cb()),
    count: () => cbs.size,
  }
}

test('makeShape: orbe tem gaiola que gira; pessoa tem cabeça', () => {
  const orbe = makeShape(THREE, 'orbe', 0xffffff)
  assert.equal(orbe.spinners.length, 2)
  assert.equal(makeShape(THREE, 'pessoa', 0xffffff).group.children.length, 2)
  assert.equal(makeShape(THREE, 'octaedro', 0xffffff).spinners[0].ry, 0.012)
})

test('makePiece: figura inexistente cai na forma do padrão, sem lançar', async () => {
  clearFigureCache()
  globalThis.fetch = async () => ({ ok: false, status: 404 })
  const stage = fakeStage()
  const obj = await makePiece(stage, { figura: 'lucide/line:nao-existe' }, { estilo: { forma: 'esfera' }, padrao: 'cilindro', cor: 0xd97757 })
  assert.equal(obj.userData.fallback, true)
  let meshes = 0
  let cyl = false
  obj.traverse((o) => { if (o.isMesh) meshes++; if (o.geometry?.type === 'CylinderGeometry') cyl = true })
  assert.equal(meshes, 1)
  assert.ok(cyl)
  stage.tick() // o quadro roda sem erro
})

test('makePiece: estilo.forma sem figura desenha a forma pedida, com contorno e movimento', async () => {
  const stage = fakeStage()
  const obj = await makePiece(stage, { movimento: 'pulsar' }, { estilo: { forma: 'octaedro' }, padrao: 'caixa', cor: 0x5b8def, contorno: 'losango' })
  assert.equal(obj.userData.fallback, false)
  let oct = false
  let loop = false
  obj.traverse((o) => { if (o.geometry?.type === 'OctahedronGeometry') oct = true; if (o.isLineLoop) loop = true })
  assert.ok(oct && loop)
  obj.scale.setScalar(1.2) // foco
  stage.tick()
  const inner = obj.children[0]
  assert.ok(inner.scale.x !== 1 && Math.abs(inner.scale.x - 1) <= 0.1)
  assert.equal(obj.scale.x, 1.2) // o palco manda na escala externa
  obj.userData.dispose()
  assert.equal(stage.count(), 0)
})

test('makePiece: peça apagada fica neutra', async () => {
  const stage = fakeStage()
  const obj = await makePiece(stage, { movimento: 'girar' }, { padrao: 'caixa', cor: 0xffffff })
  obj.scale.setScalar(0.9)
  stage.tick()
  assert.equal(obj.children[0].scale.x, 1)
  assert.equal(obj.children[0].rotation.y, 0)
})
