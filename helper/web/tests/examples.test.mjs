// Toda cena de docs/exemplos precisa passar no validateScene (hooks/scene.ts).
// O kit de testes do mod não lê arquivos .json nem lista pastas, então este teste roda em node
// (que remove os tipos do .ts sozinho) e cobre todos os exemplos, inclusive os das próximas tarefas.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

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
