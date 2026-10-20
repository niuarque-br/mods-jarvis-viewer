// Cena «timeline»: linha horizontal com os marcos na ordem dada, rótulos alternando em cima e embaixo
// (sem sobreposição) e uma câmera que desliza até o marco do `focus`/`highlight`. Quase plana.
// Não importa three: usa stage.THREE, então as funções puras abaixo rodam em `node --test`.
import { ease, stagger, clamp01 } from './grafico.js'

export const MARKER_GAP = 3.0 // distância mínima entre marcos vizinhos
export const LABEL_W = 4.8 // largura reservada para um rótulo
export const WINDOW = 18 // largura visível da câmera
const PALETTE = [0xD97757, 0x5B8DEF, 0x36C5A0, 0xE5B94E, 0xB58AE6, 0xE86A92, 0x62C7E8]
const ACCENT = 0xD97757
const GROW_MS = 1100
const PACKET_MS = 900
const SETTLE_MS = 700

// Marcos na ordem dada, centrados em 0; lados alternados (cima/baixo), então marcos do mesmo lado ficam a 2 × MARKER_GAP.
export function markerLayout(n) {
  const count = Math.max(0, n | 0)
  return Array.from({ length: count }, (_, i) => ({ x: (i - (count - 1) / 2) * MARKER_GAP, side: i % 2 === 0 ? 1 : -1 }))
}

// Índices dos marcos citados no passo (highlight primeiro; sem ele, focus). Ids desconhecidos são ignorados.
export function stepTargets(events, step) {
  const idx = new Map((Array.isArray(events) ? events : []).map((e, i) => [e && e.id, i]))
  const pick = (list) => [...new Set((Array.isArray(list) ? list : []).map((id) => idx.get(id)).filter((i) => i !== undefined))]
  const hl = pick(step && step.highlight)
  return hl.length ? hl : pick(step && step.focus)
}

// Marcos em foco ao chegar no passo `i`: os do último passo (até i) que cita algum; [] antes disso.
export function cameraTargets(events, steps, i) {
  for (let k = Math.min(i, (steps || []).length - 1); k >= 0; k--) {
    const t = stepTargets(events, steps[k])
    if (t.length) return t
  }
  return []
}

// Centro x da câmera: em cima de `x`, sem sair da linha; se a linha toda cabe na janela, fica no meio.
export function cameraCenter(xs, x, win = WINDOW) {
  if (!xs.length) return 0
  const first = xs[0]
  const last = xs[xs.length - 1]
  if (last - first + 2 <= win) return (first + last) / 2
  const lo = first + win / 2 - 1
  const hi = last - win / 2 + 1
  const want = Number.isFinite(x) ? x : first
  return Math.min(Math.max(want, lo), hi)
}

