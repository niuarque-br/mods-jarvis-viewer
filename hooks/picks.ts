/** Holds one click request while a turn runs; a newer click replaces the older one. */
export class PickQueue {
  private pending: string | null = null

  pick(text: string, busy: boolean): { submit?: string; caption?: string } {
    if (!busy) return { submit: text }
    this.pending = text
    return { caption: `guardei: ${text}` }
  }

  /** Releases the stored request once; null when there is none. */
  turnEnded(): string | null {
    const text = this.pending
    this.pending = null
    return text
  }
}
