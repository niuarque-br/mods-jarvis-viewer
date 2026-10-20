// Cena «grafico»: barras, linhas, rosca e dispersão. Câmera de frente (planar) e relevo de no máximo RELIEF unidades,
// para a perspectiva nunca distorcer os números. A escala sempre inclui o zero (barras, linhas e rosca) e o mínimo;
// barras partem do zero (negativas descem), valores todos iguais não dividem por zero.
// Não importa three: usa stage.THREE, então as funções puras abaixo rodam em `node --test`.

export const CHART_W = 12
export const CHART_H = 6
export const RELIEF = 0.12 // profundidade máxima de qualquer peça do gráfico (limite do desenho: 0,15)

const PALETTE = [0xD97757, 0x5B8DEF, 0x36C5A0, 0xE5B94E, 0xB58AE6, 0xE86A92, 0x62C7E8, 0x9AD66B]
const GROW_MS = 1200
const SETTLE_MS = 800
const HIGHLIGHT_MS = 900
const EMPTY_MS = 600
const LEGEND_GAP = 3.4
const TWO_PI = Math.PI * 2
const MAX_TICKS = 50

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x)
export const ease = (u) => 1 - Math.pow(1 - clamp01(u), 3)
const fin = (v) => typeof v === 'number' && Number.isFinite(v)

// Passo "bonito" (1, 2, 2,5, 5 × 10^k) que não é menor que `raw`.
function niceStep(raw) {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1
  const exp = Math.floor(Math.log10(raw))
  const f = raw / Math.pow(10, exp)
  const nice = [1, 2, 2.5, 5, 10].find((c) => c >= f - 1e-9) ?? 10
  return nice * Math.pow(10, exp)
}

// Marcas do eixo (cerca de `count`). Com `zero` (padrão) o intervalo sempre contém o 0, mesmo quando min > 0 ou max < 0.
// Valores todos iguais não dão intervalo vazio: o resultado sempre tem passo positivo e nenhum NaN.
export function niceTicks(min, max, count = 5, { zero = true } = {}) {
  let lo = fin(min) ? min : 0
  let hi = fin(max) ? max : lo
  if (lo > hi) [lo, hi] = [hi, lo]
  if (zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0) }
  if (hi === lo) {
    if (zero) hi = 1 // tudo zero
    else { const pad = Math.abs(lo) * 0.1 || 1; lo -= pad; hi += pad }
  }
  const n = Math.max(2, Math.floor(count) || 5)
  const step = niceStep((hi - lo) / (n - 1))
  const k0 = Math.floor(lo / step + 1e-9)
  const k1 = Math.ceil(hi / step - 1e-9)
  // entradas gigantes: passo não finito ou contagem enorme (o laço não avançaria / estouraria) -> só as pontas
  if (!Number.isFinite(step) || !Number.isFinite(k0) || !Number.isFinite(k1) || k1 - k0 > MAX_TICKS || Math.max(Math.abs(k0), Math.abs(k1)) > 2 ** 50 || !Number.isFinite(hi - lo)) {
    return [lo, hi].map((v) => (Number.isFinite(v) ? v : 0))
  }
  const out = []
  for (let k = k0; k <= k1; k++) out.push(Number((k * step).toPrecision(12)) || 0)
  return out
}

// Escala vertical do gráfico: `ticks` incluem o mínimo e (com zero) o 0; toY mapeia valor -> y da cena.
export function chartScale(values, height = CHART_H, { zero = true } = {}) {
  const ok = (values || []).filter(fin)
  const ticks = niceTicks(ok.length ? Math.min(...ok) : NaN, ok.length ? Math.max(...ok) : NaN, 5, { zero })
  const min = ticks[0]
  const max = ticks[ticks.length - 1]
  const span = max - min || 1
  const toY = (v) => -height / 2 + ((v - min) / span) * height
  return { ticks, min, max, toY, zeroY: toY(0) }
}

// A barra sempre parte do zero; o valor negativo vai para baixo. Altura = |v|.
export function barBase() {
  return 0
}
export function barExtent(v) {
  const x = fin(v) ? v : 0
  return { base: barBase(x), top: x, height: Math.abs(x), dir: x < 0 ? -1 : 1 }
}

