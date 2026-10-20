import type { Engine, On } from 'claude-code'

export const READY = '{"type":"ready","port":47821}\n'
export const ready = (port: number): string => `{"type":"ready","port":${port}}\n`

export type World = {
  spawned: { argv: readonly string[]; cwd?: string; env?: Record<string, string> }[]
  toasts: string[]
  cmds: Record<string, unknown>[]
  headers: (Record<string, string> | undefined)[]
  urls: string[]
  submitted: string[]
  origins: unknown[]
  commands: { name: string; description: string }[]
  registered: { name: string; description: string; inputSchema?: Record<string, unknown> }[]
  store: Map<string, unknown>
  pages: number
  order: string[]
  release: () => void
  emit: (line: Record<string, unknown>) => void
}

export type WorldOptions = {
  exe?: boolean
  chunks?: string[]
  ends?: boolean
  port?: number
  pages?: number
  store?: Record<string, unknown>
  surfaces?: ('desktop' | 'terminal')[]
}

export function world(on: On, opts: WorldOptions = {}): World {
  let open = () => {}
  const gate = new Promise<void>(resolve => {
    open = resolve
  })
  const lines: string[] = []
  let wake = () => {}
  const calls: World = {
    spawned: [],
    toasts: [],
    cmds: [],
    headers: [],
    urls: [],
    submitted: [],
    origins: [],
    commands: [],
    registered: [],
    store: new Map(Object.entries(opts.store ?? {})),
    pages: opts.pages ?? 0,
    order: [],
    release: () => {
      open()
      wake()
    },
    emit: line => {
      lines.push(`${JSON.stringify(line)}\n`)
      wake()
    },
  }
  on('session.surfaces', async () => ({ value: opts.surfaces ?? ['desktop'] }))
  on('tool.register', async ($, e) => {
    calls.registered.push(e)
    return { value: { tool: `mcp__${$.plugin.name}__${e.name}` } }
  })
  on('command.register', async ($, e) => {
    calls.commands.push(e)
    return { value: { command: e.name } }
  })
  on('fs.exists', async () => ({ value: !!opts.exe }))
  on('http.fetch', async ($, e) => {
    calls.urls.push(e.url)
    if (e.url.includes('/state')) {
      return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ pages: calls.pages }) } }
    }
    const cmd = JSON.parse(String(e.init?.body ?? '{}'))
    calls.cmds.push(cmd)
    calls.headers.push(e.init?.headers as Record<string, string> | undefined)
    if (cmd.type === 'quit') calls.release()
    return { value: { status: 204, ok: true, headers: {}, text: '' } }
  })
  on('process.spawn', async function* ($, e) {
    calls.spawned.push({ argv: e.argv, cwd: e.cwd, env: e.env })
    const first = opts.chunks ?? (opts.port === undefined ? [READY] : [ready(opts.port)])
    for (const text of first) yield { stream: 'stdout' as const, text }
    if (opts.ends) return { value: { code: 0, signal: null } }
    let done = false
    void gate.then(() => {
      done = true
    })
    while (!done) {
      while (lines.length) yield { stream: 'stdout' as const, text: lines.shift() ?? '' }
      if (done) break
      await new Promise<void>(resolve => {
        wake = resolve
      })
    }
    calls.order.push('exited')
    return { value: { code: 0, signal: null } }
  })
  on('ui.toast', async ($, e) => {
    calls.toasts.push(e.text)
    return { value: undefined }
  })
  on('prompt.submit', async ($, e) => {
    calls.submitted.push(e.text)
    calls.origins.push(e.origin)
    return { text: e.text }
  })
  on('store.get', async ($, e) => ({ value: calls.store.get(e.key) }))
  on('store.set', async ($, e) => {
    calls.store.set(e.key, e.value)
    return { value: undefined }
  })
  on('store.delete', async ($, e) => {
    calls.store.delete(e.key)
    return { value: undefined }
  })
  on('store.keys', async () => ({ value: [...calls.store.keys()] }))
  return calls
}

export const TOOL = 'mcp__jarvis-viewer__mostrar_cena'

export const SCENE = {
  title: 'Pedido',
  type: 'arquitetura',
  nodes: [
    { id: 'web', label: 'Site' },
    { id: 'api', label: 'API' },
  ],
  links: [{ from: 'web', to: 'api' }],
  steps: [{ say: 'Um.', focus: ['web'] }, { say: 'Dois.', hops: [['web', 'api']] }, { say: 'Três.' }],
}

/** Raises the tool the way the model does, through the plugin's tool.call hook. */
export function show($: Engine, input: { scene?: unknown; replay?: boolean; from?: number } = { scene: SCENE }) {
  return $.tool.call({ tool: TOOL, ...input })
}
