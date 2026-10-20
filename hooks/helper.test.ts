import { expect, mock, test } from 'claude-code/testing'

import type { HelperEvent } from './helper'
import { LineSplitter } from './lines'
import { bridge, ready, world } from './testkit'

const info = (calls: { store: Map<string, unknown> }) => calls.store.get('ponte.info') as { port: number; token: string; url: string }

test('line splitter tolera lixo e pedaços', async () => {
  const lines = new LineSplitter()
  expect(lines.push('{"a":1}\n{"b"')).toEqual([{ a: 1 }])
  expect(lines.push(':2}\n')).toEqual([{ b: 2 }])
  expect(lines.push('lixo\n\n{"c":3}\n')).toEqual([{ c: 3 }])
})

test('prefere o exe empacotado', async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on, { exe: true })
  await bridge($, 'start')
  await clock.settle()
  expect(calls.spawned[0]!.argv[0]).toMatch(/bin[\\/]viewer-helper\.exe$/)
  expect(calls.spawned[0]!.argv.slice(1)).toEqual(['--port-from', '47821', '--port-to', '47830'])
})

test('sem exe roda python -m viewer em helper/', async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on)
  await bridge($, 'start')
  await clock.settle()
  expect(calls.spawned[0]!.argv).toEqual(['python', '-m', 'viewer', '--port-from', '47821', '--port-to', '47830'])
  expect(calls.spawned[0]!.cwd).toMatch(/helper$/)
})

test('passa VIEWER_TOKEN aleatório', async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on)
  await bridge($, 'start')
  await clock.settle()
  expect(calls.spawned[0]!.env?.VIEWER_TOKEN).toMatch(/.{16,}/)
  expect(info(calls).token).toBe(calls.spawned[0]!.env?.VIEWER_TOKEN)
})

test('resolve no ready com a porta anunciada', async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on, { chunks: [ready(47823)] })
  await bridge($, 'start')
  await clock.settle()
  expect(info(calls).port).toBe(47823)
  expect(info(calls).url).toContain(':47823/?t=')
  expect(info(calls).url).toContain(info(calls).token)
  expect((calls.store.get('ponte.eventos') as HelperEvent[])[0]).toEqual({ type: 'ready', port: 47823 })
})

test('ready assíncrono: resolve quando a linha chega', async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on, { chunks: [] })
  const started = bridge($, 'start')
  await clock.settle()
  expect(calls.store.get('ponte.info')).toBeUndefined()
  calls.emit({ type: 'ready', port: 47822 })
  await started
  expect(info(calls).port).toBe(47822)
})

test('rejeita sem ready em 10 s', async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on, { chunks: [] })
  const started = bridge($, 'start')
  await clock.settle()
  await clock.advance(9999)
  expect(calls.store.get('ponte.erro')).toBeUndefined()
  await clock.advance(1)
  await started
  expect(calls.store.get('ponte.erro')).toBe('O auxiliar do viewer não iniciou a tempo.')
  expect(calls.store.get('ponte.info')).toBeUndefined()
})

test('error antes do ready rejeita com a mensagem', async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on, { chunks: ['{"type":"error","message":"sem portas livres"}\n'] })
  await bridge($, 'start')
  await clock.settle()
  expect(calls.store.get('ponte.erro')).toBe('sem portas livres')
})

test('send usa o header X-Viewer-Token', async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on)
  await bridge($, 'start')
  await clock.settle()
  await bridge($, 'send')
  expect(calls.cmds).toEqual([{ type: 'scene', id: 'a' }])
  expect(calls.headers[0]?.['X-Viewer-Token']).toBe(info(calls).token)
  expect(calls.urls.at(-1)).toBe('http://127.0.0.1:47821/cmd')
})

test('pages lê /state, eventos seguintes chegam e stop manda quit', async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on, { pages: 2 })
  await bridge($, 'start')
  await clock.settle()
  await bridge($, 'pages')
  expect(calls.store.get('ponte.pages')).toBe(2)
  expect(calls.urls.at(-1)).toContain(`/state?t=${info(calls).token}`)
  calls.emit({ type: 'pick', scene: 's', node: 'n' })
  await clock.settle()
  expect((calls.store.get('ponte.eventos') as HelperEvent[]).at(-1)).toEqual({ type: 'pick', scene: 's', node: 'n' })
  await bridge($, 'stop')
  expect(calls.cmds.at(-1)).toEqual({ type: 'quit' })
})

test('fim do processo vira exit', async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on, { ends: true })
  await bridge($, 'start')
  await clock.settle()
  expect((calls.store.get('ponte.eventos') as HelperEvent[]).map(e => e.type)).toEqual(['ready', 'exit'])
})
