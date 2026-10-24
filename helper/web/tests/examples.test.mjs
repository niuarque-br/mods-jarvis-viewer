// Toda cena de docs/exemplos precisa passar no validateScene (hooks/scene.ts).
// O kit de testes do mod não lê arquivos .json nem lista pastas, então este teste roda em node
// (que remove os tipos do .ts sozinho) e cobre todos os exemplos, inclusive os das próximas tarefas.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
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
const dir = fileURLToPath(new URL('docs/exemplos/', root))
const files = readdirSync(dir).filter((f) => f.endsWith('.json'))

test('há exemplos', () => assert.ok(files.length >= 2))

for (const f of files) {
  test(`docs/exemplos/${f} passa no validateScene`, () => {
    const v = validateScene(JSON.parse(readFileSync(dir + f, 'utf8')))
    assert.deepEqual(v.ok ? [] : v.errors, [])
    assert.equal(v.ok, true)
  })
}
