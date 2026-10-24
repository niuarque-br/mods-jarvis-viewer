import type { Engine } from 'claude-code'

import { SINONIMOS } from './sinonimos'

export type Figura = {
  nome: string
  pacote: string
  estilo: string
  id: string
  arquivo: string
  titulo: string
  palavras: string[]
  categoria: string
  conceito: string
  tom: 'clara' | 'escura' | 'colorida' | 'mono'
}
type Indice = { id: string; palavras: string[] }
export type Catalogo = { figuras: Figura[]; porNome: Map<string, Figura>; indice: Indice[] }
export type Conceito = {
  conceito: string
  titulo: string
  palavras: string[]
  opcoes: { nome: string; estilo: string; tom: string }[]
}

export const SEM_FIGURAS = 'figuras não instaladas; rode scripts/baixar-figuras.py'

const TONS = new Set(['clara', 'escura', 'colorida', 'mono'])
const STOP = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'o', 'a', 'os', 'as', 'um', 'uma'])

const memo = new Map<string, string>()

/** Lowercase, no accents, hyphens/underscores/spaces collapsed to single spaces. */
export function normalizar(s: string): string {
  const hit = memo.get(s)
  if (hit !== undefined) return hit
  const out = s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ')
    .trim()
  if (memo.size < 100000) memo.set(s, out)
  return out
}

const SIN = new Map<string, string[]>(Object.entries(SINONIMOS).map(([k, v]) => [normalizar(k), v.map(normalizar)]))

const isStr = (v: unknown): v is string => typeof v === 'string'

export function parseCatalogo(texto: string): Catalogo | null {
  let raw: unknown
  try {
    raw = JSON.parse(texto)
  } catch {
    return null
  }
  const lista = (raw as { figuras?: unknown } | null)?.figuras
  return Array.isArray(lista) ? montar(lista) : null
}

/** Validates the entries and builds the catalog and its search index; null if any entry is invalid. */
function montar(lista: unknown[]): Catalogo | null {
  const figuras: Figura[] = []
  const porNome = new Map<string, Figura>()
  const indice: Indice[] = []
  for (const f of lista as Record<string, unknown>[]) {
    if (!f || typeof f !== 'object') return null
    if (!isStr(f.nome) || !isStr(f.pacote) || !isStr(f.estilo) || !isStr(f.id) || !isStr(f.arquivo) || !isStr(f.conceito)) return null
    if (!isStr(f.tom) || !TONS.has(f.tom)) return null
    if (!Array.isArray(f.palavras) || !f.palavras.every(isStr)) return null
    const fig: Figura = {
      nome: f.nome,
      pacote: f.pacote,
      estilo: f.estilo,
      id: f.id,
      arquivo: f.arquivo,
      titulo: isStr(f.titulo) ? f.titulo : f.id,
      palavras: f.palavras,
      categoria: isStr(f.categoria) ? f.categoria : '',
      conceito: f.conceito,
      tom: f.tom as Figura['tom'],
    }
    figuras.push(fig)
    porNome.set(fig.nome, fig)
    indice.push({ id: normalizar(fig.id), palavras: [...new Set([normalizar(fig.titulo), ...fig.palavras.map(normalizar)])] })
  }
  return { figuras, porNome, indice }
}

/** Portuguese plural -> singular for one word: "s", "es" (servidores) or "ns" -> "m" (nuvens). */
function singularDe(w: string, regra: 's' | 'es' | 'ns'): string {
  if (w.length <= 3 || !w.endsWith(regra)) return w
  return regra === 'ns' ? w.slice(0, -2) + 'm' : w.slice(0, -regra.length)
}

/** Search keywords: the phrase itself, then its synonyms; a phrase without any is also tried word by word. */
function palavrasDaBusca(termo: string, singular: 's' | 'es' | 'ns' | null = null): string[] {
  let t = normalizar(termo)
  if (singular) t = t.split(' ').map(w => singularDe(w, singular)).join(' ')
  if (!t) return []
  const out: string[] = []
  const add = (k: string) => {
    if (k && !out.includes(k)) out.push(k)
  }
  add(t)
  const direto = SIN.get(t)
  if (direto) direto.forEach(add)
  else {
    const partes = t.split(' ').filter(p => !STOP.has(p))
    if (partes.length > 0) for (const p of partes) {
      add(p)
      SIN.get(p)?.forEach(add)
    }
  }
  return out
}

/** 0 = name/id exact, 1 = keyword exact, 2 = prefix, 3 = contains; 9 = no match. */
function nivel(ix: Indice, nome: string, kw: string): number {
  if (ix.id === kw || nome.toLowerCase() === kw) return 0
  let best = 9
  for (const p of ix.palavras) {
    if (p === kw) return 1
    if (best > 2 && (p.startsWith(kw) || p.includes(` ${kw}`))) best = 2
    else if (best > 3 && kw.length >= 3 && p.includes(kw)) best = 3
  }
  if (best > 2 && ix.id.startsWith(kw)) best = 2
  if (best > 3 && kw.length >= 3 && ix.id.includes(kw)) best = 3
  return best
}

