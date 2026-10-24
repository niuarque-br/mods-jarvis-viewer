// Cena «camadas»: placas empilhadas (a primeira em cima), com os `items` como etiquetas sobre a placa.
// O foco afasta as placas acima e abaixo; hops sobem ou descem entre placas.
// Não importa three: usa stage.THREE, então as funções puras abaixo rodam em `node --test`.
// Com estilo.arranjo = 'horizontal' as placas ficam em pé, lado a lado (a primeira, o topo, à esquerda).
import { makePiece, stale, gone, keepFigure } from '../engine/pieces.js'

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
const HGAP = 3.7 // distância entre placas em pé
const HPLATE_W = 2.8
const HPLATE_TALL = 6.6
const HITEM_GAP = 1.05
const FIG_SCALE = 0.7
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

// Posição da placa i de n: empilhada (y) ou em pé, lado a lado (x).
export function layerPos(i, n, horiz) {
  return horiz ? [(i - (n - 1) / 2) * HGAP, 0, 0] : [0, layerY(i, n), 0]
}

// Posição de cada um dos m itens em relação ao centro da placa.
export function itemOffsets(m, horiz) {
  if (!horiz) return itemXs(m).map((x) => [x, 0, 0])
  const gap = Math.min(HITEM_GAP, (HPLATE_TALL - 1.8) / Math.max(m, 1))
  return Array.from({ length: m }, (_, k) => [0, ((m - 1) / 2 - k) * gap, 0])
}

// O deslocamento `o` de spreadOffsets (positivo = placas «antes») como vetor [dx, dy]: para cima, ou para a esquerda se em pé.
export function spreadVec(o, horiz) {
  return horiz ? [o ? -o : 0, 0] : [0, o]
}

// Ponto de partida/chegada dos pacotes junto à placa i: à direita da placa empilhada, ou no alto da placa em pé.
export function hopAnchor(i, n, horiz) {
  return horiz ? [layerPos(i, n, true)[0], HPLATE_TALL / 2 + 0.5, 0] : [HOP_X, layerY(i, n), 0]
}

// Onde a figura da placa fica em relação ao centro dela.
export function figureOffset(horiz) {
  return horiz ? [0, HPLATE_TALL / 2 - 0.95, PLATE_D / 2 + 0.25] : [-PLATE_W / 2 + 0.95, 0, PLATE_D / 2 + 0.25]
}

export async function build(scene, stage, alive) {
  const { THREE } = stage
  const horiz = !!(scene.estilo && scene.estilo.arranjo === 'horizontal')
  const layers = (Array.isArray(scene.layers) ? scene.layers : []).filter((l) => l && typeof l === 'object')
  const n = layers.length
  const ids = layers.map((l) => String(l.id))
  const pieces = new Map()
  const entries = [] // { id, group, base, chips: [{ group, off, key }], fig, cur, want }
  const plateSize = horiz ? [HPLATE_W, HPLATE_TALL, PLATE_D] : [PLATE_W, PLATE_H, PLATE_D]
  const figs = await Promise.all(layers.map((l) => (l.figura ? makePiece(stage, l, { estilo: scene.estilo, padrao: 'caixa', cor: PALETTE[layers.indexOf(l) % PALETTE.length] }) : null)))
  if (stale(alive, figs)) return gone()
  for (let i = 0; i < figs.length; i++) figs[i] = keepFigure(figs[i]) // figura que falhou: sem cubinho solto

  layers.forEach((l, i) => {
    const color = PALETTE[i % PALETTE.length]
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.15, roughness: 0.4, metalness: 0.2 })
    const g = new THREE.Group()
    g.add(new THREE.Mesh(new THREE.BoxGeometry(...plateSize), mat))
    const base = layerPos(i, n, horiz)
    g.position.set(...base)
    stage.addPiece(ids[i], g, { label: l.label ?? l.id, detail: l.detail, color })
    pieces.set(ids[i], g)
    const items = Array.isArray(l.items) ? l.items : []
    const offs = itemOffsets(items.length, horiz)
    const chips = items.map((text, k) => {
      const key = `__item:${ids[i]}:${k}`
      const cg = new THREE.Group()
      cg.position.set(base[0] + offs[k][0], base[1] + offs[k][1] + ITEM_RISE + 0.05, PLATE_D / 2 + 0.1)
      stage.addPiece(key, cg, { label: String(text) })
      return { group: cg, off: offs[k], key }
    })
    let fig = null
    if (figs[i]) {
      const fo = figureOffset(horiz)
      figs[i].scale.setScalar(FIG_SCALE)
      figs[i].position.set(base[0] + fo[0], base[1] + fo[1], fo[2])
      stage.addPiece(`__fig:${ids[i]}`, figs[i], {})
      fig = { group: figs[i], off: fo, key: `__fig:${ids[i]}` }
    }
    entries.push({ id: ids[i], group: g, base, chips, fig, cur: 0, want: 0 })
  })

  const off = stage.onFrame(() => {
    for (const e of entries) {
      e.cur += (e.want - e.cur) * 0.1
      const [dx, dy] = spreadVec(e.cur, horiz)
      e.group.position.set(e.base[0] + dx, e.base[1] + dy, 0)
      for (const c of e.chips) c.group.position.set(e.base[0] + dx + c.off[0], e.base[1] + dy + c.off[1] + ITEM_RISE + 0.05, PLATE_D / 2 + 0.1)
      if (e.fig) e.fig.group.position.set(e.base[0] + dx + e.fig.off[0], e.base[1] + dy + e.fig.off[1], e.fig.off[2])
    }
  })

  const box = new THREE.Box3()
  if (n) {
    const first = layerPos(0, n, horiz)
    const last = layerPos(n - 1, n, horiz)
    if (horiz) {
      box.expandByPoint(new THREE.Vector3(first[0] - HPLATE_W / 2 - SPREAD - 0.6, -HPLATE_TALL / 2 - 1.5, -PLATE_D / 2))
      box.expandByPoint(new THREE.Vector3(last[0] + HPLATE_W / 2 + SPREAD + 0.6, HPLATE_TALL / 2 + 1.1, PLATE_D / 2))
    } else {
      box.expandByPoint(new THREE.Vector3(-PLATE_W / 2 - 0.6, last[1] - SPREAD - 1.3, -PLATE_D / 2))
      box.expandByPoint(new THREE.Vector3(PLATE_W / 2 + 0.6, first[1] + SPREAD + 0.8, PLATE_D / 2))
    }
    stage.fit(box)
  }

  return {
    pieces,
    async play(stepIndex, step) {
      const fi = focusedLayers(layers, step && step.focus)
      const offs = spreadOffsets(n, fi)
      entries.forEach((e, i) => { e.want = offs[i] })
      const lit = []
      for (const i of fi) lit.push(ids[i], ...entries[i].chips.map((c) => c.key), ...(entries[i].fig ? [entries[i].fig.key] : []))
      const extra = (step && Array.isArray(step.focus) ? step.focus : []).map(String).filter((id) => !ids.includes(id))
      stage.focus(lit.length ? lit : extra.length ? extra : undefined)

      const plan = hopPlan(ids, step && step.hops)
      if (!plan.length) return stage.wait(fi.length ? SETTLE_MS : EMPTY_MS)
      const at = (id) => {
        const i = ids.indexOf(id)
        const a = hopAnchor(i, n, horiz)
        const [dx, dy] = spreadVec(offs[i], horiz)
        return new THREE.Vector3(a[0] + dx, a[1] + dy, PLATE_D / 2 + 0.2)
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
