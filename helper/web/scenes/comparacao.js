// Cena «comparacao»: duas colunas com título, itens alinhados por índice. `value` numérico vira uma barra
// comparável entre os lados (mesma escala, partindo do zero); texto aparece como legenda do item.
// Não importa three: usa stage.THREE, então as funções puras abaixo rodam em `node --test`.
import { formatValue, chartScale, valueDigits } from './grafico.js'

const COLORS = [0xD97757, 0x5B8DEF]
const COL_X = 3.5
const ROW_GAP = 1.55
const TOP_Y = 0
const ITEM_W = 5
const ITEM_H = 0.55
const DEPTH = 0.2
const GROW_MS = 1100
const SETTLE_MS = 800
const HIGHLIGHT_MS = 1000
const EMPTY_MS = 600

const fin = (v) => typeof v === 'number' && Number.isFinite(v)
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x)
const ease = (u) => 1 - Math.pow(1 - clamp01(u), 3)

export const rowY = (i) => TOP_Y - i * ROW_GAP

const itemsOf = (side) => (side && Array.isArray(side.items) ? side.items : [])

// Item de mesmo índice no outro lado (ou null se não há par).
export function pairOf(sides, id) {
  if (!Array.isArray(sides) || sides.length < 2) return null
  for (let s = 0; s < 2; s++) {
    const idx = itemsOf(sides[s]).findIndex((it) => it && it.id === id)
    if (idx >= 0) {
      const other = itemsOf(sides[1 - s])[idx]
      return other && other.id !== undefined ? other.id : null
    }
  }
  return null
}

// Máximo absoluto dos valores numéricos dos dois lados (0 quando não há número).
export function sharedScale(sides) {
  let m = 0
  for (const s of Array.isArray(sides) ? sides : []) {
    for (const it of itemsOf(s)) if (it && fin(it.value)) m = Math.max(m, Math.abs(it.value))
  }
  return m
}

// Casas decimais dos valores, derivadas da mesma escala compartilhada do gráfico (0,004 não pode virar "0").
export function sideDigits(sides) {
  const vals = []
  for (const s of Array.isArray(sides) ? sides : []) for (const it of itemsOf(s)) if (it && fin(it.value)) vals.push(it.value)
  return valueDigits(chartScale(vals).ticks)
}

// Texto do valor de um item (número formatado com as casas da escala; texto fica como veio).
export function valueText(v, digits) {
  return v === undefined || v === null ? undefined : fin(v) ? formatValue(v, '', digits) : String(v)
}

// Barra na largura `w`: parte do zero. Com negativos o zero fica no meio (cada metade vale `scale`).
export function barSpan(v, scale, hasNeg, w) {
  const x0 = hasNeg ? 0 : -w / 2
  const room = hasNeg ? w / 2 : w
  const len = scale > 0 && fin(v) ? (Math.abs(v) / scale) * room : 0
  return { x0, len, dir: v < 0 ? -1 : 1 }
}

