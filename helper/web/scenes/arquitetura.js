// Cena «arquitetura»: o rascunho aprovado, generalizado. Nós em fila (até 6) ou em camadas (acima disso),
// arcos de ida em cima e de volta embaixo, e cada hop vira um pacote com rastro.
// Não importa three: usa stage.THREE, então as funções puras abaixo rodam em `node --test`.
import { row, layered } from '../engine/layout.js'

const PALETTE = [0xD97757, 0x5B8DEF, 0x36C5A0, 0xE8ECF3, 0xE5B94E, 0xB58AE6, 0xE86A92, 0x62C7E8]
const HOP_GAP_MS = 900
const HOP_MS = 1300
const SETTLE_MS = 900
const ROW_MAX = 6

// aceita [x, y, z], {x, y, z} (Vector3) ou só o x
const xOf = (p) => (Array.isArray(p) ? p[0] : typeof p === 'object' && p !== null ? p.x : p)
const yOf = (p) => (Array.isArray(p) ? p[1] : typeof p === 'object' && p !== null ? p.y : 0)

// +1 quando o destino fica à direita da origem (arco por cima), -1 quando fica à esquerda (por baixo).
// Na mesma coluna, descer conta como ida.
export function arcSide(from, to) {
  const dx = xOf(to) - xOf(from)
  if (dx > 0) return 1
  if (dx < 0) return -1
  return yOf(to) - yOf(from) <= 0 ? 1 : -1
}

// Arco com sinal: ligações longas arqueiam um pouco mais para não passar rente aos nós do meio.
export function laneArc(from, to) {
  const d = Math.hypot(xOf(to) - xOf(from), yOf(to) - yOf(from))
  return arcSide(from, to) * (1 + Math.min(Math.max(d - 4, 0) / 12, 0.7))
}

export function nodePositions(nodes, links) {
  const ids = nodes.map((n) => n.id)
  if (ids.length <= ROW_MAX) {
    const xs = row(ids.length, 4)
    return new Map(ids.map((id, i) => [id, xs[i]]))
  }
  return layered(nodes, links || [])
}

// Um pacote por hop, escalonado. Hop entre quaisquer ids conhecidos anima, haja ou não ligação; id desconhecido é ignorado.
export function hopPlan(positions, hops, gapMs = HOP_GAP_MS) {
  const out = []
  ;(hops || []).forEach((h, k) => {
    const a = Array.isArray(h) ? positions.get(h[0]) : undefined
    const b = Array.isArray(h) ? positions.get(h[1]) : undefined
    if (!a || !b) return
    out.push({ from: h[0], to: h[1], arc: laneArc(a, b), delayMs: k * gapMs })
  })
  return out
}

export function build(scene, stage) {
  const { THREE } = stage
  const nodes = Array.isArray(scene.nodes) ? scene.nodes : []
  const links = Array.isArray(scene.links) ? scene.links : []
  const pos = nodePositions(nodes, links)
  const vec = new Map([...pos].map(([id, p]) => [id, new THREE.Vector3(...p)]))

  // cor por grupo (quando há) ou por nó
  const groups = []
  const colorOf = (n, i) => {
    let k = i
    if (typeof n.group === 'string' && n.group) {
      if (!groups.includes(n.group)) groups.push(n.group)
      k = groups.indexOf(n.group)
    }
    const c = PALETTE[k % PALETTE.length]
    return stage.theme === 'light' && c === 0xE8ECF3 ? 0x6B7280 : c
  }

  const pieces = new Map()
  const spinners = []
  const colors = new Map()
  nodes.forEach((n, i) => {
    const color = colorOf(n, i)
    colors.set(n.id, color)
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.15, roughness: 0.35, metalness: 0.2 })
    const g = new THREE.Group()
    const shape = n.shape || 'caixa'
    let mesh
    if (shape === 'esfera') mesh = new THREE.Mesh(new THREE.SphereGeometry(0.8, 40, 40), mat)
    else if (shape === 'octaedro') mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.85), mat)
    else if (shape === 'cilindro') mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.2, 40), mat)
    else if (shape === 'orbe') {
      mesh = new THREE.Mesh(new THREE.SphereGeometry(0.75, 48, 48), mat)
      const cage = new THREE.Mesh(
        new THREE.IcosahedronGeometry(1.05, 1),
        new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.35 }),
      )
      g.add(cage)
      spinners.push({ o: cage, ry: 0, rx: 0.004 })
    } else if (shape === 'pessoa') {
      mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.6, 8, 24), mat)
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 32, 32), mat)
      head.position.y = 0.95
      g.add(head)
      mesh.position.y = -0.2
    } else mesh = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.15, 1.15), mat)
    g.add(mesh)
    g.position.copy(vec.get(n.id))
    spinners.push({ o: g, ry: shape === 'octaedro' ? 0.012 : 0.003, rx: 0 })
    stage.addPiece(n.id, g, { label: n.label, sub: n.sub, detail: n.detail, color })
    pieces.set(n.id, g)
  })

  // ligações: tubos finos; ida por cima, volta por baixo
  const tubes = new Map() // "a>b" -> { mat, until }
  for (const l of links) {
    const A = vec.get(l.from)
    const B = vec.get(l.to)
    if (!A || !B) continue
    const arc = laneArc(A, B)
    const mid = A.clone().add(B).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.95 * arc, 0.4 * arc))
    const curve = new THREE.QuadraticBezierCurve3(A.clone(), mid, B.clone())
    const mat = new THREE.MeshBasicMaterial({ color: stage.tubeColor, transparent: true, opacity: 0.18 })
    stage.scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.025, 8), mat))
    tubes.set(l.from + '>' + l.to, { mat, until: 0 })
    if (l.label) {
      const lab = new THREE.Group()
      lab.position.copy(curve.getPoint(0.5))
      lab.position.y += arc > 0 ? 0.5 : -0.1
      stage.addPiece('link:' + l.from + '>' + l.to, lab, { label: l.label })
    }
  }

  const off = stage.onFrame(() => {
    const now = stage.now()
    for (const s of spinners) { s.o.rotation.y += s.ry; s.o.rotation.x += s.rx }
    for (const t of tubes.values()) t.mat.opacity += ((now < t.until ? 0.85 : 0.18) - t.mat.opacity) * 0.1
  })

  const box = new THREE.Box3()
  for (const v of vec.values()) box.expandByPoint(v)
  box.expandByVector(new THREE.Vector3(1.4, 1.4, 1.2))
  stage.fit(box)

  return {
    pieces,
    async play(stepIndex, step) {
      stage.focus(step && step.focus)
      const plan = hopPlan(vec, step && step.hops)
      if (!plan.length) return stage.wait(700)
      const now = stage.now()
      const runs = plan.map((h) => {
        const t = tubes.get(h.from + '>' + h.to) || tubes.get(h.to + '>' + h.from)
        if (t) t.until = Math.max(t.until, now + h.delayMs + HOP_MS)
        return stage.packet(vec.get(h.from), vec.get(h.to), { color: colors.get(h.from), arc: h.arc, delayMs: h.delayMs, ms: HOP_MS })
      })
      await Promise.all(runs)
      await stage.wait(SETTLE_MS)
    },
    dispose() {
      off()
      pieces.clear()
    },
  }
}
