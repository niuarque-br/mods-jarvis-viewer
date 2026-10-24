import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three.module.min.js'
import { escolherForma, makePiece, makeShape, estadoDoNivel } from '../engine/pieces.js'
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
  obj.userData.level = 1 // foco, como o stage escreve
  stage.tick()
  const inner = obj.children[0]
  assert.ok(inner.scale.x !== 1 && Math.abs(inner.scale.x - 1) <= 0.1)
  assert.equal(obj.scale.x, 1) // a escala externa é do palco
  obj.userData.dispose()
  assert.equal(stage.count(), 0)
})

test('makePiece: peça apagada fica neutra', async () => {
  const stage = fakeStage()
  const obj = await makePiece(stage, { movimento: 'girar' }, { padrao: 'caixa', cor: 0xffffff })
  obj.userData.level = 0.12 // apagada
  stage.tick()
  assert.equal(obj.children[0].scale.x, 1)
  assert.equal(obj.children[0].rotation.y, 0)
})

test('estadoDoNivel: nível do stage vira estado do movimento', () => {
  assert.equal(estadoDoNivel(1), 'foco')
  assert.equal(estadoDoNivel(0.35), 'normal')
  assert.equal(estadoDoNivel(0.12), 'apagada')
  assert.equal(estadoDoNivel(undefined), 'normal')
})

test('makePiece: contorno acompanha a câmera em órbita (losango não vira de lado)', async () => {
  const stage = fakeStage()
  const obj = await makePiece(stage, {}, { padrao: 'caixa', cor: 0xffffff, contorno: 'losango' })
  obj.position.set(2, 0, 0)
  const loop = []
  obj.traverse((o) => { if (o.isLineLoop) loop.push(o) })
  for (const yaw of [0, 0.9, 2.2]) {
    stage.camera.quaternion.setFromEuler(new THREE.Euler(0.2, yaw, 0))
    obj.rotation.y = 0.7 // a cena pode girar o grupo externo
    obj.updateMatrixWorld(true)
    stage.tick()
    obj.updateMatrixWorld(true)
    const wq = loop[0].getWorldQuaternion(new THREE.Quaternion())
    assert.ok(Math.abs(wq.dot(stage.camera.quaternion)) > 0.9999)
  }
})

test('makePiece: malhas opacas da forma não viram transparentes sem motivo', async () => {
  const stage = fakeStage()
  const obj = await makePiece(stage, { movimento: 'piscar' }, { padrao: 'caixa', cor: 0xffffff })
  let mat
  obj.traverse((o) => { if (o.isMesh) mat = o.material })
  obj.userData.level = 0.12 // apagada: opacidade 1
  stage.tick()
  assert.equal(mat.transparent, false)
  obj.userData.level = 1
  for (let i = 0; i < 1; i++) stage.tick()
})

test('makePiece: desenho de hoje vale sem estilo.forma e na queda da figura; estilo.forma o substitui', async () => {
  clearFigureCache()
  globalThis.fetch = async () => ({ ok: false, status: 404 })
  const marca = () => { const g = new THREE.Group(); g.userData.marca = true; g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial())); return g }
  const achou = (o) => { let f = false; o.traverse((c) => { if (c.userData.marca) f = true }); return f }
  assert.ok(achou(await makePiece(fakeStage(), {}, { padrao: 'esfera', desenho: marca })))
  assert.ok(achou(await makePiece(fakeStage(), { figura: 'x/y:z' }, { padrao: 'esfera', desenho: marca })))
  assert.ok(!achou(await makePiece(fakeStage(), {}, { estilo: { forma: 'caixa' }, padrao: 'esfera', desenho: marca })))
})

// ---- revisão final da branch ----
import { keepFigure } from '../engine/pieces.js'

function fakeImages() {
  globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => '<svg viewBox="0 0 1 1"><path stroke="currentColor"/></svg>' })
  globalThis.Image = class { set src(_) { setTimeout(() => this.onload?.(), 1) } get naturalWidth() { return 24 } get naturalHeight() { return 24 } }
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {} }) }) }
}

test('makePiece: figura fica opaca no nível normal e no foco; só a apagada escurece', async () => {
  clearFigureCache()
  fakeImages()
  const stage = fakeStage()
  const obj = await makePiece(stage, { figura: 'lucide/line:ok' }, { padrao: 'caixa', cor: 0xffffff })
  assert.equal(obj.userData.fallback, false)
  let plane
  obj.traverse((o) => { if (o.isMesh && o.geometry?.type === 'PlaneGeometry') plane = o })
  assert.ok(plane)
  for (const [lvl, want] of [[0.35, 1], [1, 1]]) {
    obj.userData.level = lvl
    stage.tick()
    assert.equal(plane.material.opacity, want, `nível ${lvl}`)
  }
  obj.userData.level = 0.12
  stage.tick()
  assert.ok(plane.material.opacity < 0.7)
  obj.userData.dispose()
  clearFigureCache()
})

test('keepFigure: figura que caiu na forma some (solta o quadro); a que carregou fica', () => {
  let freed = 0
  const caiu = { userData: { fallback: true, dispose: () => freed++ } }
  assert.equal(keepFigure(caiu), null)
  assert.equal(freed, 1)
  const ok = { userData: { fallback: false, dispose: () => freed++ } }
  assert.equal(keepFigure(ok), ok)
  assert.equal(freed, 1)
  assert.equal(keepFigure(null), null)
})
