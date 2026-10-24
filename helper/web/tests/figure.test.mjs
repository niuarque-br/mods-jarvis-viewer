import { test } from 'node:test'
import assert from 'node:assert/strict'
import { figuraUrl, recolorSvg, loadFigure, clearFigureCache, isMono } from '../engine/figure.js'

test('figuraUrl deriva o arquivo do nome', () => {
  assert.equal(figuraUrl('fluent/3d:gear'), 'figuras/fluent/3d/gear.png')
  assert.equal(figuraUrl('tabler/outline:database'), 'figuras/tabler/outline/database.svg')
  assert.equal(figuraUrl('lucide/line:cpu'), 'figuras/lucide/line/cpu.svg')
  assert.equal(figuraUrl('fluent/color:gear'), 'figuras/fluent/color/gear.svg')
})

test('figuraUrl prefere o arquivo do índice do catálogo', () => {
  const idx = new Map([['phosphor/bold:gear', { arquivo: 'phosphor/bold/gear-bold.svg' }]])
  assert.equal(figuraUrl('phosphor/bold:gear', idx), 'figuras/phosphor/bold/gear-bold.svg')
  assert.equal(figuraUrl('lucide/line:cpu', idx), 'figuras/lucide/line/cpu.svg')
})

test('recolorSvg troca currentColor', () => {
  const svg = '<svg fill="currentColor"><path stroke="currentColor" d="M0 0"/><path fill="none"/></svg>'
  const out = recolorSvg(svg, 0xd97757)
  assert.ok(!out.includes('currentColor'))
  assert.equal(out.match(/#d97757/g).length, 2)
  assert.ok(out.includes('fill="none"'))
  assert.ok(recolorSvg('<path fill="#212121"/>', '#2b3140').includes('#2b3140')) // fluent/hc
})

test('isMono reconhece os estilos recoloríveis', () => {
  for (const n of ['tabler/outline:a', 'lucide/line:a', 'phosphor/bold:a', 'fluent/hc:a']) assert.equal(isMono(n), true)
  for (const n of ['fluent/3d:a', 'fluent/color:a', 'fluent/flat:a']) assert.equal(isMono(n), false)
})

test('loadFigure: falha de rede devolve null sem lançar e não fica em cache', async () => {
  clearFigureCache()
  let calls = 0
  globalThis.fetch = async () => { calls++; throw new Error('sumiu') }
  const stage = { theme: 'dark', THREE: {} }
  assert.equal(await loadFigure(stage, 'lucide/line:nao-existe', { cor: 0xffffff }), null)
  assert.equal(await loadFigure(stage, 'lucide/line:nao-existe', { cor: 0xffffff }), null)
  assert.equal(calls, 2)
})

test('loadFigure: pedidos simultâneos da mesma chave dividem uma promessa', async () => {
  clearFigureCache()
  let calls = 0
  globalThis.fetch = async () => { calls++; return { ok: false, status: 404 } }
  const stage = { theme: 'dark', THREE: {} }
  const [a, b] = await Promise.all([loadFigure(stage, 'tabler/outline:x', { cor: 1 }), loadFigure(stage, 'tabler/outline:x', { cor: 1 })])
  assert.equal(a, null)
  assert.equal(b, null)
  assert.equal(calls, 1)
})

// Navegador de mentira: imagem que carrega depois de `ms`
function fakeBrowser(imgDelayMs) {
  globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => '<svg viewBox="0 0 1 1"><path stroke="currentColor"/></svg>' })
  globalThis.Image = class { set src(_) { setTimeout(() => this.onload?.(), imgDelayMs) } get naturalWidth() { return 24 } get naturalHeight() { return 24 } }
  globalThis.document = { createElement: () => ({ getContext: () => ({ drawImage() {} }) }) }
  const made = []
  class CanvasTexture { constructor() { this.disposed = 0; made.push(this) } dispose() { this.disposed++ } }
  return { THREE: { CanvasTexture }, made }
}

test('loadFigure: imagem que chega depois do prazo não deixa textura órfã', async () => {
  clearFigureCache()
  const { THREE, made } = fakeBrowser(60)
  const r = await loadFigure({ theme: 'dark', THREE }, 'lucide/line:lento', { cor: 1, timeoutMs: 10 })
  assert.equal(r, null)
  await new Promise((res) => setTimeout(res, 120))
  assert.equal(made.length, 1)
  assert.equal(made[0].disposed, 1)
})

test('clearFigureCache libera as texturas em cache', async () => {
  clearFigureCache()
  const { THREE, made } = fakeBrowser(1)
  const tex = await loadFigure({ theme: 'dark', THREE }, 'lucide/line:rapido', { cor: 1 })
  assert.equal(tex, made[0])
  assert.equal(tex.disposed, 0)
  clearFigureCache()
  assert.equal(tex.disposed, 1)
})

test('clearFigureCache com carga em andamento: a imagem tardia é liberada', async () => {
  clearFigureCache()
  const { THREE, made } = fakeBrowser(40)
  const p = loadFigure({ theme: 'dark', THREE }, 'lucide/line:meio', { cor: 1 })
  clearFigureCache()
  await p
  await new Promise((res) => setTimeout(res, 20))
  assert.equal(made[0].disposed, 1)
})
