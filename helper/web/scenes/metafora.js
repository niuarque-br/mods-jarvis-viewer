// Cena «metafora»: `objects` viram primitivas 3D (texto é um rótulo HTML, particulas um Points de 200 pontos);
// as `actions` de cada passo rodam em paralelo. Estado do passo i = estado inicial + ações dos passos 0..i-1
// aplicadas na hora + as ações do passo i animadas (play(i) é idempotente, sem depender do passo anterior).
// Não importa three: usa stage.THREE, então as funções puras abaixo rodam em `node --test`.
import { makePiece } from '../engine/pieces.js'

const PALETTE = [0xD97757, 0x5B8DEF, 0x36C5A0, 0xE5B94E, 0xB58AE6, 0xE86A92, 0x62C7E8, 0x9AD66B]
export const DEFAULT_MS = 1200
const PARTICLES = 200
const EMPTY_MS = 700
const SETTLE_MS = 400
const PULSES = 3
const TINY = 1e-4 // escala «zero» (evita matriz singular)

const fin = (v) => typeof v === 'number' && Number.isFinite(v)
const vec = (p) => (Array.isArray(p) && p.length === 3 && p.every(fin) ? [p[0], p[1], p[2]] : null)
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x)
const ease = (u) => 1 - Math.pow(1 - clamp01(u), 3)
const easeIO = (u) => { const x = clamp01(u); return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2 }

export const actionMs = (a) => (a && fin(a.ms) && a.ms > 0 ? a.ms : DEFAULT_MS)

// Duração do passo: as ações rodam em paralelo, então vale a maior (padrão 1200 ms cada; sem ações, 0).
export function actionDuration(actions) {
  let m = 0
  for (const a of Array.isArray(actions) ? actions : []) if (a && typeof a === 'object') m = Math.max(m, actionMs(a))
  return m
}

// Ponto em t (0..1) de uma poligonal, com o mesmo tempo para cada trecho: t = k/(n-1) cai exatamente no ponto k.
export function lerpPath(path, t) {
  const pts = (Array.isArray(path) ? path : []).map(vec).filter(Boolean)
  if (!pts.length) return [0, 0, 0]
  if (pts.length === 1) return pts[0].slice()
  const u = clamp01(fin(t) ? t : 0) * (pts.length - 1)
  const k = Math.min(Math.floor(u), pts.length - 2)
  const f = u - k
  return pts[k].map((v, d) => v + (pts[k + 1][d] - v) * f)
}

// Trajeto de uma ação de deslocamento a partir de `cur`: `path` (seguir/mover) ou `to`. null = não desloca.
export function actionRoute(cur, a) {
  if (!a || (a.do !== 'mover' && a.do !== 'seguir')) return null
  const pts = (Array.isArray(a.path) ? a.path : []).map(vec).filter(Boolean)
  const to = vec(a.to)
  const tail = pts.length ? pts : to ? [to] : []
  if (!tail.length) return null
  const out = [cur.slice()]
  for (const p of tail) {
    const last = out[out.length - 1]
    if (p[0] !== last[0] || p[1] !== last[1] || p[2] !== last[2]) out.push(p)
  }
  return out
}

// Objeto cuja primeira ação na cena é «aparecer» começa escondido; os demais começam visíveis.
function initialState(objects, steps) {
  const first = new Map()
  for (const s of Array.isArray(steps) ? steps : []) {
    for (const a of s && Array.isArray(s.actions) ? s.actions : []) {
      if (a && typeof a === 'object' && !first.has(a.target)) first.set(a.target, a.do)
    }
  }
  const st = new Map()
  for (const o of Array.isArray(objects) ? objects : []) {
    if (!o || o.id === undefined) continue
    st.set(String(o.id), { pos: vec(o.pos) ?? [0, 0, 0], visible: first.get(o.id) !== 'aparecer' })
  }
  return st
}

function applyInstant(st, a) {
  const s = a && st.get(String(a.target)) // alvo inexistente: ignorado
  if (!s) return
  if (a.do === 'aparecer') s.visible = true
  else if (a.do === 'sumir') s.visible = false
  else {
    const r = actionRoute(s.pos, a)
    if (r) s.pos = r[r.length - 1]
  }
}

