import { SEM_FIGURAS } from './figuras'
import type { Catalogo } from './figuras'

export const SCENE_TYPES = [
  'arquitetura',
  'fluxo',
  'grafico',
  'timeline',
  'sequencia',
  'estados',
  'camadas',
  'arvore',
  'comparacao',
  'metafora',
] as const
export type SceneType = (typeof SCENE_TYPES)[number]

export const LIMITS = { steps: 12, pieces: 40, say: 200, chartPoints: 100, coord: 20, msMin: 100, msMax: 10000 } as const

export type MetaphorAction = {
  target: string
  do: 'mover' | 'girar' | 'pulsar' | 'aparecer' | 'sumir' | 'seguir'
  to?: [number, number, number]
  path?: [number, number, number][]
  ms?: number
}

export type Step = {
  say: string
  focus?: string[]
  hops?: [string, string][]
  path?: string[]
  highlight?: string[]
  actions?: MetaphorAction[]
}

export type Scene = { title: string; type: SceneType; steps: Step[] } & Record<string, unknown>
export type Validation = { ok: true; scene: Scene } | { ok: false; errors: string[] }

type Obj = Record<string, unknown>
type Kind = 'string' | 'number' | 'boolean'

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string'
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const join = (path: string, key: string): string => (path ? `${path}.${key}` : key)

const SHAPES = ['caixa', 'esfera', 'octaedro', 'cilindro', 'pessoa', 'orbe']
const FLOW_KINDS = ['inicio', 'etapa', 'decisao', 'fim']
const CHARTS = ['barras', 'linhas', 'rosca', 'dispersao']
const META_SHAPES = ['caixa', 'esfera', 'cilindro', 'cone', 'toro', 'plano', 'texto', 'particulas', 'figura']
export const MOVIMENTOS = ['girar', 'pulsar', 'balancar', 'subir', 'respirar', 'piscar'] as const
const ARRANJOS = ['vertical', 'horizontal']
const ARRANJO_TIPOS = ['arvore', 'fluxo', 'camadas']
const ESTILOS_FIGURA = [
  'fluent/3d', 'fluent/color', 'fluent/flat', 'fluent/hc',
  'tabler/outline', 'tabler/filled',
  'lucide/line',
  'phosphor/thin', 'phosphor/light', 'phosphor/regular', 'phosphor/bold', 'phosphor/fill', 'phosphor/duotone',
]
const META_DO = ['mover', 'girar', 'pulsar', 'aparecer', 'sumir', 'seguir']
const KIND_NAME: Record<Kind, string> = { string: 'texto', number: 'número', boolean: 'booleano' }

class Check {
  errors: string[] = []
  ids = new Set<string>()
  catalogo: Catalogo | null | undefined

  err(path: string, reason: string): void {
    const msg = `${path}: ${reason}`
    if (!this.errors.includes(msg)) this.errors.push(msg)
  }
  list(parent: Obj, key: string, path = key): Obj[] | undefined {
    const v = parent[key]
    if (!Array.isArray(v)) {
      this.err(path, 'obrigatório (lista)')
      return undefined
    }
    return v.map((item, i) => {
      if (isObj(item)) return item
      this.err(`${path}[${i}]`, 'precisa ser um objeto')
      return {}
    })
  }
  text(o: Obj, key: string, path: string): void {
    const v = o[key]
    if (!isStr(v) || v.trim() === '') this.err(join(path, key), 'obrigatório')
  }
  oneOf(o: Obj, key: string, path: string, values: string[], required: boolean): void {
    const v = o[key]
    if (v === undefined) {
      if (required) this.err(join(path, key), 'obrigatório')
    } else if (!isStr(v) || !values.includes(v)) {
      this.err(join(path, key), `precisa ser um de ${values.join(', ')}`)
    }
  }
  optional(o: Obj, key: string, path: string, kind: Kind): void {
    const v = o[key]
    if (v !== undefined && typeof v !== kind) this.err(join(path, key), `precisa ser ${KIND_NAME[kind]}`)
  }
  vec3(v: unknown, path: string): void {
    if (!Array.isArray(v) || v.length !== 3 || !v.every(isNum)) this.err(path, 'precisa ser [x, y, z] com números')
  }
  // Ids are unique across every item of the scene.
  id(o: Obj, path: string): void {
    const v = o.id
    if (!isStr(v) || v.trim() === '') return this.err(`${path}.id`, 'obrigatório')
    if (this.ids.has(v)) return this.err(`${path}.id`, `id "${v}" repetido`)
    this.ids.add(v)
  }
  // Optional `figura` (must exist in the catalog) and `movimento`.
  figura(o: Obj, path: string): void {
    const f = o.figura
    if (f !== undefined) {
      if (!isStr(f) || f.trim() === '') this.err(join(path, 'figura'), 'precisa ser texto')
      else if (!this.catalogo) this.err(join(path, 'figura'), SEM_FIGURAS)
      else if (!this.catalogo.porNome.has(f)) this.err(join(path, 'figura'), `figura "${f}" não existe`)
    }
    this.oneOf(o, 'movimento', path, [...MOVIMENTOS], false)
  }
  item(o: Obj, path: string, labelRequired = true): void {
    this.id(o, path)
    if (labelRequired) this.text(o, 'label', path)
    else this.optional(o, 'label', path, 'string')
    this.optional(o, 'detail', path, 'string')
  }
  ref(v: unknown, path: string, known: Set<string>): void {
    if (!isStr(v) || !known.has(v)) this.err(path, `id "${String(v)}" não existe`)
  }
  limit(path: string, count: number): void {
    if (count > LIMITS.pieces) this.err(path, `no máximo ${LIMITS.pieces} peças (veio ${count})`)
  }
}

