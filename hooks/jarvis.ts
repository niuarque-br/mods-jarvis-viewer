import type { EngineInterface } from 'claude-code'

import { chooseNarrator } from './narration'
import type { Scene } from './scene'

export const SAY_TIMEOUT_MS = 30000
export const FALLBACK_CAPTION = 'narrando pela página'

export type SayOutcome = 'done' | 'stopped' | 'timeout'
export type NarrateOutcome = 'ended' | 'stopped' | 'fallback' | 'cancelled'

/** The part of JarvisLink the narration loop uses (a fake in tests). */
export type Link = {
  isOn(): Promise<boolean>
  say(text: string, timeoutMs?: number): Promise<SayOutcome>
  setPlaying(on: boolean): Promise<void>
  abandon?(): void
}

/** The viewer's side of the channel with the Jarvis. */
export type JarvisLink = Link & {
  /** What the Jarvis wrote under `said`; answers only a request still waiting. */
  heard(value: unknown): void
  /** Drops every request still waiting (the loop that asked has ended). */
  abandon(): void
}

/**
 * Makes the link. A function, not a class: the engine refuses `new X($)` and a stored `$`;
 * `$` must be spelled `$.noun.event(...)` at each call site, so the methods close over it.
 */
export function jarvisLink($: EngineInterface): JarvisLink {
  const pending = new Map<string, (outcome: SayOutcome) => void>()
  return {
    async isOn() {
      try {
        const read = await $.state.get({ plugin: 'modo-conversa', key: 'mode' } as const)
        return read.value === 'on'
      } catch {
        return false
      }
    },
    say(text, timeoutMs = SAY_TIMEOUT_MS) {
      const id = crypto.randomUUID()
      return new Promise<SayOutcome>(resolve => {
        let timer: { cancel(): void } | undefined
        const finish = (outcome: SayOutcome) => {
          if (!pending.has(id)) return
          pending.delete(id)
          timer?.cancel()
          resolve(outcome)
        }
        pending.set(id, finish)
        timer = $.clock.after(timeoutMs, () => finish('timeout'))
        // A write the host refuses can never be answered: same as no answer.
        $.state.set({ plugin: 'jarvis-viewer', key: 'say' } as const, { id, text }).catch(() => finish('timeout'))
      })
    },
    async setPlaying(on) {
      try {
        await $.state.set({ plugin: 'jarvis-viewer', key: 'playing' } as const, on)
      } catch {
        // best-effort: the Jarvis only reads it to know a scene is playing
      }
    },
    heard(value) {
      const said = value as { id?: unknown; outcome?: unknown } | null | undefined
      if (!said || typeof said !== 'object' || typeof said.id !== 'string') return
      if (said.outcome !== 'done' && said.outcome !== 'stopped') return
      pending.get(said.id)?.(said.outcome)
    },
    abandon() {
      for (const finish of [...pending.values()]) finish('timeout')
    },
  }
}

/** Ends a loop from outside: a new scene, ⏸ on the page, the session ending. */
export class Cancel {
  cancelled = false
  readonly done: Promise<'cancelled'>
  private fire: () => void = () => {}

  constructor() {
    this.done = new Promise(resolve => {
      this.fire = () => resolve('cancelled')
    })
  }

  cancel(): void {
    if (this.cancelled) return
    this.cancelled = true
    this.fire()
  }
}

export type NarrateOptions = {
  cancel?: Cancel
  /** The page's own narration switch (voice or caption) for the fallback; true when not given. */
  localNarration?: () => Promise<boolean>
  /** Told the narrator the page got when the loop fell back. */
  onFallback?: (narrator: 'page' | 'caption') => void
}

type Send = (cmd: Record<string, unknown>) => Promise<void>

/**
 * Jarvis narrates each step from `from`: the page animates it on `advance`, and the next step
 * goes only once the Jarvis said the sentence and the page answered `step-done` for that step.
 */
export async function narrateWithJarvis(
  link: Link,
  send: Send,
  scene: Scene,
  from: number,
  waitStepDone: (step: number) => Promise<void>,
  options: NarrateOptions = {},
): Promise<NarrateOutcome> {
  const cancel = options.cancel ?? new Cancel()
  const steps = scene.steps

  const fallback = async (step: number): Promise<NarrateOutcome> => {
    let narration = true
    try {
      narration = options.localNarration ? await options.localNarration() : true
    } catch {
      narration = true
    }
    const narrator = chooseNarrator(false, narration) as 'page' | 'caption'
    options.onFallback?.(narrator)
    const mode: Record<string, unknown> = { type: 'mode', narrator, narration }
    if (step < steps.length) mode.from = step
    await send(mode)
    await send({ type: 'caption', text: FALLBACK_CAPTION })
    return 'fallback'
  }

  await link.setPlaying(true)
  try {
    for (let i = from; i < steps.length; i++) {
      if (cancel.cancelled) return 'cancelled'
      const on = await link.isOn()
      if (cancel.cancelled) return 'cancelled'
      if (!on) return await fallback(i)

      const shown = waitStepDone(i)
      await send({ type: 'advance', step: i })
      if (cancel.cancelled) return 'cancelled'
      const said = await Promise.race([link.say(steps[i].say), cancel.done])
      if (said === 'cancelled') return 'cancelled'
      if (said === 'stopped') {
        await send({ type: 'pause' })
        return 'stopped'
      }
      if (said === 'timeout') return await fallback(i + 1)
      const seen = await Promise.race([shown.then(() => 'shown' as const), cancel.done])
      if (seen === 'cancelled') return 'cancelled'
    }
    return 'ended'
  } finally {
    link.abandon?.()
    await link.setPlaying(false)
  }
}