// Estado (posição e visibilidade) de cada objeto ao COMEÇAR o passo i: inicial + ações dos passos 0..i-1.
export function stateAt(objects, steps, i) {
  const st = initialState(objects, steps)
  const list = Array.isArray(steps) ? steps : []
  for (let k = 0; k < Math.min(i, list.length); k++) {
    for (const a of list[k] && Array.isArray(list[k].actions) ? list[k].actions : []) applyInstant(st, a)
  }
  return st
}

// Gerador determinístico (a mesma cena sempre desenha a mesma nuvem).
function rng(seed) {
  let s = seed >>> 0 || 1
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

export function particleOffsets(n, radius, seed = 1) {
  const r = rng(seed)
  const out = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const th = r() * Math.PI * 2
    const ph = Math.acos(2 * r() - 1)
    const d = radius * Math.cbrt(r())
    out[i * 3] = d * Math.sin(ph) * Math.cos(th)
    out[i * 3 + 1] = d * Math.cos(ph)
    out[i * 3 + 2] = d * Math.sin(ph) * Math.sin(th)
  }
  return out
}

const colorOf = (c, i) => (typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c) ? parseInt(c.slice(1), 16) : PALETTE[i % PALETTE.length])
const hash = (s) => {
  let h = 2166136261
  for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return h >>> 0
}

// `shape: 'figura'` só desenha figura quando o objeto diz qual.
export const usesFigure = (o) => !!o && o.shape === 'figura' && typeof o.figura === 'string' && o.figura.trim() !== ''

const FIG_SIZE = 0.7 // o plano da figura mede 1,6; com size 1 ela fica do tamanho de uma caixa grande