// Setores da rosca por |v|, em radianos a partir de `start` (sentido horário a partir do topo quando o desenho converte).
// Somam 2π; se a soma de |v| for zero, todos os setores têm comprimento 0.
export function donutAngles(values, start = 0) {
  const mags = (values || []).map((v) => (fin(v) ? Math.abs(v) : 0))
  const total = mags.reduce((s, m) => s + m, 0)
  if (!(total > 0)) return mags.map(() => ({ start, end: start, mid: start, frac: 0 }))
  let acc = 0
  return mags.map((m, i) => {
    const a = start + (acc / total) * TWO_PI
    acc += m
    const b = i === mags.length - 1 ? start + TWO_PI : start + (acc / total) * TWO_PI
    return { start: a, end: b, mid: (a + b) / 2, frac: m / total }
  })
}

// Casas decimais que o passo das marcas pede (passo 0,001 -> 3), no máximo 6.
export function tickDigits(ticks) {
  const step = ticks && ticks.length > 1 ? Math.abs(ticks[1] - ticks[0]) : 1
  if (!(step > 0) || !Number.isFinite(step)) return 0
  return Math.min(6, Math.max(0, -Math.floor(Math.log10(step) + 1e-9)))
}

// `digits`: casas decimais mínimas (marcas de eixo: tickDigits; valores: tickDigits + 1, no mínimo 2).
export function formatValue(v, unit, digits) {
  const max = Number.isInteger(digits) ? Math.min(6, Math.max(0, digits)) : 2
  const n = fin(v)
    ? v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: max }).replace('-', '−')
    : '—'
  if (!unit) return n
  return unit === '%' ? n + '%' : n + ' ' + unit
}
export const valueDigits = (ticks) => Math.max(2, Math.min(6, tickDigits(ticks) + 1))

// Conjunto de foco do passo: com algo em foco, os rótulos de eixo/categoria entram sempre (a escala não apaga). Vazio = sem foco.
export function withAxis(lit, axisIds) {
  if (!lit || !lit.size) return undefined
  return [...new Set([...lit, ...(axisIds || [])])]
}

// "<serie>#<índice>" -> { series, index, id } ou null
export function parseRef(ref) {
  const m = typeof ref === 'string' ? /^(.+)#(\d+)$/.exec(ref) : null
  return m ? { series: m[1], index: Number(m[2]), id: ref } : null
}

// Entrada escalonada: parte de 0 em p = lag(i) e chega a 1 em p = 1.
export function stagger(p, i, n, overlap = 0.6) {
  const lag = n > 1 ? (i / (n - 1)) * overlap : 0
  return clamp01((p - lag) / (1 - overlap))
}

