// Cena «arvore»: layout tree(); no primeiro passo os ramos brotam da raiz (mais fundos depois);
// `highlight` acende o caminho da raiz até o nó e manda pacotes descendo por ele. Câmera de frente (planar).
// Não importa three: usa stage.THREE, então as funções puras abaixo rodam em `node --test`.
import { tree, arrange } from '../engine/layout.js'
import { makePiece } from '../engine/pieces.js'
import { pathEdges } from '../engine/flowkit.js'

export { pathEdges }

const PALETTE = [0xD97757, 0x5B8DEF, 0x36C5A0, 0xE5B94E, 0xB58AE6, 0xE86A92]
const ACCENT = 0xD97757
const GROW_MS = 700
const GROW_STEP_MS = 650
const HOP_MS = 800
const SETTLE_MS = 700
const DIM = 0.35
const LIT = 0.95

// Caminho da raiz até `id` (inclusive). Id desconhecido ou ligado a um ciclo: [].
export function rootPath(nodes, id) {
  const parent = new Map()
  for (const n of Array.isArray(nodes) ? nodes : []) if (n && typeof n === 'object') parent.set(n.id, n.parent)
  if (!parent.has(id)) return []
  const out = []
  const seen = new Set()
  let cur = id
  while (cur !== undefined) {
    if (seen.has(cur) || !parent.has(cur)) return []
    seen.add(cur)
    out.push(cur)
    cur = parent.get(cur)
  }
  return out.reverse()
}

export function depthOf(nodes, id) {
  const p = rootPath(nodes, id)
  return p.length ? p.length - 1 : 0
}

// Atraso para o ramo que chega a um nó de profundidade `depth` (1 = filho da raiz) começar a brotar.
export function growDelay(depth) {
  return Math.max(0, depth - 1) * GROW_STEP_MS
}

export function pieceOptions(n, scene) {
  return { estilo: scene && scene.estilo, padrao: 'esfera' }
}

// Posições dos nós: filhos sob o pai, ou à direita dele com estilo.arranjo = 'horizontal'.
export function treePositions(nodes, estilo) {
  return arrange(tree(nodes), estilo)
}

export async function build(scene, stage) {
  const { THREE } = stage
  const nodes = Array.isArray(scene.nodes) ? scene.nodes : []
  const horiz = !!(scene.estilo && scene.estilo.arranjo === 'horizontal')
  const pos = treePositions(nodes, scene.estilo)
  const vec = new Map([...pos].map(([id, p]) => [id, new THREE.Vector3(...p)]))
  const depth = new Map(nodes.map((n) => [n.id, depthOf(nodes, n.id)]))

  const pieces = new Map()
  const cores = nodes.map((n) => PALETTE[depth.get(n.id) % PALETTE.length])
  const legacy = (d, color) => () => {
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.15, roughness: 0.35, metalness: 0.2 })
    const g = new THREE.Group()
    g.add(new THREE.Mesh(new THREE.SphereGeometry(d === 0 ? 0.75 : 0.55, 40, 40), mat))
    return g
  }
  const made = await Promise.all(nodes.map((n, i) => makePiece(stage, n, { ...pieceOptions(n, scene), cor: cores[i], desenho: legacy(depth.get(n.id), cores[i]) })))
  nodes.forEach((n, i) => {
    const color = cores[i]
    const g = made[i]
    g.position.copy(vec.get(n.id))
    stage.addPiece(n.id, g, { label: n.label, detail: n.detail, color })
    pieces.set(n.id, g)
  })

  // ramos: tubo do pai ao filho que cresce por drawRange
  const branches = new Map() // "pai>filho" -> { mat, geo, total, depth, prog, start, grow, want }
  for (const n of nodes) {
    const A = vec.get(n.parent)
    const B = vec.get(n.id)
    if (n.parent === undefined || !A || !B || branches.has(n.parent + '>' + n.id)) continue
    const curve = new THREE.QuadraticBezierCurve3(A.clone(), (horiz ? new THREE.Vector3((A.x + B.x) / 2 + 0.2, A.y, 0) : new THREE.Vector3(A.x, (A.y + B.y) / 2 + 0.2, 0)), B.clone())
    const geo = new THREE.TubeGeometry(curve, 24, 0.04, 8)
    const mat = new THREE.MeshBasicMaterial({ color: stage.tubeColor, transparent: true, opacity: DIM })
    stage.scene.add(new THREE.Mesh(geo, mat))
    branches.set(n.parent + '>' + n.id, { mat, geo, total: geo.index.count, depth: depth.get(n.id), prog: 1, start: 0, grow: false, level: DIM, want: DIM, lit: false })
  }
  const maxDepth = Math.max(0, ...depth.values())

  const off = stage.onFrame((t, nowMs) => {
    for (const b of branches.values()) {
      if (b.grow) b.prog = Math.max(0, Math.min(1, (nowMs - b.start) / GROW_MS))
      b.geo.setDrawRange(0, Math.ceil((b.total * b.prog) / 6) * 6)
      b.level += (b.want - b.level) * 0.1
      b.mat.opacity = b.level
    }
  })

  const box = new THREE.Box3()
  for (const v of vec.values()) box.expandByPoint(v)
  box.expandByVector(new THREE.Vector3(2.2, 1.4, 0.5))
  stage.fit(box, { planar: true })

  return {
    pieces,
    async play(stepIndex, step) {
      const marks = (step && Array.isArray(step.highlight) ? step.highlight : []).map((id) => rootPath(nodes, id)).filter((p) => p.length)
      const litKeys = new Set(marks.flatMap((p) => pathEdges(p).map(([a, b]) => a + '>' + b)))
      const focus = new Set([].concat((step && step.focus) || []))
      if (marks.length) for (const p of marks) for (const id of p) focus.add(id)
      stage.focus(focus.size ? [...focus] : undefined)

      // estado recomputado do índice: no passo 1 os ramos brotam; nos outros já estão inteiros
      const now = stage.now()
      let growMs = 0
      for (const [key, b] of branches) {
        b.want = litKeys.has(key) ? LIT : DIM
        b.mat.color.setHex(litKeys.has(key) ? ACCENT : stage.tubeColor)
        if (stepIndex === 0) {
          b.grow = true
          b.prog = 0
          b.start = now + growDelay(b.depth)
        } else {
          b.grow = false
          b.prog = 1
        }
      }
      if (stepIndex === 0 && branches.size) growMs = growDelay(maxDepth) + GROW_MS

      const runs = []
      marks.forEach((p, m) => {
        pathEdges(p).forEach(([a, b], k) => {
          runs.push(stage.packet(vec.get(a), vec.get(b), { color: ACCENT, arc: 0, delayMs: growMs + (m * 4 + k) * HOP_MS * 0.6, ms: HOP_MS }))
        })
      })
      if (!runs.length) return stage.wait(Math.max(growMs, 600))
      await Promise.all(runs)
      await stage.wait(SETTLE_MS)
    },
    dispose() {
      off()
      branches.clear()
      pieces.clear()
    },
  }
}