export function buscar(cat: Catalogo, termo: string, opts: { estilo?: string; limite?: number } = {}): Conceito[] {
  // plural em português: sem resultado, tenta de novo sem o "s" e depois sem o "es" e "ns" -> "m"
  for (const sing of [null, 's', 'es', 'ns'] as const) {
    const kws = palavrasDaBusca(termo, sing)
    if (kws.length === 0) return []
    const r = buscarPalavras(cat, kws, opts)
    if (r.length > 0) return r
  }
  return []
}

function buscarPalavras(cat: Catalogo, kws: string[], opts: { estilo?: string; limite?: number }): Conceito[] {
  const limite = Math.max(1, Math.min(50, Math.trunc(opts.limite ?? 8)))
  const filtro = opts.estilo ? normalizar(opts.estilo).replace(/ /g, '-') : ''
  const grupos = new Map<string, { nivel: number; kw: number; figs: Figura[] }>()
  for (let i = 0; i < cat.figuras.length; i++) {
    const f = cat.figuras[i]
    if (filtro) {
      const completo = `${f.pacote}/${f.estilo}`
      if (completo !== filtro && f.pacote !== filtro) continue
    }
    const ix = cat.indice[i]
    let lv = 9
    let k = 0
    for (let j = 0; j < kws.length; j++) {
      const n = nivel(ix, f.nome, kws[j])
      if (n < lv) {
        lv = n
        k = j
        if (n === 0) break
      }
    }
    if (lv === 9) continue
    const g = grupos.get(f.conceito)
    if (!g) grupos.set(f.conceito, { nivel: lv, kw: k, figs: [f] })
    else {
      g.figs.push(f)
      if (lv < g.nivel || (lv === g.nivel && k < g.kw)) {
        g.nivel = lv
        g.kw = k
      }
    }
  }
  const escuraTudo = (figs: Figura[]) => figs.every(f => f.tom === 'escura')
  const ordenados = [...grupos.entries()].sort(([ca, a], [cb, b]) => {
    if (a.nivel !== b.nivel) return a.nivel - b.nivel
    const ea = escuraTudo(a.figs) ? 1 : 0
    const eb = escuraTudo(b.figs) ? 1 : 0
    if (ea !== eb) return ea - eb
    if (a.kw !== b.kw) return a.kw - b.kw
    return ca.length - cb.length || (ca < cb ? -1 : ca > cb ? 1 : 0)
  })
  return ordenados.slice(0, limite).map(([conceito, g]) => {
    const figs = [...g.figs].sort((x, y) => Number(x.tom === 'escura') - Number(y.tom === 'escura'))
    const rep = figs[0]
    return {
      conceito,
      titulo: rep.titulo,
      palavras: rep.palavras,
      opcoes: figs.map(f => ({ nome: f.nome, estilo: `${f.pacote}/${f.estilo}`, tom: f.tom })),
    }
  })
}

let cache: Catalogo | null = null
// The load in flight, shared by parallel calls; cleared when it settles, so a missing catalog is retried next time.
let carregando: Promise<Catalogo | null> | null = null

/** Forgets the loaded catalog (session.start). */
export function esquecerCatalogo(): void {
  cache = null
  carregando = null
}

const PACOTES = ['fluent', 'tabler', 'lucide', 'phosphor']

async function ler($: Engine, nome: string): Promise<string | null> {
  try {
    const t = await $.fs.read(`${$.plugin.root}/assets/figuras/${nome}`)
    return typeof t === 'string' ? t : null
  } catch {
    return null
  }
}

/** Joins the per-package files; 'faltando' when any is missing, null when one is corrupt. */
async function lerPartes($: Engine): Promise<Catalogo | null | 'faltando'> {
  const textos = await Promise.all(PACOTES.map(p => ler($, `catalogo-${p}.json`)))
  if (textos.some(t => t === null)) return 'faltando'
  const figuras: unknown[] = []
  for (const t of textos) {
    let parte: { figuras?: unknown } | null = null
    try {
      parte = JSON.parse(t as string) as { figuras?: unknown }
    } catch {
      return null
    }
    if (!parte || !Array.isArray(parte.figuras)) return null
    figuras.push(...parte.figuras)
  }
  return montar(figuras)
}

/**
 * The installed catalog, read once per session; null when missing or corrupt (not cached, so installing mid-session works).
 * `$.fs.read` stops at 4 MiB and the whole catalog is bigger, so the per-package files are read first; the single
 * catalogo.json is only tried when they are missing (older or hand-made installs).
 */
export function carregarCatalogo($: Engine): Promise<Catalogo | null> {
  if (cache) return Promise.resolve(cache)
  if (carregando) return carregando
  const p = (async () => {
    const partes = await lerPartes($)
    if (partes !== 'faltando') return partes
    const inteiro = await ler($, 'catalogo.json')
    return inteiro === null ? null : parseCatalogo(inteiro)
  })()
  carregando = p
  // A load that session.start forgot meanwhile is not cached.
  void p.then(
    cat => {
      if (carregando !== p) return
      carregando = null
      if (cat) cache = cat
    },
    () => {
      if (carregando === p) carregando = null
    },
  )
  return p
}
