import type { Register } from 'claude-code'

import { startHelper } from './helper'
import type { HelperEvent, HelperHandle } from './helper'

// Provisório (a Tarefa 5 troca por /viewer): comando interno que exercita a ponte pelo `$` do plugin,
// porque o motor só deixa o mod chamar $.process, $.http etc. de dentro do próprio módulo.
// Resultados vão para $.store: ponte.info, ponte.eventos, ponte.erro, ponte.pages.
let handle: HelperHandle | undefined
const events: HelperEvent[] = []

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'viewer-ponte', description: 'interno' })
    return next(e)
  })

  on('command.run', { command: 'viewer-ponte' }, async ($, e) => {
    const action = String(e.args ?? '')
    if (action === 'start') {
      try {
        handle = await startHelper($, event => {
          events.push(event)
          $.store.set('ponte.eventos', [...events]).catch(() => {})
        })
        await $.store.set('ponte.info', { port: handle.port, token: handle.token, url: handle.url })
      } catch (err) {
        await $.store.set('ponte.erro', (err as Error).message)
      }
    } else if (action === 'send') {
      await handle?.send({ type: 'scene', id: 'a' })
    } else if (action === 'pages') {
      await $.store.set('ponte.pages', await handle?.pages())
    } else if (action === 'stop') {
      await handle?.stop()
    }
    return { text: 'ok' }
  })
}
