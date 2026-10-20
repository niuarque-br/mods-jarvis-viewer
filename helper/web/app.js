// Cola da página: SSE, controles, legenda e fala. A lógica de reprodução está em core.js (puro).
// Conclusão de passo é por relógio (setTimeout/Promise), nunca por contagem de quadros (rAF para em aba de fundo).
import { History, nextAction, stepMs, pickVoice } from '/core.js'

const params = new URLSearchParams(location.search)
const token = params.get('t') || '' // só em memória; vai nas URLs de /events e /event
const q = '?t=' + encodeURIComponent(token)
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
let loadSeq = 0

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------- rede ----------
function post(event) {
  const body = JSON.stringify(current && event.scene === undefined ? { ...event, scene: current.id } : event)
  fetch('/event' + q, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }).catch(() => {})
}

// ---------- palco mínimo (a Tarefa 10 troca por engine/stage.js) ----------
let pickHandler = null
const stage = {
  el: el.stage,
  wait,
  now: () => performance.now(),
  onPick(fn) { pickHandler = fn },
  pick(node) { pick(node) },
}
// Tarefa 10 liga os cliques do renderer a isto: manda pick{scene,node}.
export function pick(node) {
  if (current && typeof node === 'string') post({ type: 'pick', scene: current.id, node })
  if (pickHandler) pickHandler(node)
}
window.jarvisViewer = { pick }

// ---------- fala ----------
function speak(text, rid) {
  return new Promise((resolve) => {
    const ss = window.speechSynthesis
    if (!ss || typeof SpeechSynthesisUtterance === 'undefined') return wait(55 * text.length).then(resolve)
    let finished = false
    const finish = () => { if (!finished) { finished = true; resolve() } }
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'pt-BR'
    u.rate = 1.05
    const voice = pickVoice(ss.getVoices())
    if (voice) u.voice = voice
    u.onend = u.onerror = finish
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

  const voice = narrator === 'page' && say ? speak(say, rid) : Promise.resolve()
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
  runId++
  stopSpeech()
  el.caption.classList.remove('error')
  if (current?.built) { try { current.built.dispose() } catch (e) { console.error(e) } }
  current = null
  const scene = item.scene || {}
  el.title.firstChild.textContent = scene.title || 'Jarvis Viewer'
  el.title.querySelector('span').textContent = ''
  const type = String(scene.type || '')
  let mod
  try {
    if (!SCENE_TYPE.test(type)) throw new Error('tipo ausente')
    mod = await import(`/scenes/${type}.js`)
  } catch {
    if (seq === loadSeq) showError(`Não conheço o tipo de cena «${type || '?'}».`)
    return
  }
  if (seq !== loadSeq) return
  let built
  try {
    built = mod.build(scene, stage)
  } catch (e) {
    console.error(e)
    return showError(`Não consegui montar a cena «${scene.title || type}».`)
  }
  current = { id: item.id, scene, mod, built }
  const steps = Array.isArray(scene.steps) ? scene.steps : []
  if (!steps.length) return showError('A cena não tem passos.')
  buildDots(steps.length)
  el.stepn.textContent = 'Pronto'
  el.text.textContent = steps[0].say || ''
  apply({ ...event, total: steps.length })
}

let reconnected = false
function onScene(msg) {
  const same = current && msg.id === current.id
  const narrator = msg.narrator || state.narrator
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
      const cur = history.current()
      if (cur && cur.id === msg.id && current) return apply({ type: 'scene', narrator: state.narrator, total: state.total, from: msg.from ?? 0 })
      const found = history.items.findIndex((it) => it.id === msg.id)
      if (found < 0) return
      while (history.current().id !== msg.id) history.prev()
      return load(history.current(), { type: 'scene', narrator: state.narrator, from: msg.from ?? 0 })
    }
    case 'goto': return apply({ type: 'goto', step: msg.step })
    case 'advance': return apply({ type: 'advance', step: msg.step })
    case 'pause': return apply({ type: 'pause' })
    case 'mode': {
      if (typeof msg.narration === 'boolean') narrationPref = msg.narration
      apply({ type: 'mode', narrator: msg.narrator })
      if (typeof msg.from === 'number') apply({ type: 'goto', step: msg.from })
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
  if (!jarvis) narrationPref = state.narrator === 'page'
  el.narr.checked = narrationPref
  el.narr.disabled = jarvis
  el.narrHint.hidden = !jarvis
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
  if (item) load(item, { type: 'scene', narrator: state.narrator, from: 0 })
}
el.prev.addEventListener('click', () => navigate(history.prev()))
el.next.addEventListener('click', () => navigate(history.next()))

// ---------- SSE ----------
let es = null
let lostTimer = null
let retryTimer = null
function connect() {
  clearTimeout(retryTimer)
  es = new EventSource('/events' + q)
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
