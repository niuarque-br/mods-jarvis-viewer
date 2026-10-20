import { expect, mock, test } from 'claude-code/testing'

import { LineSplitter } from './lines'
import { ready, show, world } from './testkit'

// The bridge is driven through the real tool flow: $.tool.call of mostrar_cena starts the helper.
const tokenOf = (r: { result?: unknown }): string => /\?t=(\S+) no navegador/.exec(String(r.result))![1]!

test('line splitter tolera lixo e pedaços', async () => {
  const lines = new LineSplitter()
  expect(lines.push('{"a":1}\n{"b"')).toEqual([{ a: 1 }])
  expect(lines.push(':2}\n')).toEqual([{ b: 2 }])
  expect(lines.push('lixo\n\n{"c":3}\n')).toEqual([{ c: 3 }])
})

test('prefere o exe empacotado', async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on, { exe: true })
  await show($)
  await clock.settle()
  expect(calls.spawned[0]!.argv[0]).toMatch(/bin[\\/]viewer-helper\.exe$/)
  expect(calls.spawned[0]!.argv.slice(1)).toEqual(['--port-from', '47821', '--port-to', '47830'])
})

test('sem exe roda python -m viewer em helper/', async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on)
  await show($)
  await clock.settle()
  expect(calls.spawned[0]!.argv).toEqual(['python', '-m', 'viewer', '--port-from', '47821', '--port-to', '47830'])
  expect(calls.spawned[0]!.cwd).toMatch(/helper$/)
})

test('passa VIEWER_TOKEN aleatório', async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on)
  const r = await show($)
  await clock.settle()
  expect(calls.spawned[0]!.env?.VIEWER_TOKEN).toMatch(/.{16,}/)
  expect(tokenOf(r)).toBe(calls.spawned[0]!.env?.VIEWER_TOKEN)
})

test('resolve no ready com a porta anunciada', async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on, { chunks: [ready(47823)] })
  const r = await show($)
  await clock.settle()
  expect(String(r.result)).toContain('http://127.0.0.1:47823/?t=')
  expect(String(r.result)).toContain(calls.spawned[0]!.env!.VIEWER_TOKEN!)
  expect(calls.urls.every(u => u.includes(':47823/'))).toBe(true)
})

test('ready assíncrono: resolve quando a linha chega', async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on, { chunks: [] })
  let done = false
  const started = show($).then(r => {
    done = true
    return r
  })
  await clock.settle()
  expect(done).toBe(false)
  expect(calls.cmds).toEqual([])
  calls.emit({ type: 'ready', port: 47822 })
  const r = await started
  expect(String(r.result)).toContain(':47822/?t=')
})

test('rejeita sem ready em 10 s', async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on, { chunks: [] })
  let result: { deny?: string } | undefined
  const started = show($).then(r => (result = r))
  await clock.settle()
  await clock.advance(9999)
  expect(result).toBeUndefined()
  await clock.advance(1)
  await started
  expect(result!.deny).toBe('O auxiliar do viewer não iniciou a tempo.')
  expect(calls.cmds).toEqual([])
})

test('error antes do ready rejeita com a mensagem', async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on, { chunks: ['{"type":"error","message":"sem portas livres"}\n'] })
  const r = await show($)
  await clock.settle()
  expect(r.deny).toBe('sem portas livres')
  expect(calls.cmds).toEqual([])
})

test('o comando usa o header X-Viewer-Token em /cmd', async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on)
  await show($)
  await clock.settle()
  expect(calls.cmds).toHaveLength(1)
  expect(calls.headers[0]?.['X-Viewer-Token']).toBe(calls.spawned[0]!.env!.VIEWER_TOKEN)
  expect(calls.urls).toContain('http://127.0.0.1:47821/cmd')
})

test('pages lê /state com o token', async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on, { pages: 2 })
  const r = await show($)
  await clock.settle()
  expect(String(r.result)).toBe('Cena exibida: 3 passos.')
  expect(calls.urls.at(-1)).toContain(`/state?t=${calls.spawned[0]!.env!.VIEWER_TOKEN}`)
})

test('fim do processo vira exit e a próxima cena sobe outro auxiliar', async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on, { ends: true })
  await show($)
  await clock.settle()
  expect(calls.spawned).toHaveLength(1)
  await show($)
  await clock.settle()
  expect(calls.spawned).toHaveLength(2)
})
