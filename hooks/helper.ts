import type { EngineInterface } from 'claude-code'

import { LineSplitter } from './lines'

export const PORT_FROM = 47821
export const PORT_TO = 47830
export const START_TIMEOUT_MS = 10000
export const START_TIMEOUT_MESSAGE = 'O auxiliar do viewer não iniciou a tempo.'

export type HelperEvent =
  | { type: 'ready'; port: number }
  | { type: 'page-open' }
  | { type: 'page-closed' }
  | { type: 'step-done'; scene: string; step: number }
  | { type: 'pick'; scene: string; node: string }
  | { type: 'narration'; on: boolean }
  | { type: 'paused'; scene: string; step: number }
  | { type: 'resume'; scene: string; step: number }
  | { type: 'error'; message: string }
  | { type: 'exit' }

export type HelperHandle = {
  port: number
  token: string
  url: string
  send(cmd: Record<string, unknown>): Promise<void>
  pages(): Promise<number>
  stop(): Promise<void>
}

export async function helperCommand($: EngineInterface): Promise<{ argv: string[]; cwd: string }> {
  const root = $.plugin.root
  const exe = `${root}/bin/viewer-helper.exe`
  const ports = ['--port-from', String(PORT_FROM), '--port-to', String(PORT_TO)]
  if (await $.fs.exists(exe)) return { argv: [exe, ...ports], cwd: root }
  return { argv: ['python', '-m', 'viewer', ...ports], cwd: `${root}/helper` }
}

export async function startHelper($: EngineInterface, onEvent: (event: HelperEvent) => void): Promise<HelperHandle> {
  const token = crypto.randomUUID()
  const { argv, cwd } = await helperCommand($)
  const stream = $.process.spawn({ argv, cwd, env: { VIEWER_TOKEN: token } })
  const lines = new LineSplitter()
  let stopped = false
  let port = 0
  let ended = () => {}
  const finished = new Promise<void>(resolve => {
    ended = resolve
  })
  let settle: (r: { port: number } | { error: string }) => void = () => {}
  const first = new Promise<{ port: number } | { error: string }>(resolve => {
    settle = resolve
  })

  const closeStream = () => {
    void stream.return?.(undefined as never)
  }

  void (async () => {
    try {
      for await (const chunk of stream) {
        if (chunk.stream !== 'stdout' || stopped) continue
        for (const raw of lines.push(chunk.text)) {
          const event = raw as HelperEvent
          if (!port) {
            if (event.type === 'ready') {
              port = event.port
              settle({ port })
            } else if (event.type === 'error') {
              settle({ error: event.message })
              continue
            }
          }
          onEvent(event)
        }
      }
    } catch (err) {
      ended()
      const message = `O auxiliar do viewer não iniciou: ${String((err as Error)?.message ?? err)}`
      settle({ error: message })
      if (!stopped && port) onEvent({ type: 'error', message })
      return
    }
    ended()
    settle({ error: 'O auxiliar do viewer terminou antes de ficar pronto.' })
    if (!stopped && port) onEvent({ type: 'exit' })
  })()

  const timer = $.clock.after(START_TIMEOUT_MS, () => settle({ error: START_TIMEOUT_MESSAGE }))
  const result = await first
  timer.cancel()
  if ('error' in result) {
    stopped = true
    closeStream()
    throw new Error(result.error)
  }

  const base = `http://127.0.0.1:${port}`
  const send = async (cmd: Record<string, unknown>) => {
    try {
      await $.http.fetch(`${base}/cmd`, {
        method: 'POST',
        headers: { 'X-Viewer-Token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify(cmd),
      })
    } catch {
      return
    }
  }

  return {
    port,
    token,
    url: `${base}/?t=${token}`,
    send,
    async pages() {
      try {
        const r = await $.http.fetch(`${base}/state?t=${token}`)
        const n = Number(JSON.parse(r.text).pages)
        return Number.isFinite(n) ? n : 0
      } catch {
        return 0
      }
    },
    async stop() {
      if (stopped) return
      stopped = true
      await send({ type: 'quit' })
      await new Promise<void>(resolve => {
        const t = $.clock.after(5000, () => resolve())
        void finished.then(() => {
          t.cancel()
          resolve()
        })
      })
      closeStream()
    },
  }
}
