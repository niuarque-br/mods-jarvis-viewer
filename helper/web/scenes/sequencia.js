// Cena «sequencia»: atores em colunas com linha de vida; mensagens são setas horizontais em descida.
// A mensagem destacada aparece e manda um pacote. Câmera de frente (planar).
import { row } from '../engine/layout.js'
import { makePiece, stale, gone } from '../engine/pieces.js'

const PALETTE = [0xD97757, 0x5B8DEF, 0x36C5A0, 0xE8ECF3, 0xE5B94E, 0xB58AE6, 0xE86A92, 0x62C7E8]
const TOP_Y = -2.0 // primeira mensagem
const STEP_Y = 1.15
const HOP_GAP_MS = 900
const HOP_MS = 1300
const SETTLE_MS = 700
const DIM = 0.14

// Altura da i-ésima mensagem: estritamente decrescente.
export function sequenceY(i) {
  return TOP_Y - i * STEP_Y
}

export function actorXs(n) {
  const gap = n <= 3 ? 5 : n <= 5 ? 4.2 : 3.4
  return row(n, gap).map((p) => p[0])
}

// Ids de mensagens já reveladas ao chegar no passo `i` (acumulado dos highlights dos passos 0..i).
export function revealedBy(steps, i) {
  const out = new Set()
  for (let k = 0; k <= i && k < (steps || []).length; k++) for (const id of (steps[k] && steps[k].highlight) || []) out.add(id)
  return out
}

export function pieceOptions(a, scene) {
  return { estilo: scene && scene.estilo, padrao: 'caixa' }
}