const FIGURA_KEYS = ['nodes', 'states', 'layers']

function checkEdges(c: Check, scene: Obj, key: string): void {
  c.list(scene, key)?.forEach((e, i) => {
    c.ref(e.from, `${key}[${i}].from`, c.ids)
    c.ref(e.to, `${key}[${i}].to`, c.ids)
    c.optional(e, 'label', `${key}[${i}]`, 'string')
  })
}

// Pass 1: each type's own collections and their ids.
function checkBody(c: Check, scene: Obj, type: SceneType): void {
  const nodes = (key: string, fn?: (n: Obj, p: string) => void, labelRequired = true): Obj[] => {
    const arr = c.list(scene, key) ?? []
    arr.forEach((n, i) => {
      c.item(n, `${key}[${i}]`, labelRequired)
      if (FIGURA_KEYS.includes(key)) c.figura(n, `${key}[${i}]`)
      fn?.(n, `${key}[${i}]`)
    })
    c.limit(key, arr.length)
    return arr
  }
  switch (type) {
    case 'arquitetura':
      nodes('nodes', (n, p) => {
        c.optional(n, 'sub', p, 'string')
        c.optional(n, 'group', p, 'string')
        c.oneOf(n, 'shape', p, SHAPES, false)
      })
      break
    case 'fluxo':
      nodes('nodes', (n, p) => c.oneOf(n, 'kind', p, FLOW_KINDS, true))
      break
    case 'timeline':
      nodes('events', (n, p) => c.text(n, 'date', p))
      break
    case 'estados':
      nodes('states', (n, p) => c.optional(n, 'initial', p, 'boolean'))
      break
    case 'camadas':
      nodes('layers', (n, p) => {
        const items = n.items
        if (items !== undefined && (!Array.isArray(items) || !items.every(isStr))) c.err(`${p}.items`, 'precisa ser lista de textos')
      })
      break
    case 'metafora':
      nodes('objects', (n, p) => {
        c.oneOf(n, 'shape', p, META_SHAPES, true)
        c.vec3(n.pos, `${p}.pos`)
        if (Array.isArray(n.pos) && n.pos.length === 3 && n.pos.every(isNum) && n.pos.some((x) => Math.abs(x) > LIMITS.coord))
          c.err(`${p}.pos`, `cada coordenada entre -${LIMITS.coord} e ${LIMITS.coord}`)
        c.optional(n, 'size', p, 'number')
        c.optional(n, 'color', p, 'string')
        if (isStr(n.color) && !/^#[0-9a-fA-F]{6}$/.test(n.color)) c.err(`${p}.color`, 'precisa ser uma cor no formato #rrggbb')
        c.optional(n, 'text', p, 'string')
        if (n.shape === 'texto' && (!isStr(n.text) || n.text === '')) c.err(`${p}.text`, 'obrigatório para shape "texto"')
        if (n.shape === 'figura' && n.figura === undefined) c.err(`${p}.figura`, 'obrigatório para shape "figura"')
        else if (n.figura !== undefined && n.shape !== 'figura') c.err(`${p}.figura`, 'só vale com shape "figura"')
        else if (n.figura !== undefined) c.figura(n, p)
      }, false)
      break
    case 'sequencia': {
      const actors = c.list(scene, 'actors') ?? []
      actors.forEach((a, i) => {
        c.item(a, `actors[${i}]`)
        c.figura(a, `actors[${i}]`)
      })
      const actorIds = new Set(actors.map((a) => a.id).filter(isStr))
      const msgs = c.list(scene, 'messages') ?? []
      msgs.forEach((m, i) => {
        const p = `messages[${i}]`
        c.item(m, p)
        c.ref(m.from, `${p}.from`, actorIds)
        c.ref(m.to, `${p}.to`, actorIds)
      })
      c.limit('actors/messages', actors.length + msgs.length)
      break
    }
    case 'arvore': {
      const arr = nodes('nodes', (n, p) => c.optional(n, 'parent', p, 'string'))
      const roots = arr.filter((n) => n.parent === undefined).length
      if (roots !== 1) c.err('nodes', `a árvore precisa de exatamente uma raiz (veio ${roots})`)
      break
    }
    case 'grafico': {
      const scatter = scene.chart === 'dispersao'
      c.oneOf(scene, 'chart', '', CHARTS, true)
      c.optional(scene, 'unit', '', 'string')
      const cats = scene.categories
      let ncat = 0
      if (!scatter) {
        if (!Array.isArray(cats) || !cats.every(isStr)) c.err('categories', 'obrigatório (lista de textos)')
        else {
          ncat = cats.length
          if (ncat > LIMITS.chartPoints) c.err('categories', `no máximo ${LIMITS.chartPoints} pontos (veio ${ncat})`)
        }
      }
      nodes('series', (s, p) => {
        if (scatter) {
          if (!Array.isArray(s.points)) return c.err(`${p}.points`, 'obrigatório (lista)')
          if (s.points.length > LIMITS.chartPoints) c.err(`${p}.points`, `no máximo ${LIMITS.chartPoints} pontos (veio ${s.points.length})`)
          s.points.forEach((pt, j) => {
            if (!isObj(pt) || !isNum(pt.x) || !isNum(pt.y)) c.err(`${p}.points[${j}]`, 'precisa de x e y numéricos')
            else c.optional(pt, 'label', `${p}.points[${j}]`, 'string')
          })
        } else {
          const v = s.values
          if (!Array.isArray(v)) return c.err(`${p}.values`, 'obrigatório (lista de números)')
          if (!v.every(isNum)) c.err(`${p}.values`, 'precisa ser lista de números')
          else if (Array.isArray(cats) && v.length !== ncat) c.err(`${p}.values`, `um valor por categoria (${ncat} categorias, veio ${v.length})`)
        }
      })
      break
    }
    case 'comparacao': {
      const sides = c.list(scene, 'sides') ?? []
      if (sides.length !== 2) c.err('sides', `exatamente 2 lados (veio ${sides.length})`)
      let count = sides.length
      sides.forEach((s, i) => {
        const p = `sides[${i}]`
        c.item(s, p)
        const items = c.list(s, 'items', `${p}.items`) ?? []
        count += items.length
        items.forEach((it, j) => {
          c.item(it, `${p}.items[${j}]`)
          c.figura(it, `${p}.items[${j}]`)
          const v = it.value
          if (v !== undefined && !isStr(v) && !isNum(v)) c.err(`${p}.items[${j}].value`, 'precisa ser texto ou número')
        })
      })
      c.limit('sides', count)
      break
    }
  }
}

// Pass 2: relations that need the complete id set.
function checkRelations(c: Check, scene: Obj, type: SceneType): void {
  if (type === 'arquitetura') checkEdges(c, scene, 'links')
  else if (type === 'fluxo') checkEdges(c, scene, 'edges')
  else if (type === 'estados') checkEdges(c, scene, 'transitions')
  else if (type === 'arvore') {
    const nodes = (Array.isArray(scene.nodes) ? scene.nodes : []).filter((n): n is Obj => isObj(n) && isStr(n.id))
    const parent = new Map<string, string | undefined>()
    nodes.forEach((n, i) => {
      if (n.parent !== undefined && !c.ids.has(n.parent as string)) c.err(`nodes[${i}].parent`, `id "${String(n.parent)}" não existe`)
      parent.set(n.id as string, isStr(n.parent) ? n.parent : undefined)
    })
    for (const id of parent.keys()) {
      const seen = new Set<string>()
      let cur: string | undefined = id
      while (cur !== undefined && parent.has(cur) && !seen.has(cur)) {
        seen.add(cur)
        cur = parent.get(cur)
      }
      if (cur !== undefined && seen.has(cur)) {
        c.err('nodes', `ciclo na árvore em "${id}"`)
        break
      }
    }
  }
}

function checkSteps(c: Check, scene: Obj, type: SceneType): void {
  const raw = scene.steps
  if (!Array.isArray(raw) || raw.length === 0) return c.err('steps', 'obrigatório (pelo menos 1 passo)')
  if (raw.length > LIMITS.steps) c.err('steps', `no máximo ${LIMITS.steps} passos (veio ${raw.length})`)
  const known = c.ids

  // Chart highlights are "<serieId>#<index>"; the index bound is the point count.
  const seriesLen = new Map<string, number>()
  if (type === 'grafico' && Array.isArray(scene.series)) {
    const cats = Array.isArray(scene.categories) ? scene.categories.length : 0
    for (const s of scene.series) {
      if (!isObj(s) || !isStr(s.id)) continue
      seriesLen.set(s.id, scene.chart === 'dispersao' ? (Array.isArray(s.points) ? s.points.length : 0) : cats)
    }
  }

  raw.forEach((step, i) => {
    const p = `steps[${i}]`
    if (!isObj(step)) return c.err(p, 'precisa ser um objeto')
    const say = step.say
    if (!isStr(say) || say.trim() === '') c.err(`${p}.say`, 'obrigatório')
    else if (say.length > LIMITS.say) c.err(`${p}.say`, `no máximo ${LIMITS.say} caracteres (veio ${say.length})`)

    for (const key of ['focus', 'path'] as const) {
      const v = step[key]
      if (v === undefined) continue
      if (!Array.isArray(v)) c.err(`${p}.${key}`, 'precisa ser lista de ids')
      else v.forEach((id) => c.ref(id, `${p}.${key}`, known))
    }

    const hops = step.hops
    if (hops !== undefined) {
      if (!Array.isArray(hops)) c.err(`${p}.hops`, 'precisa ser lista de pares [de, para]')
      else
        hops.forEach((h, j) => {
          if (!Array.isArray(h) || h.length !== 2) return c.err(`${p}.hops[${j}]`, 'precisa ser um par [de, para]')
          h.forEach((id) => c.ref(id, `${p}.hops[${j}]`, known))
        })
    }

    const hl = step.highlight
    if (hl !== undefined) {
      if (!Array.isArray(hl)) c.err(`${p}.highlight`, 'precisa ser lista de ids')
      else if (type === 'grafico')
        hl.forEach((ref) => {
          const m = isStr(ref) ? /^(.+)#(\d+)$/.exec(ref) : null
          const n = m ? seriesLen.get(m[1]!) : undefined
          if (!m || n === undefined || Number(m[2]) >= n) c.err(`${p}.highlight`, `id "${String(ref)}" não existe`)
        })
      else hl.forEach((id) => c.ref(id, `${p}.highlight`, known))
    }

    const actions = step.actions
    if (actions !== undefined) {
      if (!Array.isArray(actions)) c.err(`${p}.actions`, 'precisa ser lista')
      else
        actions.forEach((a, j) => {
          const ap = `${p}.actions[${j}]`
          if (!isObj(a)) return c.err(ap, 'precisa ser um objeto')
          c.ref(a.target, `${ap}.target`, known)
          c.oneOf(a, 'do', ap, META_DO, true)
          if (a.to !== undefined) c.vec3(a.to, `${ap}.to`)
          if (a.path !== undefined) {
            if (!Array.isArray(a.path)) c.err(`${ap}.path`, 'precisa ser lista de [x, y, z]')
            else a.path.forEach((pt, k) => c.vec3(pt, `${ap}.path[${k}]`))
          }
          c.optional(a, 'ms', ap, 'number')
          if (isNum(a.ms) && (a.ms < LIMITS.msMin || a.ms > LIMITS.msMax)) c.err(`${ap}.ms`, `entre ${LIMITS.msMin} e ${LIMITS.msMax}`)
          else if (typeof a.ms === 'number' && !isNum(a.ms)) c.err(`${ap}.ms`, `entre ${LIMITS.msMin} e ${LIMITS.msMax}`)
        })
    }
  })
}

function checkEstilo(c: Check, scene: Obj, type: SceneType): void {
  const e = scene.estilo
  if (e === undefined) return
  if (!isObj(e)) return c.err('estilo', 'precisa ser um objeto')
  c.oneOf(e, 'forma', 'estilo', SHAPES, false)
  c.oneOf(e, 'figuras', 'estilo', ESTILOS_FIGURA, false)
  c.oneOf(e, 'arranjo', 'estilo', ARRANJOS, false)
  if (e.arranjo !== undefined && ARRANJOS.includes(e.arranjo as string) && !ARRANJO_TIPOS.includes(type))
    c.err('estilo.arranjo', 'só vale em arvore, fluxo e camadas')
}

/** True when any item of the scene names a `figura` (so the caller only loads the catalog then). */
export function usaFigura(input: unknown): boolean {
  if (!isObj(input)) return false
  const walk = (v: unknown): boolean =>
    Array.isArray(v) ? v.some(walk) : isObj(v) ? v.figura !== undefined || Object.values(v).some(walk) : false
  return walk(input.nodes) || walk(input.states) || walk(input.layers) || walk(input.actors) || walk(input.sides) || walk(input.objects)
}

export function validateScene(input: unknown, catalogo?: Catalogo | null): Validation {
  if (!isObj(input)) return { ok: false, errors: ['cena: precisa ser um objeto'] }
  const c = new Check()
  c.catalogo = catalogo
  c.text(input, 'title', '')
  const type = input.type
  if (!isStr(type) || !(SCENE_TYPES as readonly string[]).includes(type)) {
    c.err('type', `tipo desconhecido "${String(type)}"`)
    return { ok: false, errors: c.errors }
  }
  const t = type as SceneType
  checkEstilo(c, input, t)
  checkBody(c, input, t)
  checkRelations(c, input, t)
  checkSteps(c, input, t)
  return c.errors.length ? { ok: false, errors: c.errors } : { ok: true, scene: input as Scene }
}

// Label of a chart point `série#i`: "<série> · <categoria>" (dispersao: the point's own label).
function pointLabel(scene: Scene, id: string): string | undefined {
  const m = /^(.*)#(\d+)$/.exec(id)
  if (!m || scene.type !== 'grafico' || !Array.isArray(scene.series)) return undefined
  const s = scene.series.find(it => isObj(it) && it.id === m[1])
  if (!isObj(s)) return undefined
  const i = Number(m[2])
  const name = isStr(s.label) ? s.label : m[1]
  if (scene.chart === 'dispersao') {
    const pt = Array.isArray(s.points) ? s.points[i] : undefined
    if (!isObj(pt)) return undefined
    return isStr(pt.label) && pt.label !== '' ? pt.label : `${name} · ${i + 1}`
  }
  const cats = Array.isArray(scene.categories) ? scene.categories : []
  return i < cats.length && isStr(cats[i]) ? `${name} · ${cats[i]}` : undefined
}

// Label of the piece (or sub-item) with this id, for click messages and captions.
export function pieceLabel(scene: Scene, id: string): string | undefined {
  const point = pointLabel(scene, id)
  if (point !== undefined) return point
  const find = (arr: unknown): string | undefined => {
    if (!Array.isArray(arr)) return undefined
    for (const it of arr) {
      if (!isObj(it)) continue
      if (it.id === id && isStr(it.label)) return it.label
      const inner = find(it.items)
      if (inner !== undefined) return inner
    }
    return undefined
  }
  for (const key of ['nodes', 'series', 'events', 'actors', 'messages', 'states', 'layers', 'sides', 'objects']) {
    const r = find(scene[key])
    if (r !== undefined) return r
  }
  return undefined
}
