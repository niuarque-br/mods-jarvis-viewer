export type Narrator = 'jarvis' | 'page' | 'caption'

export const NARRATION_KEY = 'narration'

export type SavedNarration = { on: boolean; option: string }

/** Jarvis wins whenever it is on; otherwise the page voice, or caption only when narration is off. */
export function chooseNarrator(jarvisOn: boolean, narrationOn: boolean): Narrator {
  if (jarvisOn) return 'jarvis'
  return narrationOn ? 'page' : 'caption'
}

/** The saved switch holds while the /config option is unchanged; a changed option wins. */
export function narrationOn(option: string | undefined, saved: unknown): boolean {
  const current = option ?? 'ligada'
  const s = saved as Partial<SavedNarration> | null | undefined
  if (s && typeof s === 'object' && typeof s.on === 'boolean' && s.option === current) return s.on
  return current !== 'desligada'
}
