import { expect, mock, test } from 'claude-code/testing'

import { SEM_FIGURAS, buscar, parseCatalogo } from './figuras'
import type { Figura } from './figuras'
import { FIGURE_DESCRIPTION } from './register'
import { SINONIMOS } from './sinonimos'
import { world } from './testkit'

const FIG = 'mcp__jarvis-viewer__buscar_figura'

function fig(pacote: string, estilo: string, id: string, palavras: string[], tom: Figura['tom'] = 'mono', conceito = id): Figura {
  return { nome: `${pacote}/${estilo}:${id}`, pacote, estilo, id, arquivo: `${pacote}/${estilo}/${id}.svg`, titulo: id, palavras, categoria: '', conceito, tom }
}

const FIGURAS: Figura[] = [
  fig('fluent', '3d', 'gear', ['gear', 'cog', 'tool'], 'colorida'),
  fig('fluent', 'flat', 'gear', ['gear', 'cog', 'tool'], 'colorida'),
  fig('tabler', 'outline', 'gear', ['gear', 'settings']),
  fig('tabler', 'outline', 'database', ['database', 'db', 'storage', 'sql']),
  fig('tabler', 'filled', 'database', ['database', 'db', 'storage', 'sql']),
  fig('fluent', '3d', 'file-cabinet', ['database', 'files'], 'escura'),
  fig('lucide', 'line', 'server', ['server', 'host']),
  fig('lucide', 'line', 'microphone', ['microphone', 'mic']),
  fig('fluent', '3d', 'gear-box', ['gearbox'], 'colorida'),
  fig('phosphor', 'bold', 'cloud', ['cloud']),
  fig('lucide', 'line', 'user', ['user', 'person']),
  fig('lucide', 'line', 'robot', ['robot', 'bot']),
]
const TEXTO = JSON.stringify({ versao: 1, figuras: FIGURAS })
const cat = () => parseCatalogo(TEXTO)!
const body = (r: { result?: unknown }): string => String((r.result as { text?: string } | undefined)?.text ?? r.result)

test('banco de dados acha database', () => {
  expect(buscar(cat(), 'Banco de Dados')[0].conceito).toBe('database')
})

test('acento e maiúscula não importam', () => {
  expect(buscar(cat(), 'ENGRENAGEM')[0].conceito).toBe('gear')
  expect(buscar(cat(), 'Engrenagem')).toEqual(buscar(cat(), 'engrenagem'))
})

test('agrupa variantes por conceito', () => {
  const r = buscar(cat(), 'gear').find(c => c.conceito === 'gear')!
  expect(r.opcoes.map(o => o.nome).sort()).toEqual(['fluent/3d:gear', 'fluent/flat:gear', 'tabler/outline:gear'])
  expect(r.opcoes[0].estilo).toContain('/')
})

test('escura vem por último', () => {
  expect(buscar(cat(), 'database').map(c => c.conceito)).toEqual(['database', 'file-cabinet'])
  const so = parseCatalogo(JSON.stringify({ figuras: [fig('fluent', '3d', 'a-db', ['db'], 'escura'), fig('tabler', 'outline', 'b-db', ['db'])] }))!
  expect(buscar(so, 'db').map(c => c.conceito)).toEqual(['b-db', 'a-db'])
})

test('filtro de estilo', () => {
  const r = buscar(cat(), 'gear', { estilo: 'fluent/3d' })
  expect(r.length).toBeGreaterThan(0)
  expect(r.flatMap(c => c.opcoes).every(o => o.estilo === 'fluent/3d')).toBe(true)
  expect(buscar(cat(), 'gear', { estilo: 'tabler' }).flatMap(c => c.opcoes).every(o => o.estilo.startsWith('tabler/'))).toBe(true)
})

test('limite conta conceitos', () => {
  const r = buscar(cat(), 'gear', { limite: 1 })
  expect(r).toHaveLength(1)
  expect(r[0].opcoes.length).toBeGreaterThan(1)
})

test('nome exato vem antes de prefixo', () => {
  expect(buscar(cat(), 'gear').map(c => c.conceito)).toEqual(['gear', 'gear-box'])
})

test('artigo antes de uma palavra só não impede a busca', () => {
  expect(buscar(cat(), 'o servidor')[0].conceito).toBe('server')
  expect(buscar(cat(), 'a nuvem')[0].conceito).toBe('cloud')
  expect(buscar(cat(), 'um robô')[0].conceito).toBe('robot')
})

test('plural em português cai no singular quando nada é achado', () => {
  expect(buscar(cat(), 'servidores')[0].conceito).toBe('server')
  expect(buscar(cat(), 'Usuários')[0].conceito).toBe('user')
  expect(buscar(cat(), 'os servidores')[0].conceito).toBe('server')
  expect(buscar(cat(), 'nuvens')[0].conceito).toBe('cloud')
})

