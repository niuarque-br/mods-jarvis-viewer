import { expect, mock, test } from 'claude-code/testing'

import { narrateWithJarvis } from './jarvis'
import type { Scene } from './scene'
import { SCENE, show, world } from './testkit'
import type { World } from './testkit'

/**
 * The Jarvis (plugin `modo-conversa`) the way the spike proved it reaches the viewer: it owns
 * `mode` and `said`, watches the viewer's `say` and `playing`, and answers each `say` with
 * `said` after `delay` ms. The kit loads it as its own module, so it closes over nothing:
 * the test configures it with the `jarvis-sim` command and reads what it saw from `fs.write`.
 */
const jarvis: any = {
  name: 'modo-conversa',
  register(on: any) {
    let cfg: { replies: (string | null)[]; offAt: number; offAfter: number; delay: number } = { replies: [], offAt: -1, offAfter: -1, delay: 100 }
    let n = 0
    on('command.run', { command: 'jarvis-sim' }, async ($: any, e: any) => {
      const c = JSON.parse(e.args)
      cfg = { replies: c.replies ?? [], offAt: c.offAt ?? -1, offAfter: c.offAfter ?? -1, delay: c.delay ?? 100 }
      await $.state.set({ plugin: 'modo-conversa', key: 'mode' }, c.mode)
      return { text: 'ok' }
    })
    on('state.set', { plugin: 'jarvis-viewer', key: 'say' }, async ($: any, e: any, next: any) => {
      const r = await next(e)
      const v = e.value
      if (!v) await $.fs.write('jarvis-sim.log', JSON.stringify({ cleared: true }))
      if (v) {
        const i = n++
        await $.fs.write('jarvis-sim.log', JSON.stringify({ say: v.text }))
        // offAt: goes off mid-sentence (from its own timer: a write made inside this hook would be
        // nested in the viewer's own say write, whose hooks the engine does not run again);
        // offAfter: says the sentence, then goes off
        if (i === cfg.offAt) $.clock.after(10, () => void $.state.set({ plugin: 'modo-conversa', key: 'mode' }, 'off'))
        const out = i < cfg.replies.length ? cfg.replies[i] : 'done'
        const off = i === cfg.offAfter
        if (out)
          $.clock.after(cfg.delay, async () => {
            await $.state.set({ plugin: 'modo-conversa', key: 'said' }, { id: v.id, outcome: out })
            if (off) await $.state.set({ plugin: 'modo-conversa', key: 'mode' }, 'off')
          })
      }
      return r
    })
    on('state.set', { plugin: 'jarvis-viewer', key: 'playing' }, async ($: any, e: any, next: any) => {
      await $.fs.write('jarvis-sim.log', JSON.stringify({ playing: e.value }))
      return next(e)
    })
  },
}

/** says: texts asked; last: the last `say` written (text, or null once cleared). */
type Log = { says: string[]; playing: boolean[]; last: string | null | undefined }
type Sim = { mode: 'on' | 'off'; replies?: ('done' | 'stopped' | null)[]; offAt?: number; offAfter?: number }

/** Configures the simulated Jarvis and collects what it heard. */
async function jarvisSim($: any, on: any, sim: Sim): Promise<Log> {
  const log: Log = { says: [], playing: [], last: undefined }
  on('fs.write', async (_: any, e: any) => {
    if (String(e.path).endsWith('jarvis-sim.log')) {
      const m = JSON.parse(e.text)
      if ('say' in m) {
        log.says.push(m.say)
        log.last = m.say
      }
      if ('cleared' in m) log.last = null
      if ('playing' in m) log.playing.push(m.playing)
    }
    return { value: undefined }
  })
  await $.command.run({ command: 'jarvis-sim', args: JSON.stringify(sim), origin: { kind: 'user' }, presentation: 'inline' })
  return log
}

/** The page: every advance it is told, it animates and answers step-done for that step. */
const page = (cmd: Record<string, unknown>, calls: World) => {
  if (cmd.type === 'advance') calls.emit({ type: 'step-done', scene: 's1', step: cmd.step })
}

const advances = (calls: World) => calls.cmds.filter(c => c.type === 'advance').map(c => c.step)
const FALLBACK = { type: 'caption', text: 'narrando pela página' }

test('Jarvis ligado: narrador jarvis e passos avançam pelo said', { plugins: [jarvis] }, async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on, { pages: 1, onCmd: page })
  const ctl = await jarvisSim($, on, { mode: 'on' })
  await show($)
  await clock.settle()
  expect(calls.cmds[0]).toMatchObject({ type: 'scene', id: 's1', narrator: 'jarvis', from: 0 })
  // the next step waits for Jarvis to finish the sentence
  expect(advances(calls)).toEqual([0])
  await clock.advance(99)
  expect(advances(calls)).toEqual([0])
  await clock.advance(1000)
  expect(advances(calls)).toEqual([0, 1, 2])
  expect(ctl.says).toEqual(['Um.', 'Dois.', 'Três.'])
  expect(ctl.playing).toEqual([true, false])
  expect(calls.cmds.some(c => c.type === 'mode' || c.type === 'pause')).toBe(false)
})