export function build(scene, stage) {
  const { THREE } = stage
  const sides = (Array.isArray(scene.sides) ? scene.sides : []).slice(0, 2).map((s) => (s && typeof s === 'object' ? s : {}))
  const scale = sharedScale(sides)
  const hasNeg = sides.some((s) => itemsOf(s).some((it) => it && fin(it.value) && it.value < 0))
  const digits = sideDigits(sides)
  const rows = Math.max(0, ...sides.map((s) => itemsOf(s).length))

  const pieces = new Map()
  const locked = [] // grupos de item: o palco não pode escalar (distorceria a comparação)
  const anims = [] // (p) => void
  const thick = [] // { id, meshes } espessura pulsa no destaque (o comprimento é o dado e nunca muda)
  const hlSet = new Set()
  const box = new THREE.Box3()

  sides.forEach((side, s) => {
    const x = (s === 0 ? -1 : 1) * COL_X
    const color = COLORS[s]
    const hg = new THREE.Group()
    hg.position.set(x, TOP_Y + 1.5, 0)
    const hm = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.15, roughness: 0.4, metalness: 0.2 })
    hg.add(new THREE.Mesh(new THREE.BoxGeometry(ITEM_W, 0.25, DEPTH), hm))
    stage.addPiece(String(side.id), hg, { label: side.label ?? side.id, detail: side.detail, color })
    pieces.set(String(side.id), hg)

    itemsOf(side).forEach((it, i) => {
      if (!it || it.id === undefined) return
      const g = new THREE.Group()
      g.position.set(x, rowY(i), 0)
      const trackMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.1, roughness: 0.6, metalness: 0.1, transparent: true, opacity: fin(it.value) ? 0.22 : 0.55 })
      const track = new THREE.Mesh(new THREE.BoxGeometry(ITEM_W, ITEM_H, DEPTH * 0.5), trackMat)
      g.add(track)
      const meshes = [track]
      if (fin(it.value)) {
        const sp = barSpan(it.value, scale, hasNeg, ITEM_W)
        const geo = new THREE.BoxGeometry(1, ITEM_H * 0.8, DEPTH)
        geo.translate(sp.dir * 0.5, 0, 0)
        const bar = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.2, roughness: 0.4, metalness: 0.15 }))
        bar.position.set(sp.x0, 0, DEPTH * 0.3)
        bar.scale.x = Math.max(sp.len, 1e-4)
        g.add(bar)
        meshes.push(bar)
        anims.push((p) => { bar.scale.x = Math.max(sp.len * ease(p), 1e-4) })
      }
      const sub = valueText(it.value, digits)
      stage.addPiece(String(it.id), g, { label: it.label ?? it.id, sub, detail: it.detail, color })
      pieces.set(String(it.id), g)
      locked.push(g)
      thick.push({ id: String(it.id), meshes })
    })
    box.expandByPoint(new THREE.Vector3(x - ITEM_W / 2 - 0.5, rowY(Math.max(rows - 1, 0)) - 1.3, 0))
    box.expandByPoint(new THREE.Vector3(x + ITEM_W / 2 + 0.5, TOP_Y + 2.2, 0))
  })

  const grow = { start: performance.now() }
  const off = stage.onFrame((t, nowMs) => {
    for (const g of locked) g.scale.set(1, 1, 1) // palco incha o foco; aqui isso falsearia a comparação
    const p = clamp01((nowMs - grow.start) / GROW_MS)
    for (const a of anims) a(p)
    const pulse = 1 + Math.sin(t * 5) * 0.12
    for (const e of thick) {
      const k = hlSet.has(e.id) ? pulse : 1
      for (const m of e.meshes) { m.scale.y = k; m.scale.z = k }
    }
  })
  stage.fit(box.isEmpty() ? undefined : box, { planar: true })

  return {
    pieces,
    async play(stepIndex, step) {
      const focus = (step && Array.isArray(step.focus) ? step.focus : []).map(String).filter((id) => pieces.has(id))
      const marks = (step && Array.isArray(step.highlight) ? step.highlight : []).map(String).filter((id) => pieces.has(id))
      hlSet.clear()
      const lit = new Set(focus)
      for (const id of marks) {
        hlSet.add(id)
        lit.add(id)
        const mate = pairOf(sides, id)
        if (mate !== null && pieces.has(String(mate))) { hlSet.add(String(mate)); lit.add(String(mate)) }
      }
      for (const side of sides) if (lit.size && side.id !== undefined) lit.add(String(side.id)) // títulos sempre acesos
      stage.focus(lit.size ? [...lit] : undefined)
      const growing = stepIndex === 0
      grow.start = growing ? stage.now() : -Infinity
      await stage.wait(growing ? GROW_MS + SETTLE_MS : marks.length ? HIGHLIGHT_MS : EMPTY_MS)
    },
    dispose() {
      off()
      anims.length = 0
      thick.length = 0
      pieces.clear()
    },
  }
}
