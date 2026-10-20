// Peças comuns dos diagramas 2D (fluxo, estados, arvore): pares de caminho, marcador que percorre curvas e setas.
// Funções puras no topo (sem three); o resto usa stage.THREE. Conclusão por relógio (R6).

// Pares consecutivos de um caminho: ['a','b','c'] -> [['a','b'],['b','c']].
export function pathEdges(path) {
  const out = []
  if (!Array.isArray(path)) return out
  for (let i = 0; i + 1 < path.length; i++) out.push([path[i], path[i + 1]])
  return out
}

// Onde o marcador descansa no passo i: último nó do último `path` até o passo i (ou null).
export function lastStop(steps, i) {
  let stop = null
  for (let k = 0; k <= i && k < (steps || []).length; k++) {
    const p = steps[k] && steps[k].path
    if (Array.isArray(p) && p.length) stop = p[p.length - 1]
  }
  return stop
}

export function travelMs(count, segMs, gapMs) {
  return count <= 0 ? 0 : count * (segMs + gapMs) - gapMs
}

// Segmento e fração (0..1) do marcador após `elapsed` ms; entre segmentos ele espera no fim do anterior.
export function markerPos(count, segMs, gapMs, elapsed) {
  if (count <= 0) return { seg: -1, u: 0, done: true }
  if (elapsed >= travelMs(count, segMs, gapMs)) return { seg: count - 1, u: 1, done: true }
  const span = segMs + gapMs
  const e = Math.max(0, elapsed)
  const seg = Math.min(count - 1, Math.floor(e / span))
  return { seg, u: Math.min(1, (e - seg * span) / segMs), done: false }
}

// Marcador (esfera) que percorre uma lista de curvas (qualquer objeto com getPoint(u, alvo)).
export function createMarker(stage, color) {
  const { THREE } = stage
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 24), new THREE.MeshBasicMaterial({ color }))
  mesh.visible = false
  stage.scene.add(mesh)
  let run = null
  let token = 0
  const off = stage.onFrame((t, nowMs) => {
    if (!run) return
    const p = markerPos(run.curves.length, run.segMs, run.gapMs, nowMs - run.start)
    if (p.seg >= 0) run.curves[p.seg].getPoint(p.u, mesh.position)
  })
  return {
    mesh,
    place(v) {
      token++
      run = null
      if (v) { mesh.position.copy(v); mesh.visible = true } else mesh.visible = false
    },
    // resolve quando o marcador chega ao fim; onArrive(k) dispara ao fim do segmento k
    async travel(curves, { segMs = 1000, gapMs = 150, onArrive } = {}) {
      const my = ++token
      run = { curves, segMs, gapMs, start: performance.now() }
      mesh.visible = true
      curves.forEach((_, k) => {
        setTimeout(() => { if (my === token && onArrive) onArrive(k) }, k * (segMs + gapMs) + segMs)
      })
      await stage.wait(travelMs(curves.length, segMs, gapMs))
    },
    dispose() { token++; run = null; off() },
  }
}

// Ponta de seta na curva, a `trim` unidades do fim, apontando no sentido da curva. Devolve o material.
export function addArrowHead(stage, curve, color, trim = 0.9, opacity = 0.5) {
  const { THREE } = stage
  const len = typeof curve.getLength === 'function' ? curve.getLength() : 1
  const u = Math.max(0.05, 1 - trim / Math.max(len, 0.01))
  const at = curve.getPoint(u)
  const tan = curve.getPoint(Math.min(1, u + 0.02)).sub(curve.getPoint(Math.max(0, u - 0.02)))
  if (tan.lengthSq() === 0) tan.set(0, -1, 0)
  tan.normalize()
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity })
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.34, 16), mat)
  cone.position.copy(at)
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan)
  stage.scene.add(cone)
  return mat
}
