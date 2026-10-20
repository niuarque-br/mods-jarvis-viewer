declare module 'claude-code' {
  interface PluginState {
    'jarvis-viewer': { say: { id: string; text: string } | null; playing: boolean }
  }
}
