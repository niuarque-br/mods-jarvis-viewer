// Palco comum das cenas (three.js): renderer, câmera, rótulos HTML, pacotes, foco e cliques.
// Regra R6: a conclusão de pacotes é por relógio (setTimeout); a posição visual vem de performance.now() a cada quadro.
import * as THREE from 'three'
import { safeBounds } from './layout.js'

const ACCENT = 0xD97757
const DRAG_PX = 5
const ZOOM_MIN = 0.6
const ZOOM_MAX = 2
const TRAIL = 8

const THEMES = {
  dark: { bg: 0x0b0d12, stars: true, grid: [0x1c2230, 0x151a24], tube: 0x6b7894 },
  light: { bg: 0xf6f7fa, stars: false, grid: [0x9aa3b5, 0xc4cad6], tube: 0x5d667a },
}

export function systemTheme() {
  try { return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light' } catch { return 'dark' }
}

export function createStage(container, { theme } = {}) {
  let themeName = theme === 'light' || theme === 'dark' ? theme : systemTheme()
  let T = THEMES[themeName]
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative'

  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  container.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  scene.fog = new THREE.FogExp2(T.bg, 0.018)
  renderer.setClearColor(T.bg)
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200)

  // ---- base fixa da cena (sobrevive a clear()) ----
  const base = new Set()
  const addBase = (o) => { scene.add(o); base.add(o); return o }
  const ambient = addBase(new THREE.AmbientLight(0xffffff, themeName === 'dark' ? 0.35 : 0.6))
  const key = addBase(new THREE.PointLight(0xffffff, 60, 40))
  key.position.set(0, 6, 8)
  const stars = (() => {
    const g = new THREE.BufferGeometry()
    const n = 700
    const p = new Float32Array(n * 3)
    for (let i = 0; i < n * 3; i++) p[i] = (Math.random() - 0.5) * 80
    g.setAttribute('position', new THREE.BufferAttribute(p, 3))
    return addBase(new THREE.Points(g, new THREE.PointsMaterial({ size: 0.06, color: 0x55607a })))
  })()
  let floor = null
  function buildFloor() {
    if (floor) {
      scene.remove(floor)
      base.delete(floor)
      floor.geometry.dispose()
      for (const m of [].concat(floor.material)) m.dispose()
    }
    floor = addBase(new THREE.GridHelper(40, 40, T.grid[0], T.grid[1]))
  }
  buildFloor()
  stars.visible = T.stars

  // ---- câmera ----
  let yaw = 0
  let pitch = 0.18
  let zoom = 1
  let planar = false
  const fitBox = { cx: 0, cy: 0, cz: 0, hw: 8, hh: 1.4, hd: 1 }
  const lookAt = new THREE.Vector3()

  function fit(box, opts = {}) {
    planar = !!opts.planar
    const sb = safeBounds(box && box.min && !box.isEmpty?.() ? [box.min.toArray(), box.max.toArray()] : [])
    const b = new THREE.Box3(new THREE.Vector3(...sb.min), new THREE.Vector3(...sb.max))
    const size = b.getSize(new THREE.Vector3())
    const c = b.getCenter(new THREE.Vector3())
    Object.assign(fitBox, { cx: c.x, cy: c.y, cz: c.z, hw: Math.max(size.x / 2, 0.5), hh: Math.max(size.y / 2, 0.5), hd: size.z / 2 })
    zoom = 1
    yaw = 0
    pitch = planar ? 0 : 0.18
    floor.visible = !planar
    floor.position.y = b.min.y - 1.6
  }
  fit()

  function fittedDistance() {
    const vfov = THREE.MathUtils.degToRad(camera.fov / 2)
    const hfov = Math.atan(Math.tan(vfov) * camera.aspect) // metade do FOV horizontal
    // largura: a cena toda cabe na horizontal; altura: sobra espaço para o cabeçalho, a legenda e os rótulos
    const halfW = (planar ? fitBox.hw : Math.max(fitBox.hw, fitBox.hd)) + 1.2
    const halfH = (fitBox.hh + 1.4) * 1.45
    return Math.max(8, halfW / Math.tan(hfov), halfH / Math.tan(vfov)) + (planar ? 0 : fitBox.hd)
  }

  // ---- peças ----
  const pieces = new Map() // id -> { id, object, labelEl, detail, mats, level, scale, off }
  const owners = new Map() // Object3D -> id (para o raio)
  const box3 = new THREE.Box3()

  function addPiece(id, object, { label, sub, detail, color } = {}) {
    if (pieces.has(id)) removePiece(id)
    if (!object.parent) scene.add(object)
    const mats = []
    object.traverse((o) => {
      owners.set(o, id)
      if (o.isMesh && o.material) {
        for (const m of [].concat(o.material)) if (m.emissive && !mats.includes(m)) mats.push(m)
      }
    })
    box3.setFromObject(object)
    const off = box3.isEmpty() ? -1.2 : box3.min.y - object.position.y - 0.18 // rótulo logo abaixo da peça
    let labelEl = null
    if (label !== undefined && label !== null && label !== '') {
      labelEl = document.createElement('div')
      labelEl.className = 'jv-label'
      const b = document.createElement('b')
      if (color !== undefined) {
        const dot = document.createElement('i')
        dot.style.background = '#' + new THREE.Color(color).getHexString()
        b.appendChild(dot)
      }
      b.appendChild(document.createTextNode(String(label)))
      labelEl.appendChild(b)
      if (sub) labelEl.appendChild(document.createTextNode(String(sub)))
      container.appendChild(labelEl)
    }
    const piece = { id, object, labelEl, detail: detail ? String(detail) : '', mats, level: 0.35, scale: object.scale.x || 1, off }
    pieces.set(id, piece)
    placeLabel(piece) // posiciona já na criação (sem piscar no canto)
    return object
  }

  const lv = new THREE.Vector3()
  function placeLabel(p) {
    if (!p.labelEl) return
    const w = container.clientWidth || window.innerWidth
    const h = container.clientHeight || window.innerHeight
    camera.updateMatrixWorld()
    p.object.updateWorldMatrix(true, false)
    p.object.getWorldPosition(lv)
    lv.y += p.off
    lv.project(camera)
    p.labelEl.style.display = lv.z < 1 && p.object.visible ? '' : 'none' // peça escondida não mostra rótulo
    p.labelEl.style.left = ((lv.x + 1) / 2) * w + 'px'
    p.labelEl.style.top = ((1 - lv.y) / 2) * h + 'px'
  }

  function removePiece(id) {
    const p = pieces.get(id)
    if (!p) return
    p.labelEl?.remove()
    p.object.traverse((o) => owners.delete(o))
    pieces.delete(id)
  }

  let focused = null // Set de ids ou null
  function focus(ids) {
    const list = ids === undefined || ids === null ? [] : [].concat(ids)
    focused = list.length ? new Set(list) : null
  }

  // ---- pacotes ----
  const packets = new Set()
  const trailGeo = Array.from({ length: TRAIL }, (_, k) => new THREE.SphereGeometry(0.16 * (1 - k / 10), 16, 16))
  function packet(from, to, { color = ACCENT, arc = 1, delayMs = 0, ms = 1300 } = {}) {
    const A = new THREE.Vector3().copy(from)
    const B = new THREE.Vector3().copy(to)
    const mid = A.clone().add(B).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.95 * arc, 0.4 * arc))
    const curve = new THREE.QuadraticBezierCurve3(A, mid, B)
    const parts = []
    for (let k = 0; k < TRAIL; k++) {
      const m = new THREE.Mesh(
        trailGeo[k],
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0 }),
      )
      m.visible = false
      scene.add(m)
      parts.push(m)
    }
    const pk = { curve, parts, start: performance.now() + delayMs, dur: Math.max(1, ms), gone: false }
    pk.remove = () => {
      if (pk.gone) return
      pk.gone = true
      packets.delete(pk)
      for (const m of parts) { scene.remove(m); m.material.dispose() }
    }
    packets.add(pk)
    return new Promise((resolve) => {
      setTimeout(resolve, delayMs + ms) // conclusão por relógio, independe de renderizar
      setTimeout(pk.remove, delayMs + ms + ms * 0.3 + 50)
    })
  }

  // ---- cliques, dica e arrasto ----
  let pickCb = null
  const frameCbs = new Set()
  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const tip = document.createElement('div')
  tip.className = 'jv-tip'
  tip.hidden = true
  container.appendChild(tip)
  const canvas = renderer.domElement

  function hit(clientX, clientY) {
    const r = canvas.getBoundingClientRect()
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    const objs = [...pieces.values()].filter((p) => p.object.visible).map((p) => p.object) // peça escondida não recebe clique
    for (const h of ray.intersectObjects(objs, true)) {
      const id = owners.get(h.object)
      if (id !== undefined) return id
    }
    return null
  }

  let drag = null
  let hoverId = null
  const resetHover = () => { hoverId = null; tip.hidden = true; canvas.style.cursor = '' }
  const onDown = (e) => { drag = { x: e.clientX, y: e.clientY, yaw, pitch }; tip.hidden = true }
  const onMove = (e) => {
    if (drag) {
      yaw = drag.yaw - (e.clientX - drag.x) * 0.005
      pitch = Math.max(-0.2, Math.min(0.8, drag.pitch + (e.clientY - drag.y) * 0.004))
      return
    }
    if (e.target !== canvas) { if (hoverId !== null) resetHover(); return }
    const id = hit(e.clientX, e.clientY)
    if (id !== hoverId) {
      hoverId = id
      canvas.style.cursor = id !== null ? 'pointer' : ''
      const d = id !== null ? pieces.get(id)?.detail : ''
      tip.textContent = d || ''
      tip.hidden = !d
    }
    if (!tip.hidden) {
      const r = container.getBoundingClientRect()
      tip.style.left = Math.min(e.clientX - r.left + 14, r.width - 20) + 'px'
      tip.style.top = e.clientY - r.top + 16 + 'px'
    }
  }
  const onUp = (e) => {
    const d = drag
    drag = null
    if (!d || e.target !== canvas) return
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) >= DRAG_PX) return // foi um arrasto, não um clique
    const id = hit(e.clientX, e.clientY)
    if (id !== null && pickCb) pickCb(id)
  }
  const onCancel = () => { drag = null }
  const onWheel = (e) => {
    e.preventDefault()
    zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom * Math.exp(e.deltaY * 0.001)))
  }
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointerleave', resetHover)
  canvas.addEventListener('wheel', onWheel, { passive: false })
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onCancel)

  // ---- tamanho ----
  function resize() {
    const w = container.clientWidth || window.innerWidth
    const h = container.clientHeight || window.innerHeight
    renderer.setSize(w, h)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
  ro?.observe(container)
  window.addEventListener('resize', resize)
  resize()

  // ---- laço ----
  function frame() {
    const nowMs = performance.now()
    const t = nowMs / 1000
    const sway = drag || planar ? 0 : Math.sin(t * 0.15) * 0.18
    const r = fittedDistance() * zoom
    const ya = yaw + sway
    lookAt.set(fitBox.cx, fitBox.cy, fitBox.cz)
    camera.position.set(
      lookAt.x + Math.sin(ya) * r * Math.cos(pitch),
      lookAt.y + (planar ? 0 : 1.2) + Math.sin(pitch) * r,
      lookAt.z + Math.cos(ya) * r * Math.cos(pitch),
    )
    camera.lookAt(lookAt)
    camera.updateMatrixWorld()

    for (const p of pieces.values()) {
      const on = focused ? focused.has(p.id) : false
      const want = focused === null ? 0.35 : on ? 1 : 0.12
      p.level += (want - p.level) * 0.06
      const pulse = on ? 1 + Math.sin(t * 4) * 0.05 : 1
      p.object.scale.setScalar(p.scale * (0.9 + p.level * 0.3) * pulse)
      for (const m of p.mats) m.emissiveIntensity = 0.08 + p.level * 0.9
      if (p.labelEl) {
        placeLabel(p)
        p.labelEl.classList.toggle('on', on)
        p.labelEl.classList.toggle('dim', focused !== null && !on)
      }
    }

    for (const pk of [...packets]) {
      const u = (nowMs - pk.start) / pk.dur
      if (u > 1.25) { pk.remove(); continue }
      pk.parts.forEach((m, k) => {
        const uk = u - k * 0.025
        if (uk < 0 || uk > 1) { m.visible = false; m.material.opacity = 0; return }
        m.visible = true
        pk.curve.getPoint(uk, m.position)
        m.material.opacity = (1 - k / TRAIL) * (u > 1 ? Math.max(0, 1 - (u - 1) * 4) : 1)
      })
    }
    for (const cb of frameCbs) { try { cb(t, nowMs) } catch (e) { console.error(e) } }
    renderer.render(scene, camera)
  }
  let running = false
  function startLoop() { if (!running) { running = true; renderer.setAnimationLoop(frame) } }
  function stopLoop() { if (running) { running = false; renderer.setAnimationLoop(null) } }
  const onVis = () => (document.hidden ? stopLoop() : startLoop())
  document.addEventListener('visibilitychange', onVis)
  if (!document.hidden) startLoop()

  // ---- limpeza ----
  function disposeObject(o) {
    o.traverse((c) => {
      if (!trailGeo.includes(c.geometry)) c.geometry?.dispose?.()
      for (const m of [].concat(c.material || [])) {
        if (!m) continue
        for (const key of Object.keys(m)) if (m[key] && m[key].isTexture) m[key].dispose()
        m.dispose()
      }
    })
  }
  function clear() {
    for (const id of [...pieces.keys()]) removePiece(id)
    for (const pk of [...packets]) pk.remove()
    for (const o of [...scene.children]) if (!base.has(o)) { scene.remove(o); disposeObject(o) }
    frameCbs.clear()
    focused = null
    resetHover()
    fit()
  }

  function setTheme(name) {
    if (!THEMES[name] || name === themeName) return
    themeName = name
    T = THEMES[name]
    scene.fog.color.setHex(T.bg)
    renderer.setClearColor(T.bg)
    ambient.intensity = name === 'dark' ? 0.35 : 0.6
    stars.visible = T.stars
    const vis = floor.visible
    const y = floor.position.y
    buildFloor()
    floor.visible = vis
    floor.position.y = y
  }

  function dispose() {
    stopLoop()
    document.removeEventListener('visibilitychange', onVis)
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onCancel)
    window.removeEventListener('resize', resize)
    ro?.disconnect()
    clear()
    for (const o of base) disposeObject(o)
    tip.remove()
    for (const g of trailGeo) g.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
    canvas.remove()
  }

  return {
    THREE, scene, camera,
    addPiece, focus, packet, fit,
    onPick(cb) { pickCb = typeof cb === 'function' ? cb : null },
    onFrame(cb) { frameCbs.add(cb); return () => frameCbs.delete(cb) },
    setTheme,
    get theme() { return themeName },
    get tubeColor() { return T.tube },
    wait: (ms) => new Promise((r) => setTimeout(r, ms)),
    now: () => performance.now(),
    clear, dispose,
  }
}
