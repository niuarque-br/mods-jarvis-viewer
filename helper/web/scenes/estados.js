// Cena «estados»: círculos num anel, transições curvas, laço próprio como um toro pequeno e uma seta de entrada
// no estado `initial`. O marcador pula pelo `path` do passo. Câmera de frente (planar).
// Não importa three: usa stage.THREE, então as funções puras abaixo rodam em `node --test`.
import { pathEdges, lastStop, createMarker, addArrowHead } from '../engine/flowkit.js'

export { pathEdges }

const PALETTE = [0xD97757, 0x5B8DEF, 0x36C5A0, 0xE5B94E, 0xB58AE6, 0xE86A92, 0x62C7E8, 0xE8ECF3]
const ACCENT = 0xD97757
const SEG_MS = 1000
const GAP_MS = 150
const SETTLE_MS = 700
const DIM = 0.22
const LIT = 0.9
const MIN_CHORD = 3.2 // distância mínima entre estados vizinhos no anel

// n posições equidistantes num anel centrado na origem (y para cima), a primeira no topo.
export function ringPositions(n) {
  if (n <= 0) return []
  if (n === 1) return [[0, 0, 0]]
  const r = Math.max(2.4, MIN_CHORD / (2 * Math.sin(Math.PI / n)))
  return Array.from({ length: n }, (_, i) => {
    const a = Math.PI / 2 - (i * 2 * Math.PI) / n
    return [r * Math.cos(a), r * Math.sin(a), 0]
  })
}

// Deslocamento [dx, dy] do ponto de controle da transição a→b: perpendicular ao segmento,
// de modo que ida e volta entre os mesmos estados curvam para lados opostos.
export function transitionBend(a, b) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) return [0, 0]
  const k = Math.min(1.1, 0.35 * len) / len
  return [-dy * k, dx * k]
}

// Seta de entrada: [início, ponta], vindo de fora do anel (direção centro→estado) até a borda do estado.
export function entryArrow(p) {
  let ux = p[0]
  let uy = p[1]
  const len = Math.hypot(ux, uy)
  if (len < 1e-6) { ux = -1; uy = 0 } else { ux /= len; uy /= len }
  return [
    [p[0] + ux * 2.5, p[1] + uy * 2.5, 0],
    [p[0] + ux * 1.05, p[1] + uy * 1.05, 0],
  ]
}

