// Cena «camadas»: placas empilhadas (a primeira em cima), com os `items` como etiquetas sobre a placa.
// O foco afasta as placas acima e abaixo; hops sobem ou descem entre placas.
// Não importa three: usa stage.THREE, então as funções puras abaixo rodam em `node --test`.

const PALETTE = [0xD97757, 0x5B8DEF, 0x36C5A0, 0xE5B94E, 0xB58AE6, 0xE86A92, 0x62C7E8, 0x9AD66B]
const GAP_Y = 2.1 // distância entre placas
const SPREAD = 0.9 // quanto o foco afasta as placas de fora
const PLATE_W = 9
const PLATE_H = 0.8
const PLATE_D = 2.4
const HOP_X = 3.9
const HOP_GAP_MS = 900
const HOP_MS = 1200
const SETTLE_MS = 800
const EMPTY_MS = 700
const ITEM_RISE = 1.5 // o palco põe o texto ~1,2 abaixo de um grupo vazio; sobe um pouco para ficar na face da placa

// Altura da placa i de n: decrescente, centrada em zero.
export function layerY(i, n) {
  return ((n - 1) / 2 - i) * GAP_Y
}

// Posições x dos itens sobre a placa: centrados, com passo que cabe na largura.
export function itemXs(n) {
  const gap = Math.min(2.3, (PLATE_W - 1.6) / Math.max(n, 1))
  return Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * gap)
}

// Deslocamento vertical de cada placa: as de cima sobem, as de baixo descem, as focadas ficam.
export function spreadOffsets(n, focusIdx, spread = SPREAD) {
  if (!focusIdx || !focusIdx.length) return Array(n).fill(0)
  const lo = Math.min(...focusIdx)
  const hi = Math.max(...focusIdx)
  return Array.from({ length: n }, (_, i) => (i < lo ? spread : i > hi ? -spread : 0))
}

// Índices das placas citadas no foco (ids que não são placas são ignorados).
export function focusedLayers(layers, focus) {
  const want = new Set((Array.isArray(focus) ? focus : []).map(String))
  const out = []
  ;(layers || []).forEach((l, i) => { if (want.has(String(l.id))) out.push(i) })
  return out
}

// Um pacote por hop, escalonado. dir: -1 desce, +1 sobe. Ids desconhecidos (ou o mesmo id) são ignorados.
export function hopPlan(layerIds, hops, gapMs = HOP_GAP_MS) {
  const out = []
  ;(hops || []).forEach((h, k) => {
    const a = Array.isArray(h) ? layerIds.indexOf(h[0]) : -1
    const b = Array.isArray(h) ? layerIds.indexOf(h[1]) : -1
    if (a < 0 || b < 0 || a === b) return
    out.push({ from: h[0], to: h[1], dir: b > a ? -1 : 1, delayMs: k * gapMs })
  })
  return out
}

export function build(scene, stage) {
  const { THREE } = stage
  const layers = (Array.isArray(scene.layers) ? scene.layers : []).filter((l) => l && typeof l === 'object')
  const n = layers.length
  const ids = layers.map((l) => String(l.id))
  const pieces = new Map()
  const entries = [] // { id, group, base, items: [{ group, x, key }] , cur, want }

  layers.forEach((l, i) => {
    const color = PALETTE[i % PALETTE.length]
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.15, roughness: 0.4, metalness: 0.2 })
    const g = new THREE.Group()
    g.add(new THREE.Mesh(new THREE.BoxGeometry(PLATE_W, PLATE_H, PLATE_D), mat))
    const base = layerY(i, n)
    g.position.set(0, base, 0)
    stage.addPiece(ids[i], g, { label: l.label ?? l.id, detail: l.detail, color })
    pieces.set(ids[i], g)
    const items = Array.isArray(l.items) ? l.items : []
    const xs = itemXs(items.length)
    const chips = items.map((text, k) => {
      const key = `__item:${ids[i]}:${k}`
      const cg = new THREE.Group()
      cg.position.set(xs[k], base + ITEM_RISE + 0.05, PLATE_D / 2 + 0.1)
      stage.addPiece(key, cg, { label: String(text) })
      return { group: cg, x: xs[k], key }
    })
    entries.push({ id: ids[i], group: g, base, chips, cur: 0, want: 0 })
  })

  const off = stage.onFrame(() => {
    for (const e of entries) {
      e.cur += (e.want - e.cur) * 0.1
      e.group.position.y = e.base + e.cur
      for (const c of e.chips) c.group.position.y = e.base + e.cur + ITEM_RISE + 0.05
    }
  })

  const box = new THREE.Box3()
  if (n) {
    box.expandByPoint(new THREE.Vector3(-PLATE_W / 2 - 0.6, layerY(n - 1, n) - SPREAD - 1.3, -PLATE_D / 2))
    box.expandByPoint(new THREE.Vector3(PLATE_W / 2 + 0.6, layerY(0, n) + SPREAD + 0.8, PLATE_D / 2))
    stage.fit(box)
  }

  return {
    pieces,
    async play(stepIndex, step) {
      const fi = focusedLayers(layers, step && step.focus)
      const offs = spreadOffsets(n, fi)
      entries.forEach((e, i) => { e.want = offs[i] })
      const lit = []
      for (const i of fi) lit.push(ids[i], ...entries[i].chips.map((c) => c.key))
      const extra = (step && Array.isArray(step.focus) ? step.focus : []).map(String).filter((id) => !ids.includes(id))
      stage.focus(lit.length ? lit : extra.length ? extra : undefined)

      const plan = hopPlan(ids, step && step.hops)
      if (!plan.length) return stage.wait(fi.length ? SETTLE_MS : EMPTY_MS)
      const at = (id) => {
        const i = ids.indexOf(id)
        return new THREE.Vector3(HOP_X, layerY(i, n) + offs[i], PLATE_D / 2 + 0.2)
      }
      const runs = plan.map((h) => stage.packet(at(h.from), at(h.to), { color: PALETTE[ids.indexOf(h.from) % PALETTE.length], arc: 0.35, delayMs: h.delayMs, ms: HOP_MS }))
      await Promise.all(runs)
      await stage.wait(SETTLE_MS)
    },
    dispose() {
      off()
      entries.length = 0
      pieces.clear()
    },
  }
}