export function build(scene, stage) {
  const { THREE } = stage
  const chart = ['barras', 'linhas', 'rosca', 'dispersao'].includes(scene.chart) ? scene.chart : 'barras'
  const unit = typeof scene.unit === 'string' ? scene.unit : ''
  const cats = (Array.isArray(scene.categories) ? scene.categories : []).map(String)
  const series = (Array.isArray(scene.series) ? scene.series : []).filter((s) => s && typeof s === 'object')
  const scatter = chart === 'dispersao'
  const W = CHART_W
  const H = CHART_H
  const ink = stage.theme === 'light' ? 0x39414f : 0xaab3c5

  const valuesOf = (s) => (Array.isArray(s.values) ? s.values : []).map((v) => (fin(v) ? v : NaN))
  const pointsOf = (s) => (Array.isArray(s.points) ? s.points : []).map((p) => (p && fin(p.x) && fin(p.y) ? p : null))
  const nOf = (s) => (scatter ? pointsOf(s).length : valuesOf(s).length)
  const catName = (i) => cats[i] ?? '#' + (i + 1)

  const pieces = new Map()
  const lockedScale = [] // peças cuja escala o palco não pode mexer (o gráfico não distorce números)
  const anims = [] // (p, nowMs) => void
  const smooth = [] // () => void
  const ids = { known: new Set() }

  const pointInfo = new Map() // "s#i" -> { series, legend, cat, vl: { x, y, label, sub } , lit }
  const seriesPoints = new Map() // id da série -> ["s#0", ...]
  const lineMats = new Map() // id da série -> { mat, level, want }
  const explode = new Map() // "s#i" -> { group, base, dir, cur, want }

  let td = 0 // casas das marcas do eixo Y
  let tdx = 0 // casas das marcas do eixo X (dispersão)
  let vd = 2 // casas dos valores destacados
  const axisIds = [] // rótulos de eixo/categoria: ficam sempre acesos
  const group = (x, y, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); return g }
  // rótulo HTML cujo topo do texto fica em y (o palco põe o texto ~1,2 abaixo de um grupo vazio)
  const textAt = (id, x, y, label, sub, color) => {
    const g = group(x, y + 1.2)
    if (id.startsWith('__tick:') || id.startsWith('__cat:')) axisIds.push(id)
    stage.addPiece(id, g, { label, sub, color })
    return g
  }
  const lineMat = (color, opacity) => new THREE.LineBasicMaterial({ color, transparent: true, opacity })
  const hline = (x0, x1, y, color, opacity) => {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x0, y, -0.05), new THREE.Vector3(x1, y, -0.05)])
    stage.scene.add(new THREE.Line(geo, lineMat(color, opacity)))
  }
  const vline = (x, y0, y1, color, opacity) => {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, y0, -0.05), new THREE.Vector3(x, y1, -0.05)])
    stage.scene.add(new THREE.Line(geo, lineMat(color, opacity)))
  }
  const disc = (r, color) => {
    const geo = new THREE.CylinderGeometry(r, r, RELIEF * 0.8, 24)
    geo.rotateX(Math.PI / 2)
    return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.15, roughness: 0.4, metalness: 0.1 }))
  }
  const hitBox = (w, h) => new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.1), new THREE.MeshBasicMaterial({ visible: false }))

  const colorOf = (i) => PALETTE[i % PALETTE.length]
  const box = new THREE.Box3()
  const expand = (x0, y0, x1, y1) => { box.expandByPoint(new THREE.Vector3(x0, y0, 0)); box.expandByPoint(new THREE.Vector3(x1, y1, 0)) }

  // ---- registro de um ponto clicável ----
  const addPoint = (sid, i, g, { detail, color, vl, legend, cat }) => {
    const id = sid + '#' + i
    stage.addPiece(id, g, { detail, color: undefined })
    lockedScale.push(g)
    pieces.set(id, g)
    pointInfo.set(id, { series: sid, legend, cat, vl })
    if (!seriesPoints.has(sid)) seriesPoints.set(sid, [])
    seriesPoints.get(sid).push(id)
    ids.known.add(id)
    return id
  }
  const valueLabel = new Map() // "s#i" -> grupo do rótulo de valor (peça "__valor:s#i")
  const shownValue = new Set()
  const setValue = (id, on) => {
    const info = pointInfo.get(id)
    if (!info || !info.vl) return
    const key = '__valor:' + id
    let g = valueLabel.get(id)
    if (!g) { g = group(info.vl.x, info.vl.y + 1.2); valueLabel.set(id, g) }
    stage.addPiece(key, g, on ? { label: info.vl.label, sub: info.vl.sub } : {}) // sem rótulo = tira o texto da tela
    if (on) shownValue.add(id)
    else shownValue.delete(id)
  }

  // ---- eixos e legenda (barras, linhas, dispersão) ----
  const legend = () => {
    const n = series.length
    series.forEach((s, k) => {
      const g = group((k - (n - 1) / 2) * LEGEND_GAP, H / 2 + 0.75)
      g.add(hitBox(0.6, 0.3))
      stage.addPiece(String(s.id), g, { label: s.label ?? s.id, detail: s.detail, color: colorOf(k) })
      pieces.set(String(s.id), g)
      ids.known.add(String(s.id))
    })
  }
  const yTicks = (sc, x) => {
    sc.ticks.forEach((t, k) => {
      const y = sc.toY(t)
      const zeroLine = t === 0
      hline(-W / 2, W / 2, y, zeroLine ? ink : stage.tubeColor, zeroLine ? 0.8 : 0.22)
      textAt('__tick:y' + k, x, y + 0.13, formatValue(t, '', td))
    })
  }

  let scaleInfo = null

  if (chart === 'barras' || chart === 'linhas') {
    const all = series.flatMap(valuesOf)
    const sc = chartScale(all, H, { zero: chart === 'barras' })
    scaleInfo = sc
    td = tickDigits(sc.ticks)
    vd = valueDigits(sc.ticks)
    const n = Math.max(cats.length, ...series.map(nOf), 1)
    const cx = (i) => -W / 2 + ((i + 0.5) * W) / n
    yTicks(sc, -W / 2 - 0.65)
    vline(-W / 2, -H / 2, H / 2, ink, 0.5)
    for (let i = 0; i < n; i++) textAt('__cat:' + i, cx(i), -H / 2 - 0.6, catName(i))
    legend()
    expand(-W / 2 - 1.6, -H / 2 - 1.2, W / 2 + 1.2, H / 2 + 1.5)

    series.forEach((s, k) => {
      const sid = String(s.id)
      const color = colorOf(k)
      const vals = valuesOf(s)
      const sub = series.length > 1 ? String(s.label ?? sid) : undefined
      if (chart === 'barras') {
        const groupW = (W / n) * 0.7
        const bw = groupW / series.length
        vals.forEach((v, i) => {
          if (!fin(v)) return
          // um material por barra: a barra destacada brilha sozinha, não a série inteira
          const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.15, roughness: 0.45, metalness: 0.1 })
          const ext = barExtent(v)
          const x = cx(i) - groupW / 2 + (k + 0.5) * bw
          const g = group(x, sc.zeroY)
          const geo = new THREE.BoxGeometry(bw * 0.88, 1, RELIEF)
          geo.translate(0, ext.dir * 0.5, 0) // a base fica no zero; negativa desce
          const mesh = new THREE.Mesh(geo, mat)
          const hPx = (ext.height / (sc.max - sc.min || 1)) * H // altura no desenho
          mesh.scale.y = Math.max(hPx, 1e-4)
          g.add(mesh)
          const yEnd = sc.toY(v)
          const vl = {
            x,
            y: ext.dir > 0 ? yEnd + 0.45 : yEnd - 0.12,
            label: (sub ? sub + ': ' : '') + formatValue(v, unit, vd),
          }
          addPoint(sid, i, g, { detail: s.detail || `${catName(i)}: ${formatValue(v, unit, vd)}`, color, vl, legend: sid, cat: '__cat:' + i })
          anims.push((p) => { mesh.scale.y = Math.max(hPx * ease(stagger(p, i, n)), 1e-4) })
        })
      } else {
        const pts = vals.map((v, i) => (fin(v) ? new THREE.Vector3(cx(i), sc.toY(v), 0) : null))
        const valid = pts.filter(Boolean)
        const lm = { mat: new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }), level: 0.9, want: 0.9 }
        lineMats.set(sid, lm)
        let geo = null
        if (valid.length >= 2) {
          geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(valid, false, 'catmullrom', 0), (valid.length - 1) * 16, 0.04, 8)
          stage.scene.add(new THREE.Mesh(geo, lm.mat))
        }
        const total = geo ? geo.index.count : 0
        let validIdx = 0
        pts.forEach((pt, i) => {
          if (!pt) return
          const order = validIdx++
          const g = group(pt.x, pt.y)
          const d = disc(0.15, color)
          g.add(d)
          const v = vals[i]
          const vl = { x: pt.x, y: pt.y + 0.5, label: (sub ? sub + ': ' : '') + formatValue(v, unit, vd) }
          addPoint(sid, i, g, { detail: s.detail || `${catName(i)}: ${formatValue(v, unit, vd)}`, color, vl, legend: sid, cat: '__cat:' + i })
          anims.push((p) => {
            const lp = ease(p)
            d.scale.setScalar(Math.max(clamp01((lp * (valid.length - 1) - order) * 3 + 1), 1e-4))
          })
        })
        if (geo) anims.push((p) => geo.setDrawRange(0, Math.ceil((total * ease(p)) / 6) * 6))
      }
    })
    smooth.push(() => {
      for (const lm of lineMats.values()) { lm.level += (lm.want - lm.level) * 0.1; lm.mat.opacity = lm.level }
    })
  } else if (scatter) {
    const xs = series.flatMap((s) => pointsOf(s).map((p) => (p ? p.x : NaN)))
    const ys = series.flatMap((s) => pointsOf(s).map((p) => (p ? p.y : NaN)))
    const sy = chartScale(ys, H, { zero: false })
    const sx = chartScale(xs, W, { zero: false })
    const toX = (x) => sx.toY(x) // mesma escala, só que na largura (de -W/2 a W/2)
    scaleInfo = sy
    td = tickDigits(sy.ticks)
    vd = valueDigits(sy.ticks)
    tdx = tickDigits(sx.ticks)
    yTicks(sy, -W / 2 - 0.65)
    vline(-W / 2, -H / 2, H / 2, ink, 0.5)
    sx.ticks.forEach((t, k) => {
      const x = toX(t)
      vline(x, -H / 2, H / 2, stage.tubeColor, 0.22)
      textAt('__tick:x' + k, x, -H / 2 - 0.3, formatValue(t, '', tdx))
    })
    legend()
    expand(-W / 2 - 1.6, -H / 2 - 1.2, W / 2 + 1.2, H / 2 + 1.5)
    let total = 0
    series.forEach((s) => { total += pointsOf(s).length })
    let seen = 0
    series.forEach((s, k) => {
      const sid = String(s.id)
      const color = colorOf(k)
      pointsOf(s).forEach((pt, i) => {
        if (!pt) return
        const order = seen++
        const g = group(toX(pt.x), sy.toY(pt.y))
        const d = disc(0.17, color)
        g.add(d)
        const vl = {
          x: toX(pt.x),
          y: sy.toY(pt.y) + 0.5 + 0.3,
          label: (pt.label ? pt.label + ': ' : '') + formatValue(pt.y, unit, vd),
          sub: 'x = ' + formatValue(pt.x, '', tdx),
        }
        addPoint(sid, i, g, { detail: s.detail || pt.label, color, vl, legend: sid })
        anims.push((p) => d.scale.setScalar(Math.max(ease(stagger(p, order, total)), 1e-4)))
      })
    })
  } else {
    // rosca: um anel por série (a primeira por fora); setores por |v|, cor por categoria
    const R = 3
    const cxD = -1.6
    const k = Math.max(series.length, 1)
    const band = R - 1.0
    const thick = Math.min(1.1, (band - (k - 1) * 0.08) / k)
    const nCats = Math.max(cats.length, ...series.map(nOf), 1)
    let anyData = false
    expand(cxD - R - 1.2, -R - 1.2, cxD + R + 6.4, R + 1.2)
    series.forEach((s, j) => {
      const vals = valuesOf(s)
      const sid = String(s.id)
      const r1 = R - j * (thick + 0.08)
      const r0 = r1 - thick
      const slices = donutAngles(vals)
      const tm = new THREE.Mesh(
        new THREE.RingGeometry(r0, r1, 64),
        new THREE.MeshBasicMaterial({ color: stage.tubeColor, transparent: true, opacity: 0.12, side: THREE.DoubleSide }),
      )
      tm.position.set(cxD, 0, -0.05)
      stage.scene.add(tm)
      const sub = series.length > 1 ? String(s.label ?? sid) : undefined
      slices.forEach((sl, i) => {
        if (sl.frac > 0) anyData = true
        const phi = Math.PI / 2 - sl.mid // sentido horário a partir do topo
        const dir = new THREE.Vector2(Math.cos(phi), Math.sin(phi))
        const rm = (r0 + r1) / 2
        const base = new THREE.Vector2(cxD + dir.x * rm, dir.y * rm)
        const g = group(base.x, base.y)
        const color = colorOf(i)
        const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.15, roughness: 0.45, metalness: 0.1, side: THREE.DoubleSide })
        const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat)
        mesh.position.set(cxD - base.x, -base.y, 0)
        mesh.visible = false
        g.add(mesh)
        const v = vals[i]
        const vl = {
          x: cxD + dir.x * (r1 + 0.7),
          y: dir.y * (r1 + 0.7) + 0.2,
          label: formatValue(v, unit, vd),
          sub: sub ? sub + ' · ' + catName(i) : catName(i),
        }
        const id = addPoint(sid, i, g, { detail: s.detail || `${catName(i)}: ${formatValue(v, unit, vd)}`, color, vl, legend: undefined, cat: '__cat:' + i })
        explode.set(id, { group: g, base, dir, cur: 0, want: 0 })
        let lastLen = -1
        anims.push((p) => {
          const sweep = ease(p) * TWO_PI
          const len = Math.max(0, Math.min(sweep - sl.start, sl.end - sl.start))
          if (Math.abs(len - lastLen) < 1e-4) return
          lastLen = len
          mesh.visible = len > 1e-3
          if (!mesh.visible) return
          mesh.geometry.dispose()
          const thetaStart = Math.PI / 2 - (sl.start + len) // ângulo antihorário do início do arco desenhado
          mesh.geometry = new THREE.RingGeometry(r0, r1, Math.max(3, Math.ceil(len * 12)), 1, thetaStart, len)
        })
      })
    })
    // legenda: uma entrada por categoria, em coluna à direita; o sinal marca setor negativo (da primeira série)
    const first = series[0] ? valuesOf(series[0]) : []
    const tot = donutAngles(first)
    for (let i = 0; i < nCats; i++) {
      const g = group(cxD + R + 3.2, ((nCats - 1) / 2 - i) * 1.05)
      g.add(hitBox(0.6, 0.3))
      const neg = fin(first[i]) && first[i] < 0
      const pct = tot[i] && tot[i].frac > 0 ? ' ' + Math.round(tot[i].frac * 100) + '%' : ''
      stage.addPiece('__cat:' + i, g, { label: (neg ? '− ' : '') + catName(i), sub: pct.trim() || undefined, color: colorOf(i) })
      pieces.set('__cat:' + i, g)
    }
    if (!anyData) {
      textAt('__vazio', cxD, 0.1, 'sem dados')
    }
    smooth.push(() => {
      for (const e of explode.values()) {
        e.cur += (e.want - e.cur) * 0.12
        e.group.position.set(e.base.x + e.dir.x * e.cur, e.base.y + e.dir.y * e.cur, 0)
      }
    })
  }

  // ---- laço ----
  const grow = { start: performance.now() }
  const off = stage.onFrame((t, nowMs) => {
    // o palco incha/pulsa as peças em foco; num gráfico isso distorceria as alturas, então a escala fica em 1
    for (const g of lockedScale) g.scale.set(1, 1, 1)
    const p = clamp01((nowMs - grow.start) / GROW_MS)
    for (const a of anims) a(p, nowMs)
    for (const f of smooth) f()
  })

  stage.fit(box.isEmpty() ? undefined : box, { planar: true })

  let token = 0
  return {
    pieces,
    scale: scaleInfo,
    async play(stepIndex, step) {
      ++token
      const focusSeries = (step && Array.isArray(step.focus) ? step.focus : []).map(String)
      const marks = (step && Array.isArray(step.highlight) ? step.highlight : []).map(parseRef).filter((r) => r && pointInfo.has(r.id))
      const lit = new Set()
      const seriesLit = new Set()
      for (const sid of focusSeries) {
        if (seriesPoints.has(sid)) {
          lit.add(sid)
          seriesLit.add(sid)
          for (const id of seriesPoints.get(sid)) lit.add(id)
        } else if (ids.known.has(sid)) lit.add(sid)
      }
      const hl = new Set()
      for (const r of marks) {
        const info = pointInfo.get(r.id)
        hl.add(r.id)
        lit.add(r.id)
        lit.add('__valor:' + r.id)
        seriesLit.add(info.series)
        if (info.legend) lit.add(info.legend)
        if (info.cat) lit.add(info.cat)
      }
      stage.focus(withAxis(lit, axisIds))
      for (const [sid, lm] of lineMats) lm.want = !lit.size || seriesLit.has(sid) ? 0.9 : 0.2
      for (const [id, e] of explode) e.want = hl.has(id) ? 0.28 : 0
      for (const id of pointInfo.keys()) if (hl.has(id) !== shownValue.has(id)) setValue(id, hl.has(id))

      const growing = stepIndex === 0
      grow.start = growing ? stage.now() : -Infinity
      await stage.wait(growing ? GROW_MS + SETTLE_MS : hl.size ? HIGHLIGHT_MS : EMPTY_MS)
    },
    dispose() {
      token++
      off()
      anims.length = 0
      smooth.length = 0
      pieces.clear()
      pointInfo.clear()
    },
  }
}