test('stopped pausa a cena', { plugins: [jarvis] }, async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on, { pages: 1, onCmd: page })
  const ctl = await jarvisSim($, on, { mode: 'on', replies: ['done', 'stopped'] })
  await show($)
  await clock.advance(1000)
  expect(advances(calls)).toEqual([0, 1])
  expect(calls.cmds.at(-1)).toEqual({ type: 'pause' })
  expect(ctl.says).toEqual(['Um.', 'Dois.'])
  expect(ctl.playing).toEqual([true, false])
  expect(ctl.last).toBeNull()
})

test('Jarvis desliga no meio → página assume do passo seguinte', { plugins: [jarvis] }, async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on, { pages: 1, onCmd: page })
  const ctl = await jarvisSim($, on, { mode: 'on', offAfter: 1 })
  await show($)
  await clock.advance(1000)
  expect(calls.cmds).toContainEqual({ type: 'mode', narrator: 'page', narration: true, from: 2 })
  expect(calls.cmds.at(-1)).toEqual(FALLBACK)
  expect(ctl.playing).toEqual([true, false])
  expect(ctl.last).toBeNull()
})

test('sem resposta em 30 s → fallback', { plugins: [jarvis] }, async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on, { pages: 1, onCmd: page })
  const ctl = await jarvisSim($, on, { mode: 'on', replies: [null] })
  await show($)
  await clock.advance(29999)
  expect(calls.cmds.some(c => c.type === 'mode')).toBe(false)
  await clock.advance(1)
  expect(advances(calls)).toEqual([0])
  // step 0 was animated but never heard: the page narrates it again
  expect(calls.cmds).toContainEqual({ type: 'mode', narrator: 'page', narration: true, from: 0 })
  expect(calls.cmds.at(-1)).toEqual(FALLBACK)
  expect(ctl.playing).toEqual([true, false])
  expect(ctl.last).toBeNull()
})

test('fallback usa a narração salva: legenda vira caption', { plugins: [jarvis] }, async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on, { pages: 1, onCmd: page, store: { narration: { on: false, option: 'ligada' } } })
  const ctl = await jarvisSim($, on, { mode: 'on', replies: [null] })
  await show($)
  await clock.advance(30000)
  expect(calls.cmds).toContainEqual({ type: 'mode', narrator: 'caption', narration: false, from: 0 })
  expect(ctl.playing).toEqual([true, false])
})

test('Jarvis em outra sessão (mode off aqui) → narrador da opção', { plugins: [jarvis] }, async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on, { pages: 1, onCmd: page })
  const ctl = await jarvisSim($, on, { mode: 'off' })
  await show($)
  await clock.advance(1000)
  expect(calls.cmds[0]).toMatchObject({ type: 'scene', narrator: 'page' })
  expect(advances(calls)).toEqual([])
  expect(ctl.says).toEqual([])
  expect(ctl.playing).toEqual([])
})

test('playing volta a false mesmo com erro', async () => {
  const log: boolean[] = []
  const link = {
    isOn: async () => true,
    say: async () => 'done' as const,
    setPlaying: async (on: boolean) => {
      log.push(on)
    },
  }
  const send = async () => {
    throw new Error('caiu')
  }
  let err: unknown
  try {
    await narrateWithJarvis(link, send, SCENE as Scene, 0, async () => {})
  } catch (e) {
    err = e
  }
  expect(String((err as Error)?.message)).toBe('caiu')
  expect(log).toEqual([true, false])
})

test('⏸ na página durante a narração do Jarvis encerra o laço e libera o resumo', { plugins: [jarvis] }, async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on, { pages: 1, onCmd: page })
  const ctl = await jarvisSim($, on, { mode: 'on' })
  await show($)
  await clock.settle()
  calls.emit({ type: 'paused', scene: 's1', step: 0 })
  await clock.advance(1000)
  expect(advances(calls)).toEqual([0])
  expect(ctl.says).toEqual(['Um.'])
  expect(ctl.playing).toEqual([true, false])
  expect(ctl.last).toBeNull()
})

test('▶ depois de pausar retoma do passo pausado', { plugins: [jarvis] }, async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on, { pages: 1, onCmd: page })
  const ctl = await jarvisSim($, on, { mode: 'on' })
  await show($)
  await clock.settle()
  calls.emit({ type: 'paused', scene: 's1', step: 0 })
  await clock.settle()
  calls.emit({ type: 'resume', scene: 's1', step: 2 })
  await clock.advance(1000)
  expect(advances(calls)).toEqual([0, 2])
  expect(ctl.says).toEqual(['Um.', 'Três.'])
  expect(ctl.playing).toEqual([true, false, true, false])
})

test('resume de uma cena antiga é ignorado', { plugins: [jarvis] }, async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on, { pages: 1, onCmd: page })
  const ctl = await jarvisSim($, on, { mode: 'on' })
  await show($)
  await clock.settle()
  calls.emit({ type: 'paused', scene: 's1', step: 0 })
  await clock.settle()
  calls.emit({ type: 'resume', scene: 's0', step: 1 })
  await clock.advance(1000)
  expect(advances(calls)).toEqual([0])
  expect(ctl.playing).toEqual([true, false])
})