export function build(scene, stage) {
  const { THREE } = stage
  const states = Array.isArray(scene.states) ? scene.states : []
  const transitions = Array.isArray(scene.transitions) ? scene.transitions : []
  const steps = Array.isArray(scene.steps) ? scene.steps : []
  const ring = ringPositions(states.length)
  const vec = new Map(states.map((s, i) => [s.id, new THREE.Vector3(...ring[i])]))

  const pieces = new Map()
  const colors = new Map()
  states.forEach((s, i) => {
    const c = PALETTE[i % PALETTE.length]
    const color = stage.theme === 'light' && c === 0xE8ECF3 ? 0x6B7280 : c
    colors.set(s.id, color)
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.15, roughness: 0.35, metalness: 0.2 })
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.3, 48), mat)
    disc.rotation.x = Math.PI / 2 // disco de frente para a câmera
    const g = new THREE.Group()
    g.add(disc)
    g.position.copy(vec.get(s.id))
    stage.addPiece(s.id, g, { label: s.label, detail: s.detail, color })
    pieces.set(s.id, g)
  })

  // seta de entrada no estado inicial
  states.forEach((s) => {
    if (!s.initial) return
    const [from, to] = entryArrow(ring[states.indexOf(s)]).map((q) => new THREE.Vector3(...q))
    const curve = new THREE.LineCurve3(from, to)
    stage.scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 8, 0.035, 8), new THREE.MeshBasicMaterial({ color: stage.tubeColor })))
    addArrowHead(stage, curve, stage.tubeColor, 0.17, 1)
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 16), new THREE.MeshBasicMaterial({ color: stage.tubeColor }))
    dot.position.copy(from)
    stage.scene.add(dot)
  })

  // circunferência percorrível do laço próprio (no plano da tela)
  const loopCurve = (center, out) => ({
    getPoint(u, target = new THREE.Vector3()) {
      const a = Math.atan2(out.y, out.x) + Math.PI + u * 2 * Math.PI
      return target.set(center.x + Math.cos(a) * 0.5, center.y + Math.sin(a) * 0.5, 0)
    },
  })
  const outward = (v) => (v.lengthSq() < 1e-9 ? new THREE.Vector3(0, 1, 0) : v.clone().normalize())

  const edgeInfo = new Map() // "a>b" -> { curve, mats, level, want, label, lab, shown }
  for (const t of transitions) {
    const key = t.from + '>' + t.to
    const A = vec.get(t.from)
    const B = vec.get(t.to)
    if (edgeInfo.has(key) || !A || !B) continue
    let curve
    const mats = []
    const lab = new THREE.Group()
    if (t.from === t.to) {
      const out = outward(A)
      const center = A.clone().addScaledVector(out, 1.35)
      const torus = new THREE.Mesh(
        new THREE.TorusGeometry(0.5, 0.035, 12, 48),
        new THREE.MeshBasicMaterial({ color: stage.tubeColor, transparent: true, opacity: DIM }),
      )
      torus.position.copy(center)
      stage.scene.add(torus)
      mats.push(torus.material)
      curve = loopCurve(center, out)
      lab.position.copy(center).addScaledVector(out, 0.9)
    } else {
      const [bx, by] = transitionBend([A.x, A.y, 0], [B.x, B.y, 0])
      curve = new THREE.QuadraticBezierCurve3(A.clone(), A.clone().add(B).multiplyScalar(0.5).add(new THREE.Vector3(bx, by, 0)), B.clone())
      const tubeMat = new THREE.MeshBasicMaterial({ color: stage.tubeColor, transparent: true, opacity: DIM })
      stage.scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 32, 0.03, 8), tubeMat))
      mats.push(tubeMat, addArrowHead(stage, curve, stage.tubeColor, 1.0, DIM))
      lab.position.copy(curve.getPoint(0.5)).addScaledVector(outward(curve.getPoint(0.5)), 0.9) // para fora do anel, longe dos rótulos dos estados
    }
    lab.position.y += 1.5 // o palco põe o rótulo ~1,2 abaixo de um grupo vazio
    edgeInfo.set(key, { curve, mats, level: DIM, want: DIM, label: t.label || '', lab, shown: false })
  }
  const setLabel = (info, key, on) => {
    if (!info.label || info.shown === on) return
    info.shown = on
    stage.addPiece('transicao:' + key, info.lab, on ? { label: info.label } : {})
  }

  const marker = createMarker(stage, ACCENT)
  const off = stage.onFrame(() => {
    for (const info of edgeInfo.values()) {
      info.level += (info.want - info.level) * 0.1
      for (const m of info.mats) m.opacity = info.level
    }
  })

  const box = new THREE.Box3()
  for (const v of vec.values()) box.expandByPoint(v)
  box.expandByVector(new THREE.Vector3(3.2, 2.6, 0.5))
  stage.fit(box, { planar: true })

  // pulo entre estados sem transição declarada: arco simples
  const fallbackCurve = (a, b) => {
    const A = vec.get(a)
    const B = vec.get(b)
    if (a === b) return loopCurve(A.clone().addScaledVector(outward(A), 1.35), outward(A))
    const [bx, by] = transitionBend([A.x, A.y, 0], [B.x, B.y, 0])
    return new THREE.QuadraticBezierCurve3(A.clone(), A.clone().add(B).multiplyScalar(0.5).add(new THREE.Vector3(bx, by, 0)), B.clone())
  }

  let token = 0
  return {
    pieces,
    async play(stepIndex, step) {
      const my = ++token
      stage.focus(step && step.focus)
      const onPath = new Set(pathEdges(step && step.path).map(([a, b]) => a + '>' + b))
      for (const [key, info] of edgeInfo) {
        info.want = onPath.has(key) ? LIT : DIM
        setLabel(info, key, false)
      }
      const path = (step && Array.isArray(step.path) ? step.path : []).filter((id) => vec.has(id))
      if (!path.length) {
        const stop = lastStop(steps, stepIndex)
        marker.place(stop && vec.has(stop) ? vec.get(stop) : null)
        return stage.wait(SETTLE_MS)
      }
      marker.place(vec.get(path[0]))
      if (path.length < 2) return stage.wait(SETTLE_MS)
      const hops = pathEdges(path)
      const curves = hops.map(([a, b]) => (edgeInfo.get(a + '>' + b) || { curve: fallbackCurve(a, b) }).curve)
      await marker.travel(curves, {
        segMs: SEG_MS,
        gapMs: GAP_MS,
        onArrive: (k) => {
          if (my !== token) return
          const key = hops[k][0] + '>' + hops[k][1]
          const info = edgeInfo.get(key)
          if (info) setLabel(info, key, true)
        },
      })
      await stage.wait(SETTLE_MS)
    },
    dispose() {
      token++
      off()
      marker.dispose()
      edgeInfo.clear()
      pieces.clear()
    },
  }
}
