// Figuras como textura: URL, recoloração de SVG (só texto), rasterização em canvas e cache por sessão.
// Regra R3: o SVG nunca entra no DOM; vira Blob → Image → canvas → CanvasTexture.
const MONO_STYLES = new Set(['tabler/outline', 'tabler/filled', 'lucide/line', 'fluent/hc'])
const RASTER = 256
const LOAD_TIMEOUT_MS = 8000
const DARK_INK = '#cfd6e4'
const LIGHT_INK = '#2b3140'

// 'fluent/3d:gear' → { estilo: 'fluent/3d', id: 'gear' }
function splitNome(nome) {
  const s = String(nome || '')
  const k = s.lastIndexOf(':')
  return k < 0 ? { estilo: s, id: '' } : { estilo: s.slice(0, k), id: s.slice(k + 1) }
}

export function isMono(nome) {
  const { estilo } = splitNome(nome)
  return MONO_STYLES.has(estilo) || estilo.startsWith('phosphor/')
}

// catalogoIndex (opcional): Map nome → entrada, ou objeto nome → entrada, com `arquivo`.
export function figuraUrl(nome, catalogoIndex) {
  const entry = catalogoIndex && (typeof catalogoIndex.get === 'function' ? catalogoIndex.get(nome) : catalogoIndex[nome])
  if (entry && entry.arquivo) return 'figuras/' + entry.arquivo
  const { estilo, id } = splitNome(nome)
  const ext = estilo === 'fluent/3d' ? 'png' : 'svg'
  return `figuras/${estilo}/${id}.${ext}`
}

export function hexOf(cor) {
  if (typeof cor === 'number') return '#' + (cor & 0xffffff).toString(16).padStart(6, '0')
  if (typeof cor === 'string' && /^#[0-9a-f]{3,8}$/i.test(cor)) return cor
  return null
}

// Troca currentColor pela cor. Fluent hc vem em #212121 fixo, que também é tinta.
export function recolorSvg(texto, cor) {
  const c = hexOf(cor) || DARK_INK
  return String(texto).replace(/currentColor/gi, c).replace(/#212121/gi, c)
}

// SVG sem width/height rasteriza com tamanho indefinido: fixa o tamanho no elemento raiz.
function sizeSvg(texto, px) {
  return texto.replace(/<svg\b([^>]*)>/i, (m, attrs) => {
    const a = attrs.replace(/\s(width|height)\s*=\s*("[^"]*"|'[^']*')/gi, '')
    return `<svg${a} width="${px}" height="${px}">`
  })
}

const cache = new Map() // nome|cor → Promise<Texture | null>
const live = new Set() // texturas entregues e ainda em cache
let generation = 0
// Esvazia o cache e libera as texturas; imagem que chegar depois (timeout, troca de palco) é liberada ao chegar.
export function clearFigureCache() {
  generation++
  cache.clear()
  for (const t of live) t.dispose?.()
  live.clear()
}

function withTimeout(promise, ms, onTimeout) {
  return new Promise((resolve) => {
    const id = setTimeout(() => { onTimeout?.(); resolve(null) }, ms)
    promise.then((v) => { clearTimeout(id); resolve(v) }, () => { clearTimeout(id); resolve(null) })
  })
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('imagem não carregou'))
    img.src = src
  })
}

async function fetchTexture(THREE, url, recolorWith) {
  let img
  if (recolorWith === undefined && !url.endsWith('.svg')) {
    img = await loadImage(url)
  } else {
    const res = await fetch(url)
    if (!res.ok) throw new Error('HTTP ' + res.status)
    let text = await res.text()
    if (recolorWith) text = recolorSvg(text, recolorWith)
    const blobUrl = URL.createObjectURL(new Blob([sizeSvg(text, RASTER)], { type: 'image/svg+xml' }))
    try { img = await loadImage(blobUrl) } finally { URL.revokeObjectURL(blobUrl) }
  }
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = RASTER
  const ctx = canvas.getContext('2d')
  const k = Math.min(RASTER / (img.naturalWidth || RASTER), RASTER / (img.naturalHeight || RASTER))
  const w = (img.naturalWidth || RASTER) * k
  const h = (img.naturalHeight || RASTER) * k
  ctx.drawImage(img, (RASTER - w) / 2, (RASTER - h) / 2, w, h)
  const tex = new THREE.CanvasTexture(canvas)
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  tex.needsUpdate = true
  return tex
}

// → THREE.Texture | null. Nunca lança; falha devolve null (a peça cai na forma). Cache por sessão, com promessa compartilhada.
export function loadFigure(stage, nome, { cor, tom, catalogoIndex, timeoutMs = LOAD_TIMEOUT_MS } = {}) {
  const mono = tom ? tom === 'mono' : isMono(nome)
  const ink = mono ? hexOf(cor) || (stage && stage.theme === 'light' ? LIGHT_INK : DARK_INK) : ''
  const key = `${nome}|${ink}`
  let p = cache.get(key)
  if (!p) {
    const gen = generation
    let timedOut = false
    const raw = (async () => fetchTexture(stage.THREE, figuraUrl(nome, catalogoIndex), mono ? ink : undefined))()
    raw.then((tex) => { // chegou depois do prazo ou de um clear: ninguém vai usar
      if (tex && (timedOut || gen !== generation)) tex.dispose?.()
      else if (tex) live.add(tex)
    }, () => {})
    p = withTimeout(raw, timeoutMs, () => { timedOut = true }).then((tex) => {
      if (!tex) { if (cache.get(key) === p) cache.delete(key) } // falha não fica em cache
      return tex
    })
    cache.set(key, p)
  }
  return p
}
