import test from 'node:test'
import assert from 'node:assert/strict'
import { stepMs, pickVoice, isUserPiece, History, nextAction } from '../core.js'

const kinds = (r) => r.actions.map((a) => a.type)
const run = (r) => r.actions.filter((a) => a.type === 'run-step').map((a) => a.step)
const base = (o = {}) => ({ narrator: 'page', total: 3, step: 0, playing: true, busy: false, done: false, animDone: false, voiceDone: false, ...o })

test('legenda espera pelo menos 55 ms por caractere', () => assert.equal(stepMs(1000, 'x'.repeat(40), 'caption'), 2200))
test('legenda: animação maior vence', () => assert.equal(stepMs(5000, 'x'.repeat(40), 'caption'), 5000))
test('page/jarvis usam só a animação', () => {
  assert.equal(stepMs(1000, 'x'.repeat(40), 'page'), 1000)
  assert.equal(stepMs(1000, 'x'.repeat(40), 'jarvis'), 1000)
})
test('voz preferida é Daniel', () => assert.equal(pickVoice([{ name: 'Microsoft Maria - Portuguese (Brazil)', lang: 'pt-BR' }, { name: 'Microsoft Daniel - Portuguese (Brazil)', lang: 'pt-BR' }]).name.startsWith('Microsoft Daniel'), true))
test('reserva é Maria, depois a primeira pt-BR', () => {
  assert.equal(pickVoice([{ name: 'Z', lang: 'pt-BR' }, { name: 'Microsoft Maria - Portuguese (Brazil)', lang: 'pt-BR' }]).name.startsWith('Microsoft Maria'), true)
  assert.equal(pickVoice([{ name: 'Z', lang: 'pt-BR' }, { name: 'Y', lang: 'pt-BR' }]).name, 'Z')
})
test('Daniel de outro idioma não conta', () => assert.equal(pickVoice([{ name: 'Microsoft Daniel', lang: 'en-US' }]), null))
test('sem pt-BR → null', () => assert.equal(pickVoice([{ name: 'X', lang: 'en-US' }]), null))
test('sem lista → null', () => assert.equal(pickVoice(undefined), null))

test('histórico guarda só 5', () => {
  const h = new History()
  for (let i = 0; i < 8; i++) h.push({ id: i })
  assert.equal(h.current().id, 7)
  let n = 0
  while (h.prev()) n++
  assert.equal(n, 4)
  assert.equal(h.current().id, 3)
})
test('histórico: prev/next e push depois de voltar descarta o futuro', () => {
  const h = new History(5)
  h.push('a'); h.push('b'); h.push('c')
  assert.equal(h.prev(), 'b')
  assert.equal(h.next(), 'c')
  assert.equal(h.next(), null)
  h.prev(); h.prev()
  h.push('d')
  assert.equal(h.current(), 'd')
  assert.equal(h.next(), null)
  assert.equal(h.prev(), 'a')
})
test('histórico vazio', () => {
  const h = new History()
  assert.equal(h.current(), null)
  assert.equal(h.prev(), null)
})