export async function build(scene, stage, alive) {
  const { THREE } = stage
  const actors = Array.isArray(scene.actors) ? scene.actors : []
  const messages = Array.isArray(scene.messages) ? scene.messages : []
  const steps = Array.isArray(scene.steps) ? scene.steps : []
  const xs = actorXs(actors.length)
  const ax = new Map(actors.map((a, i) => [a.id, xs[i]]))
  const colors = new Map(actors.map((a, i) => {
    const c = PALETTE[i % PALETTE.length]
    return [a.id, stage.theme === 'light' && c === 0xE8ECF3 ? 0x6B7280 : c]
  }))
  const bottom = sequenceY(Math.max(messages.length - 1, 0)) - 1.0

  const pieces = new Map()
  const legacy = (color) => () => {
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.15, roughness: 0.35, metalness: 0.2 })
    const g = new THREE.Group()
    g.add(new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.7, 0.5), mat))
    return g
  }
  const made = await Promise.all(actors.map((a) => makePiece(stage, a, { ...pieceOptions(a, scene), cor: colors.get(a.id), desenho: legacy(colors.get(a.id)) })))
  if (stale(alive, made)) return gone()
  actors.forEach((a, ai) => {
    const color = colors.get(a.id)
    const g = made[ai]
    g.position.set(ax.get(a.id), 0, 0)
    stage.addPiece(a.id, g, { label: a.label, detail: a.detail, color })
    pieces.set(a.id, g)
    // linha de vida
    const h = -1.1 - bottom
    const life = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, h, 6),
      new THREE.MeshBasicMaterial({ color: stage.tubeColor, transparent: true, opacity: 0.35 }),
    )
    life.position.set(ax.get(a.id), (-1.1 + bottom) / 2, 0)
    stage.scene.add(life)
  })

  const msgs = new Map() // id -> { mats, level, want, from, to }
  messages.forEach((m, i) => {
    const y = sequenceY(i)
    const x1 = ax.get(m.from)
    const x2 = ax.get(m.to)
    if (x1 === undefined || x2 === undefined) return
    const color = colors.get(m.from)
    const arrow = new THREE.Group() // a seta fica fora da peça: a peça é só a área de clique acima dela, para o rótulo ficar sobre a seta
    const shaftMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: DIM })
    const headMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: DIM })
    let tip
    let midX
    if (m.from === m.to) {
      // mensagem para si mesmo: laço curto à direita da linha de vida
      const pts = [new THREE.Vector3(x1, y, 0), new THREE.Vector3(x1 + 0.95, y, 0), new THREE.Vector3(x1 + 0.95, y - 0.5, 0), new THREE.Vector3(x1 + 0.12, y - 0.5, 0)]
      arrow.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0), 48, 0.03, 8), shaftMat))
      tip = new THREE.Vector3(x1, y - 0.5, 0)
      midX = x1 + 0.5
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.34, 16), headMat)
      head.rotation.z = Math.PI / 2 // aponta para -x
      head.position.set(x1 + 0.17, y - 0.5, 0)
      arrow.add(head)
    } else {
      const dir = Math.sign(x2 - x1)
      const len = Math.abs(x2 - x1) - 0.34
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, len, 8), shaftMat)
      shaft.rotation.z = Math.PI / 2
      shaft.position.set(x1 + (dir * len) / 2, y, 0)
      arrow.add(shaft)
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.34, 16), headMat)
      head.rotation.z = -dir * Math.PI / 2
      head.position.set(x2 - dir * 0.17, y, 0)
      arrow.add(head)
      tip = new THREE.Vector3(x2, y, 0)
      midX = (x1 + x2) / 2
    }
    stage.scene.add(arrow)
    // peça: caixa invisível sobre a seta; o rótulo (que o palco põe sob a peça) cai logo acima dela
    const g = new THREE.Group()
    g.position.set(midX, y + 1.15, 0)
    g.add(new THREE.Mesh(new THREE.BoxGeometry(Math.max(Math.abs(x2 - x1), 1.2), 0.5, 0.2), new THREE.MeshBasicMaterial({ visible: false })))
    stage.addPiece(m.id, g, { label: m.label, detail: m.detail })
    msgs.set(m.id, { mats: [shaftMat, headMat], level: DIM, want: DIM, from: new THREE.Vector3(x1, y, 0), to: tip, color })
    pieces.set(m.id, g)
  })

  const off = stage.onFrame(() => {
    for (const m of msgs.values()) {
      m.level += (m.want - m.level) * 0.08
      for (const mat of m.mats) mat.opacity = m.level
    }
  })

  const box = new THREE.Box3()
  box.expandByPoint(new THREE.Vector3((xs[0] ?? 0) - 1.2, 0.9, 0))
  box.expandByPoint(new THREE.Vector3((xs[xs.length - 1] ?? 0) + 1.6, bottom - 0.6, 0))
  stage.fit(box, { planar: true })

  return {
    pieces,
    async play(stepIndex, step) {
      stage.focus(step && step.focus)
      const shown = revealedBy(steps, stepIndex)
      const fresh = new Set((step && step.highlight) || [])
      const runs = []
      let k = 0
      for (const [id, m] of msgs) {
        m.want = shown.has(id) ? 0.9 : DIM
        if (fresh.has(id)) {
          runs.push(stage.packet(m.from, m.to, { color: m.color, arc: 0, delayMs: k * HOP_GAP_MS, ms: HOP_MS }))
          k++
        }
      }
      // hops entre atores (sem mensagem) também viajam, logo abaixo das caixas
      for (const h of (step && step.hops) || []) {
        const a = ax.get(h[0])
        const b = ax.get(h[1])
        if (a === undefined || b === undefined) continue
        runs.push(stage.packet(new THREE.Vector3(a, -0.6, 0), new THREE.Vector3(b, -0.6, 0), { color: colors.get(h[0]), arc: 0.5, delayMs: k * HOP_GAP_MS, ms: HOP_MS }))
        k++
      }
      if (!runs.length) return stage.wait(600)
      await Promise.all(runs)
      await stage.wait(SETTLE_MS)
    },
    dispose() {
      off()
      msgs.clear()
      pieces.clear()
    },
  }
}
