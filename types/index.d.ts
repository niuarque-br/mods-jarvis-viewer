export type SayRequest = { id: string; text: string }
export type JarvisMode = 'off' | 'starting' | 'on'
export type JarvisSaid = { id: string; outcome: 'done' | 'stopped' } | null

declare module 'claude-code' {
  interface PluginState {
    'jarvis-viewer': { say: SayRequest | null; playing: boolean }
    // Owned by the Jarvis (plugin modo-conversa); declared here only so the viewer's reads type-check.
    'modo-conversa': { mode: JarvisMode; said: JarvisSaid }
  }
}
