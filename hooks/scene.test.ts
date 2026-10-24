import { expect, test } from 'claude-code/testing'

import { parseCatalogo } from './figuras'
import { validateScene, pieceLabel, usaFigura } from './scene'
import type { Scene } from './scene'

const S = [{ say: 'passo' }]
const range = (n: number): string[] => Array.from({ length: n }, (_, i) => `n${i}`)
const errs = (x: unknown): string[] => {
  const v = validateScene(x)
  return v.ok ? [] : v.errors
}

const ARQ = {
  title: 'Arq',
  type: 'arquitetura',
  nodes: [
    { id: 'a', label: 'A' },
    { id: 'aux', label: 'Auxiliar' },
  ],
  links: [{ from: 'a', to: 'aux' }],
  steps: S,
}
const arqWithNodes = (ids: string[]) => ({ ...ARQ, nodes: ids.map((id) => ({ id, label: id })), links: [] })
const arqWithSteps = (n: number) => ({ ...ARQ, steps: Array.from({ length: n }, () => ({ say: 'x' })) })
const arqWithSay = (say: string) => ({ ...ARQ, steps: [{ say }] })
const arqWithHops = (hops: [string, string][]) => ({ ...ARQ, steps: [{ say: 'x', hops }] })

const arvoreTwoRoots = {
  title: 'T',
  type: 'arvore',
  nodes: [
    { id: 'r1', label: 'R1' },
    { id: 'r2', label: 'R2' },
  ],
  steps: S,
}
const cmp3 = {
  title: 'C',
  type: 'comparacao',
  sides: [1, 2, 3].map((n) => ({ id: `s${n}`, label: `S${n}`, items: [] })),
  steps: S,
}
const barsShort = {
  title: 'G',
  type: 'grafico',
  chart: 'barras',
  categories: ['a', 'b', 'c'],
  series: [{ id: 'v', label: 'V', values: [1, 2] }],
  steps: S,
}

const FIXTURES = [
  ARQ,
  { title: 'F', type: 'fluxo', nodes: [{ id: 'i', label: 'I', kind: 'inicio' }, { id: 'f', label: 'F', kind: 'fim' }], edges: [{ from: 'i', to: 'f' }], steps: S },
  { ...barsShort, series: [{ id: 'v', label: 'V', values: [1, 2, 3] }] },
  { title: 'T', type: 'timeline', events: [{ id: 'e1', date: '2020', label: 'E1' }], steps: S },
  {
    title: 'S',
    type: 'sequencia',
    actors: [{ id: 'u', label: 'U' }, { id: 'v', label: 'V' }],
    messages: [{ id: 'm1', from: 'u', to: 'v', label: 'oi' }],
    steps: [{ say: 'x', hops: [['u', 'v']], highlight: ['m1'] }],
  },
  { title: 'E', type: 'estados', states: [{ id: 's1', label: 'S1', initial: true }, { id: 's2', label: 'S2' }], transitions: [{ from: 's1', to: 's2' }], steps: S },
  { title: 'L', type: 'camadas', layers: [{ id: 'l1', label: 'L1', items: ['x'] }], steps: S },
  { title: 'A', type: 'arvore', nodes: [{ id: 'r', label: 'R' }, { id: 'c', label: 'C', parent: 'r' }], steps: S },
  {
    title: 'C',
    type: 'comparacao',
    sides: [
      { id: 'l', label: 'L', items: [{ id: 'l1', label: 'L1', value: 3 }] },
      { id: 'r', label: 'R', items: [{ id: 'r1', label: 'R1' }] },
    ],
    steps: S,
  },
  {
    title: 'M',
    type: 'metafora',
    objects: [{ id: 'o', shape: 'caixa', pos: [0, 0, 0] }],
    steps: [{ say: 'x', actions: [{ target: 'o', do: 'mover', to: [1, 0, 0] }] }],
  },
]

test('aceita uma cena mínima de cada tipo', () => {
  expect(FIXTURES.length).toBe(10)
  for (const s of FIXTURES) expect(errs(s)).toEqual([])
})
test('recusa tipo desconhecido', () => expect(errs({ ...ARQ, type: 'pizza' })).toContain('type: tipo desconhecido "pizza"'))
test('recusa id inexistente no foco', () =>
  expect(errs({ ...ARQ, steps: [{ say: 'a', focus: ['x'] }] })).toContain('steps[0].focus: id "x" não existe'))