export async function build(scene, stage) {
  const { THREE } = stage
  const objects = (Array.isArray(scene.objects) ? scene.objects : []).filter((o) => o && typeof o === 'object' && o.id !== undefined)
  const steps = Array.isArray(scene.steps) ? scene.steps : []
  const pieces = new Map()
  const ents = new Map() // id -> { outer (do palco: posição), inner (nosso: escala e giro) }
  const box = new THREE.Box3()
  const figObjs = await Promise.all(objects.map((o, i) => (usesFigure(o) ? makePiece(stage, o, { padrao: 'caixa', cor: colorOf(o.color, i) }) : null)))

  objects.forEach((o, i) => {
    const id = String(o.id)
    const size = fin(o.size) && o.size > 0 ? o.size : 1
    const color = colorOf(o.color, i)
    const pos = vec(o.pos) ?? [0, 0, 0]
    const outer = new THREE.Group()
    const inner = new THREE.Group()
    outer.add(inner)
    outer.position.set(...pos)
    if (figObjs[i]) figObjs[i].scale.setScalar(size * FIG_SIZE)
    const mesh = (geo) =>
      new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.15, roughness: 0.4, metalness: 0.2 }))
    switch (o.shape) {
      case 'caixa': inner.add(mesh(new THREE.BoxGeometry(size, size, size))); break
      case 'esfera': inner.add(mesh(new THREE.SphereGeometry(size * 0.5, 32, 24))); break
      case 'cilindro': inner.add(mesh(new THREE.CylinderGeometry(size * 0.4, size * 0.4, size, 32))); break
      case 'cone': inner.add(mesh(new THREE.ConeGeometry(size * 0.5, size, 32))); break
      case 'toro': inner.add(mesh(new THREE.TorusGeometry(size * 0.45, size * 0.15, 16, 40))); break
      case 'plano': {
        const m = mesh(new THREE.PlaneGeometry(size * 1.4, size * 1.4))
        m.material.side = THREE.DoubleSide
        inner.add(m)
        break
      }
      case 'particulas': {
        const g = new THREE.BufferGeometry()
        g.setAttribute('position', new THREE.BufferAttribute(particleOffsets(PARTICLES, size, hash(id)), 3))
        inner.add(new THREE.Points(g, new THREE.PointsMaterial({ color, size: 0.1 * Math.max(size, 0.5) })))
        break
      }
      case 'figura': if (figObjs[i]) { inner.add(figObjs[i]); break }
        inner.add(mesh(new THREE.BoxGeometry(size, size, size)))
        break
      default: // 'texto': só o rótulo HTML; uma caixa invisível dá onde clicar
        inner.add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 0.2), new THREE.MeshBasicMaterial({ visible: false })))
    }
    const label = o.shape === 'texto' ? o.text : o.label
    stage.addPiece(id, outer, {
      label: label === undefined || label === null ? undefined : String(label),
      detail: o.detail,
      color: o.shape === 'texto' ? undefined : color,
    })
    pieces.set(id, outer)
    ents.set(id, { outer, inner, fig: figObjs[i] })
    box.expandByPoint(new THREE.Vector3(pos[0] - size, pos[1] - size, pos[2] - size))
    box.expandByPoint(new THREE.Vector3(pos[0] + size, pos[1] + size, pos[2] + size))
  })
  // o trajeto de todas as ações também precisa caber na câmera
  for (const s of steps) {
    for (const a of s && Array.isArray(s.actions) ? s.actions : []) {
      if (!a) continue
      for (const p of [vec(a.to), ...(Array.isArray(a.path) ? a.path.map(vec) : [])]) if (p) box.expandByPoint(new THREE.Vector3(...p))
    }
  }
  stage.fit(box.isEmpty() ? undefined : box)

  const snap = (st) => {
    for (const [id, s] of st) {
      const e = ents.get(id)
      if (!e) continue
      e.outer.position.set(...s.pos)
      e.outer.visible = s.visible
      e.inner.scale.setScalar(s.visible ? 1 : TINY)
      e.inner.rotation.set(0, 0, 0)
    }
  }
  snap(stateAt(objects, steps, 0))

  let runs = [] // (nowMs) => void, uma por ação do passo corrente
  let token = 0
  const off = stage.onFrame((t, nowMs) => {
    for (const e of ents.values()) if (e.fig) e.fig.userData.level = e.outer.userData.level // o palco escreve o foco na peça externa
    for (const r of runs) r(nowMs)
  })

  return {
    pieces,
    async play(stepIndex, step) {
      const my = ++token
      runs = []
      const st = stateAt(objects, steps, stepIndex)
      snap(st)
      const actions = (step && Array.isArray(step.actions) ? step.actions : []).filter((a) => a && typeof a === 'object' && ents.has(String(a.target)))
      const t0 = stage.now()
      for (const a of actions) {
        const e = ents.get(String(a.target))
        const ms = actionMs(a)
        const cur = st.get(String(a.target))
        const prog = (now) => clamp01((now - t0) / ms)
        if (a.do === 'mover' || a.do === 'seguir') {
          const route = actionRoute(cur.pos, a)
          if (route) runs.push((now) => e.outer.position.set(...lerpPath(route, easeIO(prog(now)))))
        } else if (a.do === 'aparecer') {
          e.outer.visible = true
          e.inner.scale.setScalar(TINY)
          runs.push((now) => e.inner.scale.setScalar(Math.max(ease(prog(now)), TINY)))
        } else if (a.do === 'sumir') {
          runs.push((now) => {
            e.inner.scale.setScalar(Math.max(1 - ease(prog(now)), TINY))
            if (prog(now) >= 1) e.outer.visible = false
          })
        } else if (a.do === 'girar') {
          runs.push((now) => { e.inner.rotation.y = easeIO(prog(now)) * Math.PI * 2 })
        } else if (a.do === 'pulsar') {
          runs.push((now) => e.inner.scale.setScalar(1 + 0.4 * Math.pow(Math.sin(prog(now) * PULSES * Math.PI), 2)))
        }
      }
      const lit = [...(step && Array.isArray(step.focus) ? step.focus : []), ...(step && Array.isArray(step.highlight) ? step.highlight : [])]
        .map(String)
        .filter((id) => pieces.has(id))
      stage.focus(lit.length ? lit : undefined)
      const dur = actionDuration(actions)
      await stage.wait(dur ? dur + SETTLE_MS : EMPTY_MS)
      if (my === token) {
        // sem quadros (aba em segundo plano) o fim do passo ainda precisa valer
        runs = []
        snap(stateAt(objects, steps, stepIndex + 1))
      }
    },
    dispose() {
      off()
      runs = []
      ents.clear()
      pieces.clear()
    },
  }
}
