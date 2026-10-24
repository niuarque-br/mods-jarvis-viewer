// Toda cena de docs/exemplos precisa passar no validateScene (hooks/scene.ts).
// O kit de testes do mod não lê arquivos .json nem lista pastas, então este teste roda em node
// (que remove os tipos do .ts sozinho) e cobre todos os exemplos, inclusive os das próximas tarefas.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { register } from 'node:module'

// hooks/*.ts importa './figuras' sem extensão (estilo do mod); o carregador do node não completa sozinho.
// Este gancho refaz o pedido com .ts quando um relativo sem extensão não é achado.
register('data:text/javascript,' + encodeURIComponent(String.raw`
export async function resolve(specifier, context, next) {
  try { return await next(specifier, context) } catch (e) {
    if (e && e.code === 'ERR_MODULE_NOT_FOUND' && /^\.{1,2}\//.test(specifier) && !/\.[a-z]+$/i.test(specifier)) return next(specifier + '.ts', context)
    throw e
  }
}`))

const root = new URL('../../../', import.meta.url)
const { validateScene } = await import(new URL('hooks/scene.ts', root).href)
const { parseCatalogo } = await import(new URL('hooks/figuras.ts', root).href)

// Catálogo real, montado dos arquivos por pacote (nunca do catalogo.json de 7 MB); null sem catálogo (script não rodado).
function catalogoReal() {
  const base = fileURLToPath(new URL('assets/figuras/', root))
  const figuras = []
  for (const p of ['fluent', 'tabler', 'lucide', 'phosphor']) {
    const f = `${base}catalogo-${p}.json`
    if (!existsSync(f)) return null
    figuras.push(...JSON.parse(readFileSync(f, 'utf8')).figuras)
  }
  return parseCatalogo(JSON.stringify({ figuras }))
}
const catalogo = catalogoReal()

// Sem catálogo, valida o resto do exemplo: tira as figuras e volta a forma geométrica.
function semFiguras(v) {
  if (Array.isArray(v)) return v.map(semFiguras)
  if (v && typeof v === 'object') {
    const o = {}
    for (const [k, x] of Object.entries(v)) if (k !== 'figura') o[k] = semFiguras(x)
    if (o.shape === 'figura') o.shape = 'caixa'
    return o
  }
  return v
}
const dir = fileURLToPath(new URL('docs/exemplos/', root))
const files = readdirSync(dir).filter((f) => f.endsWith('.json'))

test('há exemplos', () => assert.ok(files.length >= 2))

for (const f of files) {
  test(`docs/exemplos/${f} passa no validateScene`, () => {
    const cena = JSON.parse(readFileSync(dir + f, 'utf8'))
    const v = catalogo ? validateScene(cena, catalogo) : validateScene(semFiguras(cena))
    assert.deepEqual(v.ok ? [] : v.errors, [])
    assert.equal(v.ok, true)
  })
}

test('os exemplos com figuras usam nomes do catálogo real', { skip: !catalogo && 'sem catálogo (rode scripts/baixar-figuras.py)' }, () => {
  const nomes = []
  const anda = (v) => {
    if (Array.isArray(v)) v.forEach(anda)
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) k === 'figura' ? nomes.push(x) : anda(x)
  }
  for (const f of files) anda(JSON.parse(readFileSync(dir + f, 'utf8')))
  assert.ok(nomes.length >= 20)
  for (const n of nomes) assert.ok(catalogo.porNome.has(n), n)
})
