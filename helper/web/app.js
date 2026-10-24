// Cola da página: SSE, controles, legenda e fala. A lógica de reprodução está em core.js (puro).
// Conclusão de passo é por relógio (setTimeout/Promise), nunca por contagem de quadros (rAF para em aba de fundo).
import { History, nextAction, stepMs, pickVoice, isUserPiece, StepGate, voiceHoldMs } from './core.js'
import { createStage, systemTheme } from './engine/stage.js'

// O token vai no caminho (/TOKEN/): todas as URLs são relativas, sem token no código.
const LOST_MS = 5000
const SCENE_TYPE = /^[a-z]+$/
const STEP_TIMEOUT_MS = 30000

const $ = (id) => document.getElementById(id)
const el = {
  stage: $('stage'), title: $('title'), caption: $('caption'), stepn: $('stepn'), text: $('text'), dots: $('dots'),
  play: $('play'), restart: $('restart'), prev: $('hprev'), next: $('hnext'),
  narr: $('narr'), narrLabel: $('narr-label'), narrHint: $('narr-hint'), lost: $('lost'),
}

const history = new History(5)
let state = { narrator: 'page', total: 0, step: 0, playing: false, busy: false, done: false, animDone: false, voiceDone: false }
let current = null // { id, scene, mod, built }
let runId = 0
let narrationPref = true
let liveNarrator = 'page' // narrador que o auxiliar mandou por último
let loadSeq = 0
let liveId = null // cena ao vivo: a última que o auxiliar mandou (scene/play)
let loadingId = null // cena sendo montada agora
const gate = new StepGate() // advance/goto que esperam a cena ao vivo estar montada

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------- rede ----------
function post(event) {
  const body = JSON.stringify(current && event.scene === undefined ? { ...event, scene: current.id } : event)
  fetch('event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }).catch(() => {})
}

// ---------- palco (engine/stage.js) ----------
let stage = null
try {
  stage = createStage(el.stage, { theme: systemTheme() })
  stage.onPick((id) => pick(id))
  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => stage.setTheme(systemTheme()))
  } catch { /* sem matchMedia */ }
} catch (e) {
  console.error('palco:', e)
}
// Clique numa peça: manda pick{scene,node} ao auxiliar.
export function pick(node) {
  if (current && isUserPiece(node)) post({ type: 'pick', scene: current.id, node })
}
window.jarvisViewer = { pick }

// ---------- fala ----------
// Resolve true quando a voz terminou (ou foi cortada), false quando falhou.
function speak(text, rid) {
  return new Promise((resolve) => {
    const ss = window.speechSynthesis
    if (!ss || typeof SpeechSynthesisUtterance === 'undefined') return wait(55 * text.length).then(() => resolve(true))
    let finished = false
    const finish = (ok = true) => { if (!finished) { finished = true; resolve(ok) } }
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'pt-BR'
    u.rate = 1.05
    const voice = pickVoice(ss.getVoices())
    if (voice) u.voice = voice
    u.onend = () => finish(true)
    u.onerror = (e) => finish(e?.error === 'interrupted' || e?.error === 'canceled')
    setTimeout(() => { if (!finished && rid === runId) ss.cancel(); finish() }, 90 * text.length + 3000) // voz que não termina não trava a cena
    ss.speak(u)
  })
}
function stopSpeech() {
  try { window.speechSynthesis?.cancel() } catch { /* sem voz */ }
}

// ---------- máquina de reprodução ----------
function apply(event) {
  const res = nextAction(state, event)
  state = res.state
  for (const a of res.actions) execute(a)
  render()
}

function execute(a) {
  switch (a.type) {
    case 'stop-speech': return stopSpeech()
    case 'post': return post(a.event)
    case 'finish':
      el.stepn.textContent = 'Fim'
      return
    case 'run-step': return runStep(a.step)
  }
}