test('recusa id repetido', () => expect(errs(arqWithNodes(['a', 'a']))).toContain('nodes[1].id: id "a" repetido'))
test('limite de 12 passos', () => expect(errs(arqWithSteps(13))).toContain('steps: no máximo 12 passos (veio 13)'))
test('limite de 40 peças', () => expect(errs(arqWithNodes(range(41)))).toContain('nodes: no máximo 40 peças (veio 41)'))
test('say até 200 caracteres', () => expect(errs(arqWithSay('x'.repeat(201)))).toContain('steps[0].say: no máximo 200 caracteres (veio 201)'))
test('say obrigatório e não vazio', () => expect(errs(arqWithSay('  '))).toContain('steps[0].say: obrigatório'))
test('hop entre ids existentes', () => expect(errs(arqWithHops([['a', 'zz']]))).toContain('steps[0].hops[0]: id "zz" não existe'))
test('arvore com duas raízes', () => expect(errs(arvoreTwoRoots)).toContain('nodes: a árvore precisa de exatamente uma raiz (veio 2)'))
test('comparacao com 3 lados', () => expect(errs(cmp3)).toContain('sides: exatamente 2 lados (veio 3)'))
test('grafico de barras com valores faltando', () =>
  expect(errs(barsShort)).toContain('series[0].values: um valor por categoria (3 categorias, veio 2)'))
test('pieceLabel', () => expect(pieceLabel(ARQ as unknown as Scene, 'aux')).toBe('Auxiliar'))

test('junta todos os erros, não só o primeiro', () => {
  const e = errs({ ...ARQ, nodes: [{ id: 'a', label: 'A' }, { id: 'a', label: 'B' }], links: [{ from: 'q', to: 'a' }], steps: [{ say: ' ' }] })
  expect(e).toEqual(['nodes[1].id: id "a" repetido', 'links[0].from: id "q" não existe', 'steps[0].say: obrigatório'])
})
test('destaque de gráfico usa série#índice', () => {
  const g = { ...FIXTURES[2]! }
  expect(errs({ ...g, steps: [{ say: 'x', highlight: ['v#2'] }] })).toEqual([])
  expect(errs({ ...g, steps: [{ say: 'x', highlight: ['v#3'] }] })).toContain('steps[0].highlight: id "v#3" não existe')
})
test('entrada que não é objeto', () => expect(errs(null)).toEqual(['cena: precisa ser um objeto']))

const META = (over: Record<string, unknown> = {}, action: Record<string, unknown> = {}) => ({
  title: 'M',
  type: 'metafora',
  objects: [{ id: 'o', shape: 'caixa', pos: [0, 0, 0], ...over }],
  steps: [{ say: 'x', actions: [{ target: 'o', do: 'mover', to: [1, 0, 0], ...action }] }],
})
test('metafora: pos com 3 números finitos', () => {
  expect(errs(META({ pos: [0, 0] }))).toContain('objects[0].pos: precisa ser [x, y, z] com números')
  expect(errs(META({ pos: [0, 0, 'a'] }))).toContain('objects[0].pos: precisa ser [x, y, z] com números')
  expect(errs(META({ pos: [0, 0, null] }))).toContain('objects[0].pos: precisa ser [x, y, z] com números')
  expect(errs(META({ pos: [0, Infinity, 0] }))).toContain('objects[0].pos: precisa ser [x, y, z] com números')
})
test('metafora: coordenadas até 20 em módulo', () => {
  expect(errs(META({ pos: [20, -20, 20] }))).toEqual([])
  expect(errs(META({ pos: [21, 0, 0] }))).toContain('objects[0].pos: cada coordenada entre -20 e 20')
  expect(errs(META({ pos: [0, -20.5, 0] }))).toContain('objects[0].pos: cada coordenada entre -20 e 20')
})
test('metafora: ms entre 100 e 10000', () => {
  expect(errs(META({}, { ms: 100 }))).toEqual([])
  expect(errs(META({}, { ms: 10000 }))).toEqual([])
  expect(errs(META({}, { ms: 99 }))).toContain('steps[0].actions[0].ms: entre 100 e 10000')
  expect(errs(META({}, { ms: 10001 }))).toContain('steps[0].actions[0].ms: entre 100 e 10000')
  expect(errs(META({}, { ms: 'rápido' }))).toContain('steps[0].actions[0].ms: precisa ser número')
  expect(errs(META({}, { ms: NaN }))).toContain('steps[0].actions[0].ms: entre 100 e 10000')
})
test('metafora: cor no formato #rrggbb', () => {
  expect(errs(META({ color: '#D97757' }))).toEqual([])
  expect(errs(META({ color: 'vermelho' }))).toContain('objects[0].color: precisa ser uma cor no formato #rrggbb')
  expect(errs(META({ color: '#fff' }))).toContain('objects[0].color: precisa ser uma cor no formato #rrggbb')
  expect(errs(META({ color: '#12345g' }))).toContain('objects[0].color: precisa ser uma cor no formato #rrggbb')
  expect(errs(META({ color: 5 }))).toContain('objects[0].color: precisa ser texto')
})
test('metafora: ação com alvo inexistente é recusada', () =>
  expect(errs(META({}, { target: 'zz' }))).toContain('steps[0].actions[0].target: id "zz" não existe'))

