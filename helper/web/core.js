// Lógica pura da casca do viewer (sem DOM, sem relógio). Testada com node --test.
//
// nextAction(state, event) -> { state, actions }   (nunca muta o state recebido)
//
// state = {
//   narrator: 'jarvis' | 'page' | 'caption',
//   total:    número de passos da cena,
//   step:     passo atual (o que está na tela / em andamento),
//   playing:  true se a página avança sozinha (nunca é true para 'jarvis' sem ▶),
//   busy:     um passo está em andamento (animação e/ou voz),
//   done:     o passo atual terminou,
//   animDone, voiceDone: as duas metades do passo em andamento,
// }
//
// event.type:
//   'scene'      {narrator, total, from?, paused?}   cena nova (paused: do histórico, espera o ▶); começa a tocar de `from` (jarvis espera o advance)
//   'reconnect'  {total?}                   SSE voltou e o helper reenviou a cena: passo 1; pausada com jarvis
//   'advance'    {step}                     comando do Jarvis: anima só esse passo (único que gera step-done com jarvis: state.requested)
//   'goto'       {step}                     comando ou ponto de passo clicado
//   'restart'                               botão ⟲
//   'pause'                                 comando do helper: corta a fala e para (não posta nada)
//   'ui-pause' / 'ui-play'                  botões ⏸ / ▶ (postam paused / resume com jarvis)
//   'mode'       {narrator}                 helper trocou o narrador (ex.: Jarvis caiu → 'page'; Jarvis entrou → corta a voz e espera o ▶)
//   'narration'  {on}                       interruptor Narração/Legenda (ignorado com jarvis)
//   'anim-done' / 'voice-done'              as duas metades do passo terminaram (sem voz: voice-done já)
//
// action.type:
//   'run-step' {step}      a casca anima o passo, fala/legenda, e depois manda anim-done e voice-done
//   'stop-speech'          corta speechSynthesis
//   'post' {event}         POST /event com `event` (a casca acrescenta `scene`)
//   'finish'               a cena acabou (última legenda, ponto final)

export function stepMs(animMs, say, narrator) {
  if (narrator === 'caption') return Math.max(animMs, 55 * String(say ?? '').length)
  return animMs
}

// Voz da página que falhou (erro logo no começo) não encurta o passo: segura o tempo de leitura da legenda.
export function voiceHoldMs(say, elapsedMs, failed) {
  if (!failed) return 0
  return Math.max(0, 55 * String(say ?? '').length - elapsedMs)
}

// advance/goto do auxiliar valem só para a cena ao vivo já montada na tela.
// view = { loading, shown, live }: ids da cena carregando, da que está na tela e da última mandada pelo auxiliar.
//   'apply'     aplica agora
//   'hold'      a cena ao vivo ainda carrega: guarda até ela estar montada
//   'show-live' outra cena na tela (histórico) ou carregando: volta à ao vivo e guarda
export function routeStep({ loading, shown, live }) {
  if (loading != null) return live == null || loading === live ? 'hold' : 'show-live'
  if (live != null && shown !== live) return 'show-live'
  return 'apply'
}

export class StepGate {
  constructor() {
    this.held = []
  }
  // devolve a rota; o que não é 'apply' fica guardado
  offer(cmd, view) {
    const route = routeStep(view)
    if (route !== 'apply') this.held.push(cmd)
    return route
  }
  // a cena `id` acabou de ser montada: devolve, em ordem, o que esperava pela cena ao vivo
  loaded(id, live) {
    if (live != null && id !== live) return []
    const out = this.held
    this.held = []
    return out
  }
  clear() {
    this.held = []
  }
}

// Peças internas (ids com «__», como a legenda da rosca) nunca viram nó do usuário.
export function isUserPiece(id) {
  return typeof id === 'string' && id !== '' && !id.startsWith('__')
}

export function pickVoice(voices) {
  const pt = (voices || []).filter((v) => v && String(v.lang || '').toLowerCase().replace('_', '-') === 'pt-br')
  const named = (n) => pt.find((v) => String(v.name).startsWith(n))
  return named('Microsoft Daniel') || named('Microsoft Maria') || pt[0] || null
}

export class History {
  constructor(max = 5) {
    this.max = max
    this.items = []
    this.i = -1
  }
  push(item) {
    this.items = this.items.slice(0, this.i + 1)
    this.items.push(item)
    if (this.items.length > this.max) this.items.shift()
    this.i = this.items.length - 1
  }
  current() {
    return this.i >= 0 ? this.items[this.i] : null
  }
  prev() {
    if (this.i <= 0) return null
    this.i--
    return this.items[this.i]
  }
  hasPrev() {
    return this.i > 0
  }
  hasNext() {
    return this.i >= 0 && this.i < this.items.length - 1
  }
  goto(id) {
    const i = this.items.findIndex((it) => it && it.id === id)
    if (i < 0) return null
    this.i = i
    return this.items[i]
  }
  next() {
    if (this.i < 0 || this.i >= this.items.length - 1) return null
    this.i++
    return this.items[this.i]
  }
}