export function build(scene, stage) {
  const { THREE } = stage
  const events = (Array.isArray(scene.events) ? scene.events : []).filter((e) => e && typeof e === 'object')
  const steps = Array.isArray(scene.steps) ? scene.steps : []
  const lay = markerLayout(events.length)
  const xs = lay.map((m) => m.x)
  const x0 = xs.length ? xs[0] - 1.2 : -1
  const x1 = xs.length ? xs[xs.length - 1] + 1.2 : 1
  const TOP = 2.4
  const BOTTOM = -2.1
  const ink = stage.theme === 'light' ? 0x39414f : 0xaab3c5

  const thin = (len, w, mat) => {
    const geo = new THREE.BoxGeometry(1, w, w)
    geo.translate(0.5, 0, 0)
    const m = new THREE.Mesh(geo, mat)
    m.scale.x = len
    return m
  }
  const baseMat = new THREE.MeshBasicMaterial({ color: stage.tubeColor, transparent: true, opacity: 0.5 })
  const baseLine = thin(x1 - x0, 0.06, baseMat)
  baseLine.position.set(x0, 0, 0)
  stage.scene.add(baseLine)
  const fillMat = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.95 })
  const fill = thin(1e-4, 0.1, fillMat)
  fill.position.set(xs.length ? xs[0] : 0, 0, 0.02)
  stage.scene.add(fill)

  const pieces = new Map()
  const anims = []
  events.forEach((e, i) => {
    const color = PALETTE[i % PALETTE.length]
    const m = lay[i]
    const g = new THREE.Group()
    g.position.set(m.x, 0, 0)
    const geo = new THREE.CylinderGeometry(0.28, 0.28, 0.14, 28)
    geo.rotateX(Math.PI / 2)
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.15, roughness: 0.4, metalness: 0.1 }))
    g.add(mesh)
    stage.addPiece(e.id, g, { detail: e.detail })
    pieces.set(e.id, g)
    anims.push((p) => mesh.scale.setScalar(Math.max(ease(stagger(p, i, events.length)), 1e-4)))
    // haste e rótulo (o palco põe o texto ~1,2 abaixo de um grupo vazio, com o topo no y pedido)
    const textTop = m.side > 0 ? 2.05 : -1.3
    const stemMat = new THREE.MeshBasicMaterial({ color: ink, transparent: true, opacity: 0.4 })
    const stem = thin(m.side > 0 ? 1.1 : 0.9, 0.03, stemMat) // acaba logo antes do texto
    stem.rotation.z = m.side > 0 ? Math.PI / 2 : -Math.PI / 2
    stem.position.set(m.x, m.side > 0 ? 0.3 : -0.3, 0)
    stage.scene.add(stem)
    const lab = new THREE.Group()
    lab.position.set(m.x, textTop + 1.2, 0)
    stage.addPiece('lbl:' + e.id, lab, { label: e.label, sub: e.date, color })
  })

  // câmera
  let camCur = cameraCenter(xs, NaN)
  let camWant = camCur
  const frameBox = (cx) => new THREE.Box3(new THREE.Vector3(cx - WINDOW / 2, BOTTOM, -0.5), new THREE.Vector3(cx + WINDOW / 2, TOP, 0.5))
  stage.fit(frameBox(camCur), { planar: true })
  let fillWant = 0
  let fillCur = 0
  const grow = { start: performance.now() }

  const off = stage.onFrame((t, nowMs) => {
    const p = clamp01((nowMs - grow.start) / GROW_MS)
    for (const a of anims) a(p)
    baseLine.scale.x = Math.max((x1 - x0) * ease(p), 1e-4)
    fillCur += (fillWant - fillCur) * 0.08
    fill.scale.x = Math.max(fillCur, 1e-4)
    if (Math.abs(camWant - camCur) > 0.005) {
      camCur += (camWant - camCur) * 0.09
      stage.fit(frameBox(camCur), { planar: true })
    } else if (camCur !== camWant) {
      camCur = camWant
      stage.fit(frameBox(camCur), { planar: true })
    }
  })

  let token = 0
  const meanX = (idx) => (idx.length ? idx.reduce((s, i) => s + xs[i], 0) / idx.length : NaN)
  return {
    pieces,
    async play(stepIndex, step) {
      const my = ++token
      const own = stepTargets(events, step)
      const carried = cameraTargets(events, steps, stepIndex)
      const ids = own.flatMap((i) => [events[i].id, 'lbl:' + events[i].id])
      stage.focus(ids.length ? ids : undefined)
      camWant = cameraCenter(xs, meanX(carried))
      fillWant = carried.length ? Math.max(...carried.map((i) => xs[i])) - xs[0] : 0

      const growing = stepIndex === 0
      grow.start = growing ? stage.now() : -Infinity
      const prev = stepIndex > 0 ? cameraTargets(events, steps, stepIndex - 1) : []
      const from = prev.length ? Math.max(...prev.map((i) => xs[i])) : xs[0]
      const to = carried.length ? Math.max(...carried.map((i) => xs[i])) : from
      if (!growing && own.length && my === token && Math.abs(to - from) > 0.01) {
        await Promise.all([
          stage.packet(new THREE.Vector3(from, 0, 0.1), new THREE.Vector3(to, 0, 0.1), { arc: 0, ms: PACKET_MS }),
        ])
        return stage.wait(SETTLE_MS)
      }
      return stage.wait(growing ? GROW_MS + 300 : 700)
    },
    dispose() {
      token++
      off()
      anims.length = 0
      pieces.clear()
    },
  }
}