function runStep(i) {
  const rid = ++runId
  const step = current?.scene?.steps?.[i]
  if (!step) return
  el.stepn.textContent = `Passo ${i + 1} de ${state.total}`
  el.text.textContent = step.say || ''
  const narrator = state.narrator
  const say = String(step.say || '')

  const play = Promise.race([
    Promise.resolve().then(() => current.built.play(i, step)),
    wait(STEP_TIMEOUT_MS),
  ]).catch((e) => console.error('cena:', e))
  const minimum = stepMs(0, say, narrator) // legenda: tempo de leitura
  const anim = minimum > 0 ? Promise.all([play, wait(minimum)]) : play
  anim.then(() => { if (rid === runId) apply({ type: 'anim-done' }) })

  // voz que falha logo não encurta o passo: segura o tempo de leitura da legenda
  const started = performance.now()
  const voice = narrator === 'page' && say
    ? speak(say, rid).then((ok) => wait(voiceHoldMs(say, performance.now() - started, !ok)))
    : Promise.resolve()
  voice.then(() => { if (rid === runId) apply({ type: 'voice-done' }) })
}

// ---------- cenas ----------
function showError(message) {
  el.caption.classList.add('error')
  el.stepn.textContent = 'Erro'
  el.text.textContent = message
  state = { ...state, total: 0, busy: false, playing: false }
  render()
}

async function load(item, event) {
  const seq = ++loadSeq
  loadingId = item.id
  runId++
  stopSpeech()
  el.caption.classList.remove('error')
  if (current?.built) { try { current.built.dispose() } catch (e) { console.error(e) } }
  current = null
  stage?.clear()
  const scene = item.scene || {}
  el.title.firstChild.textContent = scene.title || 'Jarvis Viewer'
  el.title.querySelector('span').textContent = ''
  const type = String(scene.type || '')
  let mod
  try {
    if (!SCENE_TYPE.test(type)) throw new Error('tipo ausente')
    mod = await import(`./scenes/${type}.js`)
  } catch {
    if (seq === loadSeq) loadFailed(`Não conheço o tipo de cena «${type || '?'}».`)
    return
  }
  if (seq !== loadSeq) return
  let built
  try {
    if (!stage) throw new Error('sem 3D')
    built = await mod.build(scene, stage) // as figuras carregam aqui; build pode ser síncrona ou assíncrona
  } catch (e) {
    console.error(e)
    return loadFailed(`Não consegui montar a cena «${scene.title || type}».`)
  }
  if (seq !== loadSeq) { // outra cena chegou enquanto as figuras carregavam: esta já não vale
    try { built.dispose() } catch (e) { console.error(e) }
    return
  }
  current = { id: item.id, scene, mod, built }
  const steps = Array.isArray(scene.steps) ? scene.steps : []
  if (!steps.length) return loadFailed('A cena não tem passos.')
  buildDots(steps.length)
  el.stepn.textContent = 'Pronto'
  el.text.textContent = steps[0].say || ''
  loadingId = null
  apply({ ...event, total: steps.length })
  // o que o auxiliar mandou enquanto a cena carregava vale agora, em ordem
  for (const cmd of gate.loaded(item.id, liveId)) stepCommand(cmd)
}

function loadFailed(message) {
  loadingId = null
  gate.clear()
  showError(message)
}

// advance/goto do auxiliar: só para a cena ao vivo já montada; senão espera por ela (ou volta a ela)
function stepCommand(cmd) {
  const route = gate.offer(cmd, { loading: loadingId, shown: loadingId == null ? current?.id ?? null : null, live: liveId })
  if (route === 'apply') return apply(cmd)
  if (route !== 'show-live') return
  const item = history.goto(liveId)
  if (!item) return gate.clear()
  load(item, { type: 'scene', narrator: liveNarrator, from: cmd.step })
}

let reconnected = false
function onScene(msg) {
  const same = current && msg.id === current.id
  const narrator = msg.narrator || state.narrator
  liveNarrator = narrator
  liveId = msg.id
  gate.clear() // comandos de uma cena anterior não valem para esta
  if (same && reconnected) {
    // a página voltou a ouvir e o auxiliar reenviou a cena que já está na tela: recomeça no passo 1
    reconnected = false
    state = { ...state, narrator }
    return apply({ type: 'reconnect', total: state.total })
  }
  reconnected = false
  if (!same) history.push({ id: msg.id, scene: msg.scene, narrator })
  load({ id: msg.id, scene: msg.scene }, { type: 'scene', narrator, from: msg.from ?? 0 })
}