const post = (event) => ({ type: 'post', event })
const run = (step) => ({ type: 'run-step', step })

function start(s, step, extra = {}) {
  return { ...s, requested: false, ...extra, step, busy: true, done: false, animDone: false, voiceDone: false }
}

// continua de onde parou: passo interrompido, ou o seguinte se já terminou; no fim, recomeça
function resumeStep(s) {
  if (!s.done) return s.step
  return s.step + 1 < s.total ? s.step + 1 : 0
}

export function nextAction(state, event) {
  const s = { ...state }
  const none = { state: s, actions: [] }
  switch (event.type) {
    case 'scene': {
      const total = event.total ?? s.total
      const from = Math.min(Math.max(event.from ?? 0, 0), Math.max(total - 1, 0))
      const narrator = event.narrator || s.narrator
      const base = { ...s, narrator, total, step: from, busy: false, done: false }
      const cut = { type: 'stop-speech' }
      // paused: cena aberta do histórico — narração local, parada até o ▶
      if (narrator === 'jarvis' || event.paused) return { state: { ...base, playing: false }, actions: [cut] }
      return { state: start(base, from, { playing: true }), actions: [cut, run(from)] }
    }
    case 'reconnect': {
      const total = event.total ?? s.total
      const base = { ...s, total, step: 0, busy: false, done: false }
      const cut = { type: 'stop-speech' }
      if (s.narrator === 'jarvis') return { state: { ...base, playing: false }, actions: [cut] }
      return { state: start(base, 0, { playing: true }), actions: [cut, run(0)] }
    }
    case 'advance': {
      if (event.step < 0 || event.step >= s.total) return none
      return { state: start(s, event.step, { playing: true, requested: true }), actions: [run(event.step)] }
    }
    case 'goto': {
      if (event.step < 0 || event.step >= s.total) return none
      return { state: start(s, event.step), actions: [{ type: 'stop-speech' }, run(event.step)] }
    }
    case 'restart':
      return { state: start(s, 0, { playing: s.narrator !== 'jarvis' }), actions: [{ type: 'stop-speech' }, run(0)] }
    case 'pause':
      return { state: { ...s, playing: false, busy: s.narrator === 'jarvis' ? s.busy : false }, actions: [{ type: 'stop-speech' }] }
    case 'ui-pause': {
      const jarvis = s.narrator === 'jarvis'
      return {
        state: { ...s, playing: false, busy: jarvis ? s.busy : false },
        actions: [{ type: 'stop-speech' }, post({ type: 'paused', step: s.step })],
      }
    }
    case 'ui-play': {
      if (s.narrator === 'jarvis') return { state: { ...s, playing: true }, actions: [post({ type: 'resume', step: s.step })] }
      if (s.busy) return { state: { ...s, playing: true }, actions: [] }
      const step = resumeStep(s)
      return { state: start(s, step, { playing: true }), actions: [run(step)] }
    }
    case 'mode': {
      const narrator = event.narrator || s.narrator
      // o Jarvis assumiu: a página cala e espera o ▶ (resume) — nunca duas vozes
      if (narrator === 'jarvis') return { state: { ...s, narrator, playing: false }, actions: [{ type: 'stop-speech' }] }
      if (s.narrator !== 'jarvis') return { state: { ...s, narrator }, actions: [] }
      // o Jarvis saiu: a página assume daqui
      if (s.busy) return { state: { ...s, narrator, playing: true }, actions: [] }
      const step = resumeStep(s)
      return { state: start({ ...s, narrator }, step, { playing: true }), actions: [run(step)] }
    }
    case 'narration': {
      if (s.narrator === 'jarvis') return none
      const actions = event.on ? [] : [{ type: 'stop-speech' }]
      actions.push(post({ type: 'narration', on: !!event.on }))
      return { state: { ...s, narrator: event.on ? 'page' : 'caption' }, actions }
    }
    case 'anim-done':
    case 'voice-done': {
      if (!s.busy) return none
      const n = { ...s, [event.type === 'anim-done' ? 'animDone' : 'voiceDone']: true }
      if (!(n.animDone && n.voiceDone)) return { state: n, actions: [] }
      const finished = { ...n, busy: false, done: true }
      // com o Jarvis, só o passo que ele pediu (advance) é respondido
      const actions = n.narrator === 'jarvis' && !n.requested ? [] : [post({ type: 'step-done', step: n.step })]
      if (n.narrator === 'jarvis' || !n.playing) return { state: finished, actions }
      if (n.step + 1 < n.total) {
        actions.push(run(n.step + 1))
        return { state: start(finished, n.step + 1), actions }
      }
      actions.push({ type: 'finish' })
      return { state: { ...finished, playing: false }, actions }
    }
    default:
      return none
  }
}
