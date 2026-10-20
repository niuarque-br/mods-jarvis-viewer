import { expect, test } from 'claude-code/testing'

import { validateScene, pieceLabel } from './scene'
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