test('sinônimos cobrem os termos pedidos', () => {
  expect(Object.keys(SINONIMOS).length).toBeGreaterThanOrEqual(150)
  const pedidos = 'banco de dados,engrenagem,servidor,nuvem,pessoa,usuario,microfone,lupa,busca,documento,pasta,grafico,dinheiro,seguranca,cadeado,chave,ideia,foguete,relogio,tempo,email,mensagem,alerta,erro,sucesso,check,fila,rede,internet,computador,celular,codigo,robo,cerebro,livro,carrinho,entrega,empresa,equipe'
  for (const k of pedidos.split(',')) expect(SINONIMOS[k], k).toBeDefined()
})

test('catálogo corrompido → null', () => {
  expect(parseCatalogo('{nao e json')).toBeNull()
  expect(parseCatalogo('{"figuras": 3}')).toBeNull()
  expect(parseCatalogo(JSON.stringify({ figuras: [{ nome: 'x' }] }))).toBeNull()
  expect(parseCatalogo(JSON.stringify({ figuras: [{ ...FIGURAS[0], tom: 'rosa' }] }))).toBeNull()
})

test('a descrição da ferramenta é curta', () => {
  expect(FIGURE_DESCRIPTION.length).toBeLessThan(1000)
})

test('ferramenta sem catálogo nega com o texto exato', async ($, on) => {
  mock.clock(on)
  world(on, { fs: 'fail' })
  const r = await $.tool.call({ tool: FIG, termo: 'gear' })
  expect(r.deny).toBe('figuras não instaladas; rode scripts/baixar-figuras.py')
  expect(SEM_FIGURAS).toBe(r.deny)
})

test('ferramenta com catálogo corrompido nega igual', async ($, on) => {
  mock.clock(on)
  world(on, { fs: { 'catalogo.json': '{ruim' } })
  const r = await $.tool.call({ tool: FIG, termo: 'gear' })
  expect(r.deny).toBe(SEM_FIGURAS)
})

test('ferramenta devolve JSON de conceitos', async ($, on) => {
  mock.clock(on)
  world(on, { fs: { 'catalogo.json': TEXTO } })
  const r = await $.tool.call({ tool: FIG, termo: 'Engrenagem', limite: 1 })
  expect(r.deny).toBeUndefined()
  const lista = JSON.parse(body(r))
  expect(lista).toHaveLength(1)
  expect(lista[0].conceito).toBe('gear')
  expect(lista[0].opcoes).toHaveLength(3)
})

test('sem catalogo.json inteiro, junta os arquivos por pacote', async ($, on) => {
  mock.clock(on)
  const parte = (p: string) => JSON.stringify({ figuras: FIGURAS.filter(f => f.pacote === p) })
  world(on, {
    fs: { 'catalogo-fluent.json': parte('fluent'), 'catalogo-tabler.json': parte('tabler'), 'catalogo-lucide.json': parte('lucide'), 'catalogo-phosphor.json': parte('phosphor') },
  })
  const r = await $.tool.call({ tool: FIG, termo: 'servidor' })
  expect(JSON.parse(body(r))[0].conceito).toBe('server')
})

test('chamadas paralelas leem o catálogo uma vez só, direto das partes', async ($, on) => {
  mock.clock(on)
  const parte = (p: string) => JSON.stringify({ figuras: FIGURAS.filter(f => f.pacote === p) })
  const calls = world(on, {
    fs: { 'catalogo-fluent.json': parte('fluent'), 'catalogo-tabler.json': parte('tabler'), 'catalogo-lucide.json': parte('lucide'), 'catalogo-phosphor.json': parte('phosphor') },
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true }) // esquece o catálogo das outras provas
  calls.reads.length = 0
  const rs = await Promise.all(['servidor', 'gear', 'cloud'].map(termo => $.tool.call({ tool: FIG, termo })))
  for (const r of rs) expect(r.deny).toBeUndefined()
  expect(calls.reads).not.toContain('catalogo.json')
  expect([...calls.reads].sort()).toEqual(['catalogo-fluent.json', 'catalogo-lucide.json', 'catalogo-phosphor.json', 'catalogo-tabler.json'])
})

test('sem catálogo, a próxima chamada tenta de novo (instalação no meio da sessão)', async ($, on) => {
  mock.clock(on)
  const fs: Record<string, string> = {}
  const calls = world(on, { fs })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const [a, b] = await Promise.all([$.tool.call({ tool: FIG, termo: 'gear' }), $.tool.call({ tool: FIG, termo: 'gear' })])
  expect(a.deny).toBe(SEM_FIGURAS)
  expect(b.deny).toBe(SEM_FIGURAS)
  fs['catalogo.json'] = TEXTO
  const r = await $.tool.call({ tool: FIG, termo: 'gear' })
  expect(r.deny).toBeUndefined()
  expect(calls.reads.length).toBeGreaterThan(0)
})

test('termo vazio é recusado', async ($, on) => {
  mock.clock(on)
  world(on, { fs: { 'catalogo.json': TEXTO } })
  const r = await $.tool.call({ tool: FIG, termo: '  ' })
  expect(r.deny).toBe('Informe termo (texto).')
})

test('a ferramenta é registrada no começo da sessão', async ($, on) => {
  mock.clock(on)
  const calls = world(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(calls.registered.map(t => t.name)).toContain('buscar_figura')
})
