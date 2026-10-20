// PROVISÓRIO (Tarefa 9): só prova o contrato build/play/dispose da casca.
// A Tarefa 11 substitui este arquivo pela cena de arquitetura em three.js.
export function build(scene, stage) {
  const pieces = new Map()
  return {
    pieces,
    play(stepIndex, step) {
      return new Promise((resolve) => setTimeout(resolve, 500))
    },
    dispose() {
      pieces.clear()
    },
  }
}
