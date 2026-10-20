export type Narrator = 'jarvis' | 'page' | 'caption'

export const NARRATION_KEY = 'narration'

export type SavedNarration = { on: boolean; option: string }

/** Jarvis wins whenever it is on; otherwise the page voice, or caption only when narration is off. */
export function chooseNarrator(jarvisOn: boolean, narrationOn: boolean): Narrator {
  if (jarvisOn) return 'jarvis'
  return narrationOn ? 'page' : 'caption'
}

/** The saved switch holds while the /config option is unchanged; a changed option wins. */
export function narrationOn(option: string | undefined, saved: SavedNarration | undefined): boolean {
  const current = option ?? 'ligada'
  if (saved && saved.option === current) return saved.on
  return current !== 'desligada'
}
