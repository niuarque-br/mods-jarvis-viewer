export type SayRequest = { id: string; text: string }

declare module 'claude-code' {
  interface PluginState {
    'jarvis-viewer': { say: SayRequest | null; playing: boolean }
  }
}
