export type SayRequest = { id: string; text: string }
export type JarvisMode = 'off' | 'starting' | 'on'
// failed (R23): the Jarvis is on but could not speak; the viewer falls back like a timeout.
export type JarvisSaid = { id: string; outcome: 'done' | 'stopped' | 'failed' } | null

declare module 'claude-code' {
  interface PluginState {
    'jarvis-viewer': { say: SayRequest | null; playing: boolean }
    // Owned by the Jarvis (plugin modo-conversa); declared here only so the viewer's reads type-check.
    'modo-conversa': { mode: JarvisMode; said: JarvisSaid }
  }
}