test('jarvis: só avança com advance', () => {
  const s = base({ narrator: 'jarvis', playing: false })
  const r = nextAction(s, { type: 'anim-done' })
  assert.deepEqual(run(r), [])
  const r2 = nextAction(s, { type: 'advance', step: 1 })
  assert.deepEqual(run(r2), [1])
})
test('jarvis: depois do passo manda step-done e não avança', () => {
  let r = nextAction(base({ narrator: 'jarvis' }), { type: 'advance', step: 1 })
  r = nextAction(r.state, { type: 'voice-done' })
  assert.deepEqual(kinds(r), [])
  r = nextAction(r.state, { type: 'anim-done' })
  assert.deepEqual(r.actions, [{ type: 'post', event: { type: 'step-done', step: 1 } }])
})
test('page: avança quando voz e animação terminam', () => {
  let r = nextAction(base(), { type: 'scene', narrator: 'page', total: 3, from: 0, id: 'a' })
  assert.deepEqual(run(r), [0])
  r = nextAction(r.state, { type: 'anim-done' })
  assert.deepEqual(run(r), [])
  r = nextAction(r.state, { type: 'voice-done' })
  assert.deepEqual(run(r), [1])
  assert.ok(r.actions.some((a) => a.type === 'post' && a.event.type === 'step-done' && a.event.step === 0))
})
test('caption: último passo termina em finish', () => {
  let r = nextAction(base({ narrator: 'caption', step: 2, busy: true }), { type: 'anim-done' })
  r = nextAction(r.state, { type: 'voice-done' })
  assert.deepEqual(kinds(r), ['post', 'finish'])
  assert.equal(r.state.playing, false)
})
test('scene com from começa dali', () => {
  const r = nextAction(base(), { type: 'scene', narrator: 'caption', total: 5, from: 3 })
  assert.deepEqual(run(r), [3])
})
test('scene com jarvis espera o primeiro advance', () => {
  const r = nextAction(base(), { type: 'scene', narrator: 'jarvis', total: 5, from: 0 })
  assert.deepEqual(run(r), [])
  assert.equal(r.state.playing, false)
  assert.equal(r.state.step, 0)
})
test('reconexão recomeça no passo 1, pausada com jarvis', () => {
  const r = nextAction(base({ narrator: 'jarvis', step: 4 }), { type: 'reconnect', total: 6 })
  assert.equal(r.state.step, 0)
  assert.equal(r.state.playing, false)
  assert.deepEqual(run(r), [])
})
test('reconexão com page recomeça tocando do passo 1', () => {
  const r = nextAction(base({ step: 2 }), { type: 'reconnect', total: 3 })
  assert.deepEqual(run(r), [0])
})
test('eventos tardios sem passo em andamento são ignorados', () => {
  const r = nextAction(base({ busy: false }), { type: 'anim-done' })
  assert.deepEqual(r.actions, [])
})
test('pausa corta a fala e para; retomar repete o passo interrompido', () => {
  let r = nextAction(base({ busy: true, step: 1 }), { type: 'ui-pause' })
  assert.deepEqual(kinds(r), ['stop-speech', 'post'])
  assert.deepEqual(r.actions[1].event, { type: 'paused', step: 1 })
  assert.equal(r.state.playing, false)
  r = nextAction(r.state, { type: 'ui-play' })
  assert.deepEqual(run(r), [1])
})
test('pausa vinda do comando não posta paused', () => {
  const r = nextAction(base({ busy: true }), { type: 'pause' })
  assert.deepEqual(kinds(r), ['stop-speech'])
  assert.equal(r.state.playing, false)
})
test('retomar depois de passo concluído vai ao próximo', () => {
  const r = nextAction(base({ step: 0, done: true, playing: false }), { type: 'ui-play' })
  assert.deepEqual(run(r), [1])
})
test('jarvis: ▶ manda resume e espera o advance', () => {
  const r = nextAction(base({ narrator: 'jarvis', step: 1, done: true, playing: false }), { type: 'ui-play' })
  assert.deepEqual(r.actions, [{ type: 'post', event: { type: 'resume', step: 1 } }])
})
test('goto e ponto de passo tocam aquele passo', () => {
  assert.deepEqual(run(nextAction(base({ step: 0 }), { type: 'goto', step: 2 })), [2])
  assert.deepEqual(run(nextAction(base({ narrator: 'jarvis', playing: false }), { type: 'goto', step: 2 })), [2])
})
test('goto fora do intervalo é ignorado', () => {
  assert.deepEqual(nextAction(base(), { type: 'goto', step: 9 }).actions, [])
})
test('⟲ recomeça do passo 1', () => {
  assert.deepEqual(run(nextAction(base({ step: 2, done: true, playing: false }), { type: 'restart' })), [0])
})
test('mode: Jarvis cai → página assume do passo atual', () => {
  const r = nextAction(base({ narrator: 'jarvis', step: 2, playing: false, done: false }), { type: 'mode', narrator: 'page' })
  assert.equal(r.state.narrator, 'page')
  assert.deepEqual(run(r), [2])
})
test('mode: Jarvis cai após passo concluído → próximo passo', () => {
  const r = nextAction(base({ narrator: 'jarvis', step: 1, playing: false, done: true }), { type: 'mode', narrator: 'caption' })
  assert.deepEqual(run(r), [2])
})
test('mode para jarvis para o autoplay', () => {
  const r = nextAction(base({ busy: true }), { type: 'mode', narrator: 'jarvis' })
  assert.equal(r.state.playing, false)
})
test('interruptor Narração/Legenda posta narration e troca page↔caption', () => {
  const off = nextAction(base(), { type: 'narration', on: false })
  assert.equal(off.state.narrator, 'caption')
  assert.deepEqual(kinds(off), ['stop-speech', 'post'])
  const on = nextAction(off.state, { type: 'narration', on: true })
  assert.equal(on.state.narrator, 'page')
  assert.deepEqual(on.actions, [{ type: 'post', event: { type: 'narration', on: true } }])
})
test('interruptor com jarvis é ignorado', () => {
  assert.deepEqual(nextAction(base({ narrator: 'jarvis' }), { type: 'narration', on: false }).actions, [])
})
test('não muta o estado recebido', () => {
  const s = base()
  Object.freeze(s)
  nextAction(s, { type: 'ui-pause' })
})