test('pieceLabel de ponto de gráfico: série · categoria (M2)', () => {
  const bar = {
    title: 'Vendas', type: 'grafico', chart: 'barras', categories: ['Jan', 'Fev'],
    series: [{ id: 'v', label: 'Vendas', values: [10, 14] }], steps: [{ say: 'x' }],
  } as unknown as Scene
  expect(pieceLabel(bar, 'v#1')).toBe('Vendas · Fev')
  expect(pieceLabel(bar, 'v')).toBe('Vendas')
  expect(pieceLabel(bar, 'v#9')).toBeUndefined()
  expect(pieceLabel(bar, 'x#0')).toBeUndefined()
  const scatter = {
    title: 'P', type: 'grafico', chart: 'dispersao',
    series: [{ id: 'p', label: 'Pontos', points: [{ x: 1, y: 2, label: 'Alfa' }, { x: 3, y: 4 }] }], steps: [{ say: 'x' }],
  } as unknown as Scene
  expect(pieceLabel(scatter, 'p#0')).toBe('Alfa')
  expect(pieceLabel(scatter, 'p#1')).toBe('Pontos · 2')
})

// --- figura / movimento / estilo ---
const CAT = parseCatalogo(
  JSON.stringify({
    figuras: [
      { nome: 'fluent/3d:gear', pacote: 'fluent', estilo: '3d', id: 'gear', arquivo: 'fluent/3d/gear.svg', titulo: 'gear', palavras: ['gear'], categoria: '', conceito: 'gear', tom: 'colorida' },
    ],
  }),
)!
const errsC = (x: unknown, cat: typeof CAT | null | undefined = CAT): string[] => {
  const v = validateScene(x, cat)
  return v.ok ? [] : v.errors
}
const arqFig = (f: string, extra: Record<string, unknown> = {}) => ({
  ...ARQ,
  nodes: [{ id: 'a', label: 'A' }, { id: 'aux', label: 'Auxiliar', figura: f, ...extra }],
})

test('figura válida passa', () => expect(errsC(arqFig('fluent/3d:gear', { movimento: 'girar' }))).toEqual([]))
test('figura inexistente', () =>
  expect(errsC(arqFig('fluent/3d:xyz'))).toEqual(['nodes[1].figura: figura "fluent/3d:xyz" não existe']))
test('sem catálogo e com figura', () => {
  const t = 'nodes[1].figura: figuras não instaladas; rode scripts/baixar-figuras.py'
  expect(errsC(arqFig('fluent/3d:gear'), null)).toEqual([t])
  expect(errs(arqFig('fluent/3d:gear'))).toEqual([t])
})
test('movimento inválido', () =>
  expect(errsC(arqFig('fluent/3d:gear', { movimento: 'voar' }))).toEqual([
    'nodes[1].movimento: precisa ser um de girar, pulsar, balancar, subir, respirar, piscar',
  ]))
test('estilo.arranjo só em arvore/fluxo/camadas', () => {
  expect(errs({ ...ARQ, estilo: { arranjo: 'vertical' } })).toEqual(['estilo.arranjo: só vale em arvore, fluxo e camadas'])
  expect(errs({ ...FIXTURES[7], estilo: { arranjo: 'horizontal', forma: 'esfera', figuras: 'tabler/outline' } })).toEqual([])
  expect(errs({ ...ARQ, estilo: { forma: 'cubo', figuras: 'x/y' } }).length).toBe(2)
})
test('metafora shape figura exige figura', () => {
  const m = (o: Record<string, unknown>) => ({ ...FIXTURES[9], objects: [{ id: 'o', pos: [0, 0, 0], ...o }] })
  expect(errsC(m({ shape: 'figura' }))).toEqual(['objects[0].figura: obrigatório para shape "figura"'])
  expect(errsC(m({ shape: 'figura', figura: 'fluent/3d:gear' }))).toEqual([])
  expect(errsC(m({ shape: 'caixa', figura: 'fluent/3d:gear' }))).toEqual(['objects[0].figura: só vale com shape "figura"'])
})
test('figura em sequência, estados, camadas e comparação', () => {
  const f = 'fluent/3d:nada'
  const w = (i: number, key: string, mut: (x: any) => void) => {
    const s = JSON.parse(JSON.stringify(FIXTURES[i]))
    mut(s[key])
    return errsC(s)
  }
  expect(w(4, 'actors', (a) => (a[0].figura = f))).toEqual([`actors[0].figura: figura "${f}" não existe`])
  expect(w(5, 'states', (a) => (a[0].figura = f))).toEqual([`states[0].figura: figura "${f}" não existe`])
  expect(w(6, 'layers', (a) => (a[0].figura = f))).toEqual([`layers[0].figura: figura "${f}" não existe`])
  expect(w(8, 'sides', (a) => (a[0].items[0].figura = f))).toEqual([`sides[0].items[0].figura: figura "${f}" não existe`])
})
test('cena sem campos novos continua igual', () => {
  for (const s of FIXTURES) expect(errsC(s, null)).toEqual([])
})
test('usaFigura', () => {
  expect(usaFigura(arqFig('x'))).toBe(true)
  expect(usaFigura(ARQ)).toBe(false)
})