test('sem página, o laço espera o page-open sem segurar a ferramenta', { plugins: [jarvis] }, async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on, { pages: 0, onCmd: page })
  const ctl = await jarvisSim($, on, { mode: 'on' })
  const r = await show($)
  await clock.advance(1000)
  expect(String(r.result)).toMatch(/^Abra http/)
  expect(advances(calls)).toEqual([])
  calls.emit({ type: 'page-open' })
  await clock.advance(1000)
  expect(advances(calls)).toEqual([0, 1, 2])
  expect(ctl.playing).toEqual([true, false])
})

test('step-done de outro passo ou cena não avança', { plugins: [jarvis] }, async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on, {
    pages: 1,
    onCmd: (cmd, w) => {
      if (cmd.type === 'advance' && cmd.step === 0) {
        w.emit({ type: 'step-done', scene: 's1', step: 1 })
        w.emit({ type: 'step-done', scene: 's9', step: 0 })
      }
    },
  })
  const ctl = await jarvisSim($, on, { mode: 'on' })
  await show($)
  await clock.advance(1000)
  expect(advances(calls)).toEqual([0])
  calls.emit({ type: 'step-done', scene: 's1', step: 0 })
  await clock.settle()
  expect(advances(calls)).toEqual([0, 1])
  expect(ctl.says).toEqual(['Um.', 'Dois.'])
})

test('cena nova cancela o laço da anterior', { plugins: [jarvis] }, async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on, {
    pages: 1,
    onCmd: (cmd, w) => {
      if (cmd.type === 'advance') w.emit({ type: 'step-done', scene: String(calls.cmds.filter(c => c.type === 'scene').length === 1 ? 's1' : 's2'), step: cmd.step })
    },
  })
  const ctl = await jarvisSim($, on, { mode: 'on' })
  await show($)
  await clock.settle()
  await show($)
  await clock.advance(1000)
  expect(advances(calls)).toEqual([0, 0, 1, 2])
  expect(ctl.says).toEqual(['Um.', 'Um.', 'Dois.', 'Três.'])
  expect(ctl.playing.at(-1)).toBe(false)
})

test('com o Jarvis ligado, o interruptor de narração manda mode jarvis', { plugins: [jarvis] }, async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on, { pages: 1 })
  await jarvisSim($, on, { mode: 'on' })
  await show($)
  await clock.settle()
  calls.emit({ type: 'narration', on: false })
  await clock.settle()
  expect(calls.cmds.at(-1)).toEqual({ type: 'mode', narrator: 'jarvis', narration: false })
})

test('sem resposta no último passo → página assume dele, sem recomeçar a cena', { plugins: [jarvis] }, async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on, { pages: 1, onCmd: page })
  const ctl = await jarvisSim($, on, { mode: 'on', replies: ['done', 'done', null] })
  await show($)
  await clock.advance(1000)
  expect(advances(calls)).toEqual([0, 1, 2])
  await clock.advance(30000)
  expect(calls.cmds).toContainEqual({ type: 'mode', narrator: 'page', narration: true, from: 2 })
  expect(calls.cmds.at(-1)).toEqual(FALLBACK)
  expect(ctl.playing).toEqual([true, false])
  expect(ctl.last).toBeNull()
})

test('Jarvis desliga no meio da frase e não responde → página assume na hora', { plugins: [jarvis] }, async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on, { pages: 1, onCmd: page })
  const ctl = await jarvisSim($, on, { mode: 'on', offAt: 1, replies: ['done', null] })
  await show($)
  await clock.advance(1000)
  expect(advances(calls)).toEqual([0, 1])
  expect(calls.cmds).toContainEqual({ type: 'mode', narrator: 'page', narration: true, from: 1 })
  expect(calls.cmds.at(-1)).toEqual(FALLBACK)
  expect(ctl.playing).toEqual([true, false])
  expect(ctl.last).toBeNull()
})

test('página fechada no meio da narração encerra o laço', { plugins: [jarvis] }, async ($, on) => {
  const clock = mock.clock(on)
  // a page that never answers step-done
  const calls = world(on, { pages: 1 })
  const ctl = await jarvisSim($, on, { mode: 'on' })
  await show($)
  await clock.advance(1000)
  expect(ctl.playing).toEqual([true])
  calls.emit({ type: 'page-closed' })
  await clock.settle()
  expect(advances(calls)).toEqual([0])
  expect(ctl.playing).toEqual([true, false])
  expect(ctl.last).toBeNull()
})

test('step-done que não chega em 30 s encerra o laço', { plugins: [jarvis] }, async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on, { pages: 1 })
  const ctl = await jarvisSim($, on, { mode: 'on' })
  await show($)
  await clock.advance(1000)
  expect(ctl.playing).toEqual([true])
  await clock.advance(30000)
  expect(advances(calls)).toEqual([0])
  expect(ctl.playing).toEqual([true, false])
  expect(ctl.last).toBeNull()
  expect(calls.cmds.some(c => c.type === 'mode' || c.type === 'pause')).toBe(false)
})