test('History.goto(id) vai direto, para frente ou para trás', () => {
  const h = new History(5)
  h.push({ id: 'a' }); h.push({ id: 'b' }); h.push({ id: 'c' })
  assert.equal(h.goto('a').id, 'a')
  assert.equal(h.current().id, 'a')
  assert.equal(h.goto('c').id, 'c')
  assert.equal(h.goto('zzz'), null)
  assert.equal(h.current().id, 'c')
})
test('jarvis: step-done só para passo pedido por advance', () => {
  let r = nextAction(base({ narrator: 'jarvis', playing: false }), { type: 'goto', step: 1 })
  r = nextAction(nextAction(r.state, { type: 'anim-done' }).state, { type: 'voice-done' })
  assert.deepEqual(r.actions, [])
  let q = nextAction(base({ narrator: 'jarvis', playing: false }), { type: 'restart' })
  q = nextAction(nextAction(q.state, { type: 'anim-done' }).state, { type: 'voice-done' })
  assert.deepEqual(q.actions, [])
  let a = nextAction(base({ narrator: 'jarvis', playing: false }), { type: 'advance', step: 2 })
  a = nextAction(nextAction(a.state, { type: 'anim-done' }).state, { type: 'voice-done' })
  assert.deepEqual(a.actions, [{ type: 'post', event: { type: 'step-done', step: 2 } }])
})
test('scene e reconnect cortam a fala antiga', () => {
  assert.equal(nextAction(base(), { type: 'scene', narrator: 'page', total: 2, from: 0 }).actions[0].type, 'stop-speech')
  assert.equal(nextAction(base(), { type: 'reconnect', total: 2 }).actions[0].type, 'stop-speech')
  assert.equal(nextAction(base({ narrator: 'jarvis' }), { type: 'scene', narrator: 'jarvis', total: 2, from: 0 }).actions[0].type, 'stop-speech')
})
test('cena aberta do histórico: local, pausada no passo 1', () => {
  const r = nextAction(base({ narrator: 'jarvis' }), { type: 'scene', narrator: 'page', total: 3, from: 0, paused: true })
  assert.equal(r.state.narrator, 'page')
  assert.equal(r.state.playing, false)
  assert.deepEqual(run(r), [])
  const p = nextAction(r.state, { type: 'ui-play' })
  assert.deepEqual(run(p), [0])
})
test('isUserPiece recusa ids internos (__) e não-strings', () => {
  assert.equal(isUserPiece('api'), true)
  assert.equal(isUserPiece('link:a>b'), true)
  assert.equal(isUserPiece('__cat:2'), false)
  assert.equal(isUserPiece(''), false)
  assert.equal(isUserPiece(undefined), false)
})
