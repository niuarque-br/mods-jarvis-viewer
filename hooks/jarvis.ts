import type { EngineInterface } from 'claude-code'

import { chooseNarrator } from './narration'
import type { Scene } from './scene'

export const SAY_TIMEOUT_MS = 30000
/** How long the page may take to answer step-done once the Jarvis said the sentence. */
export const STEP_DONE_TIMEOUT_MS = 30000
export const FALLBACK_CAPTION = 'narrando pela página'

/** failed: the Jarvis is on but could not speak (its voice page inactive, mic denied) — handled like timeout. */
export type SayOutcome = 'done' | 'stopped' | 'failed' | 'timeout'
export type NarrateOutcome = 'ended' | 'stopped' | 'fallback' | 'cancelled' | 'lost'

/** The part of JarvisLink the narration loop uses (a fake in tests). */
export type Link = {
  isOn(): Promise<boolean>
  say(text: string, timeoutMs?: number): Promise<SayOutcome>
  setPlaying(on: boolean): Promise<void>
  abandon?(): void
  /** Writes `say = null`: the Jarvis drops the sentence it still holds for this scene. */
  clearSay?(): Promise<void>
}

/** The viewer's side of the channel with the Jarvis. */
export type JarvisLink = Link & {
  /** What the Jarvis wrote under `said`; answers only a request still waiting. */
  heard(value: unknown): void
  /** What the Jarvis wrote under `mode`: anything but 'on' falls back at once. */
  modeChanged(value: unknown): void
  /** Drops every request still waiting: the loop falls back at once (the Jarvis went off, or the loop ended). */
  abandon(): void
  clearSay(): Promise<void>
}

/**
 * Makes the link. A function, not a class: the engine refuses `new X($)` and a stored `$`;
 * `$` must be spelled `$.noun.event(...)` at each call site, so the methods close over it.
 */
export function jarvisLink($: EngineInterface): JarvisLink {
  const pending = new Map<string, (outcome: SayOutcome) => void>()
  // The latest mode seen by the hook; it may land between an isOn() and the next say().
  let mode: unknown
  const abandon = () => {
    for (const finish of [...pending.values()]) finish('timeout')
  }
  return {
    async isOn() {
      if (mode !== undefined) return mode === 'on'
      try {
        const read = await $.state.get({ plugin: 'modo-conversa', key: 'mode' } as const)
        return read.value === 'on'
      } catch {
        return false
      }
    },
    say(text, timeoutMs = SAY_TIMEOUT_MS) {
      if (mode !== undefined && mode !== 'on') return Promise.resolve('timeout')
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
    async clearSay() {
      try {
        await $.state.set({ plugin: 'jarvis-viewer', key: 'say' } as const, null)
      } catch {
        // best-effort: playing false tells the Jarvis the same
      }
    },
    heard(value) {
      const said = value as { id?: unknown; outcome?: unknown } | null | undefined
      if (!said || typeof said !== 'object' || typeof said.id !== 'string') return
      if (said.outcome !== 'done' && said.outcome !== 'stopped' && said.outcome !== 'failed') return
      pending.get(said.id)?.(said.outcome)
    },
    modeChanged(value) {
      mode = value
      if (value !== 'on') abandon()
    },
    abandon,
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
  /** A timer (STEP_DONE_TIMEOUT_MS) for the page's step-done; when it fires the loop ends ('lost'). */
  stepDoneTimer?: () => { done: Promise<void>; cancel(): void }
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
    // R22: while the Jarvis is still on, the page only shows the caption (never two voices).
    let stillOn = false
    try {
      stillOn = await link.isOn()
    } catch {
      stillOn = false
    }
    const narrator = stillOn ? 'caption' : (chooseNarrator(false, narration) as 'page' | 'caption')
    options.onFallback?.(narrator)
    await send({ type: 'mode', narrator, narration, from: step })
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
      // Step i was animated but not heard: the page narrates from it (Review Focus #3, R19, R23).
      if (said === 'timeout' || said === 'failed') return await fallback(i)
      const timer = options.stepDoneTimer?.()
      const waits: Promise<'shown' | 'cancelled' | 'lost'>[] = [shown.then(() => 'shown' as const), cancel.done]
      if (timer) waits.push(timer.done.then(() => 'lost' as const))
      const seen = await Promise.race(waits)
      timer?.cancel()
      if (seen === 'cancelled') return 'cancelled'
      if (seen === 'lost') return 'lost'
    }
    return 'ended'
  } finally {
    link.abandon?.()
    await link.clearSay?.()
    await link.setPlaying(false)
  }
}
