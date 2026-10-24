// Movimentos das peças: funções puras do relógio. Nada aqui conta quadros (Regra R6):
// quem chama passa o tempo em segundos (stage.now() / 1000) e aplica o resultado num grupo interno.
const TAU = Math.PI * 2
const NEUTRAL = Object.freeze({ rotY: 0, scale: 1, dy: 0, opacity: 1 })

export const MOVIMENTOS = ['girar', 'pulsar', 'balancar', 'subir', 'respirar', 'piscar']

// 'foco' → 1, 'normal' → 0.4, 'apagada' → 0
export function intensidade(estado) {
  if (estado === 'foco') return 1
  if (estado === 'apagada') return 0
  return 0.4
}

const frac = (x) => x - Math.floor(x)

// → { rotY, scale, dy, opacity }. Período e amplitude por tipo; tipo desconhecido ou intensidade 0 = neutro.
export function motionAt(tipo, t, { intensidade: k = 1 } = {}) {
  const i = Number.isFinite(k) ? Math.min(Math.max(k, 0), 1) : 1
  const time = Number.isFinite(t) ? t : 0
  if (i === 0) return { ...NEUTRAL }
  switch (tipo) {
    case 'girar': // volta completa a cada 5 s
      return { ...NEUTRAL, rotY: (time / 5) * TAU * i }
    case 'pulsar': // ±10 % a cada 1,2 s
      return { ...NEUTRAL, scale: 1 + 0.1 * i * Math.sin((time / 1.2) * TAU) }
    case 'balancar': // ±0,35 rad a cada 2,4 s
      return { ...NEUTRAL, rotY: 0.35 * i * Math.sin((time / 2.4) * TAU) }
    case 'subir': { // sobe 0,35 a cada 2,4 s e some no fim do trajeto
      const k2 = frac(time / 2.4)
      const fade = k2 > 0.7 ? (k2 - 0.7) / 0.3 : 0
      return { ...NEUTRAL, dy: 0.35 * i * k2, opacity: 1 - 0.85 * i * fade }
    }
    case 'respirar': // ±5 % e ±0,04 a cada 4 s
      return { ...NEUTRAL, scale: 1 + 0.05 * i * Math.sin((time / 4) * TAU), dy: 0.04 * i * Math.sin((time / 4) * TAU) }
    case 'piscar': // opacidade cai até 0,3 a cada 1,6 s
      return { ...NEUTRAL, opacity: 1 - 0.7 * i * (0.5 - 0.5 * Math.cos((time / 1.6) * TAU)) }
    default:
      return { ...NEUTRAL }
  }
}