function onCommand(msg) {
  switch (msg.type) {
    case 'scene': return onScene(msg)
    case 'play': {
      liveId = msg.id
      const cur = history.current()
      if (cur && cur.id === msg.id && current) return apply({ type: 'scene', narrator: state.narrator, total: state.total, from: msg.from ?? 0 })
      const item = history.goto(msg.id)
      if (!item) return
      return load(item, { type: 'scene', narrator: liveNarrator, from: msg.from ?? 0 })
    }
    case 'goto': return stepCommand({ type: 'goto', step: msg.step })
    case 'advance': return stepCommand({ type: 'advance', step: msg.step })
    case 'pause': return apply({ type: 'pause' })
    case 'mode': {
      if (typeof msg.narration === 'boolean') narrationPref = msg.narration
      if (msg.narrator) liveNarrator = msg.narrator
      apply({ type: 'mode', narrator: msg.narrator })
      if (typeof msg.from === 'number') stepCommand({ type: 'goto', step: msg.from })
      return
    }
    case 'caption':
      el.caption.classList.remove('error')
      el.text.textContent = String(msg.text ?? '')
      return
    case 'quit':
      stopSpeech()
      es?.close()
      el.lost.hidden = false
      return
  }
}

// ---------- tela ----------
function buildDots(n) {
  el.dots.textContent = ''
  for (let i = 0; i < n; i++) {
    const b = document.createElement('button')
    b.title = `Passo ${i + 1}`
    b.setAttribute('aria-label', `Passo ${i + 1}`)
    b.addEventListener('click', () => apply({ type: 'goto', step: i }))
    el.dots.appendChild(b)
  }
}

function render() {
  const jarvis = state.narrator === 'jarvis'
  // com o Jarvis narrando ao vivo, a página nunca liga a própria voz (nem numa cena do histórico)
  const locked = jarvis || liveNarrator === 'jarvis'
  if (!locked) narrationPref = state.narrator === 'page'
  el.narr.checked = narrationPref
  el.narr.disabled = locked
  el.narrHint.hidden = !locked
  el.narrLabel.textContent = narrationPref ? '🔊 Narração' : '💬 Legenda'
  el.play.disabled = state.total === 0
  el.play.textContent = state.playing ? '⏸ Pausar' : (state.done || state.busy || state.step > 0 ? '▶ Continuar' : '▶ Explicar')
  el.prev.disabled = !history.hasPrev()
  el.next.disabled = !history.hasNext()
  ;[...el.dots.children].forEach((d, k) => {
    d.classList.toggle('done', k < state.step || (k === state.step && state.done))
    d.classList.toggle('now', k === state.step)
  })
}

el.play.addEventListener('click', () => apply({ type: state.playing ? 'ui-pause' : 'ui-play' }))
el.restart.addEventListener('click', () => apply({ type: 'restart' }))
el.narr.addEventListener('change', () => { narrationPref = el.narr.checked; apply({ type: 'narration', on: el.narr.checked }) })
function navigate(item) {
  if (!item) return
  // Com o Jarvis narrando, uma cena antiga esperaria um advance que nunca vem: reabre só com legenda
  // (nunca a voz da página com o Jarvis ligado, R21), parada no passo 1.
  const old = liveNarrator === 'jarvis' && history.hasNext()
  const narrator = old ? 'caption' : liveNarrator
  load(item, { type: 'scene', narrator, from: 0, paused: old })
}
el.prev.addEventListener('click', () => navigate(history.prev()))
el.next.addEventListener('click', () => navigate(history.next()))

// ---------- SSE ----------
let es = null
let lostTimer = null
let retryTimer = null
function connect() {
  clearTimeout(retryTimer)
  es = new EventSource('events')
  es.onopen = () => {
    clearTimeout(lostTimer)
    lostTimer = null
    el.lost.hidden = true
  }
  es.onmessage = (e) => {
    let msg
    try { msg = JSON.parse(e.data) } catch { return }
    if (msg && typeof msg === 'object') onCommand(msg)
  }
  es.onerror = () => {
    reconnected = true
    if (!lostTimer) lostTimer = setTimeout(() => { el.lost.hidden = false }, LOST_MS)
    if (es.readyState === EventSource.CLOSED) retryTimer = setTimeout(connect, 2000) // o navegador desistiu: tenta de novo
  }
}

window.speechSynthesis?.getVoices()
render()
connect()
