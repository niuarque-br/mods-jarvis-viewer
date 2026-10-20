import type { Engine, On } from 'claude-code'

export const READY = '{"type":"ready","port":47821}\n'
export const ready = (port: number): string => `{"type":"ready","port":${port}}\n`

/** Aciona o comando interno `viewer-ponte` (register.tsx), que roda a ponte com o `$` do plugin. */
export function bridge($: Engine, args: string): Promise<unknown> {
  return $.command.run({ command: 'viewer-ponte', args, origin: { kind: 'user' } as never, presentation: 'inline' as never })
}

export type World = {
  spawned: { argv: readonly string[]; cwd?: string; env?: Record<string, string> }[]
  toasts: string[]
  cmds: Record<string, unknown>[]
  headers: (Record<string, string> | undefined)[]
  urls: string[]
  submitted: string[]
  origins: unknown[]
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
