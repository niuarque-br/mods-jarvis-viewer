// Peça de cena: figura (plano voltado à câmera) ou forma geométrica, com contorno e movimento opcionais.
// Precedência: figura da peça > estilo.forma da cena > padrão do tipo. Figura que falha cai no padrão do tipo.
// Não importa three: usa stage.THREE, então as funções puras rodam em `node --test`.
import { loadFigure } from './figure.js'
import { motionAt, intensidade } from './motion.js'

export const FORMAS = ['caixa', 'esfera', 'octaedro', 'cilindro', 'pessoa', 'orbe']
const BASE = 1.6 // lado do plano da figura, na ordem de grandeza das formas

export function escolherForma(peca, estiloCena, padraoDoTipo) {
  const fig = peca && typeof peca.figura === 'string' ? peca.figura.trim() : ''
  if (fig) return { kind: 'figura', nome: fig }
  const f = estiloCena && estiloCena.forma
  if (FORMAS.includes(f)) return { kind: 'forma', forma: f }
  return { kind: 'forma', forma: FORMAS.includes(padraoDoTipo) ? padraoDoTipo : 'caixa' }
}

// A fábrica de malhas que as cenas usavam inline (arquitetura). → { group, spinners: [{ o, ry, rx }] }
// Os spinners são incrementos por quadro, como sempre foram; quem os aplica é o chamador.
export function makeShape(THREE, shape, color) {
  const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.15, roughness: 0.35, metalness: 0.2 })
  const g = new THREE.Group()
  const spinners = []
  let mesh
  if (shape === 'esfera') mesh = new THREE.Mesh(new THREE.SphereGeometry(0.8, 40, 40), mat)
  else if (shape === 'octaedro') mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.85), mat)
  else if (shape === 'cilindro') mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.2, 40), mat)
  else if (shape === 'orbe') {
    mesh = new THREE.Mesh(new THREE.SphereGeometry(0.75, 48, 48), mat)
    const cage = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.05, 1),
      new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.35 }),
    )
    g.add(cage)
    spinners.push({ o: cage, ry: 0, rx: 0.004 })
  } else if (shape === 'pessoa') {
    mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.6, 8, 24), mat)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 32, 32), mat)
    head.position.y = 0.95
    g.add(head)
    mesh.position.y = -0.2
  } else mesh = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.15, 1.15), mat)
  g.add(mesh)
  spinners.push({ o: g, ry: shape === 'octaedro' ? 0.012 : 0.003, rx: 0 })
  return { group: g, spinners }
}

// Contorno fino em volta da figura: 'pilula' (cápsula) ou 'losango'.
function outlinePoints(kind, THREE) {
  const pts = []
  if (kind === 'losango') {
    const r = BASE * 0.78
    for (const [x, y] of [[0, r], [r, 0], [0, -r], [-r, 0]]) pts.push(new THREE.Vector3(x, y, 0))
    return pts
  }
  const hw = BASE * 0.72, hh = BASE * 0.5, r = hh // cápsula horizontal
  for (let i = 0; i <= 24; i++) { const a = -Math.PI / 2 + (Math.PI * i) / 24; pts.push(new THREE.Vector3(hw - r + Math.cos(a) * r, Math.sin(a) * r, 0)) }
  for (let i = 0; i <= 24; i++) { const a = Math.PI / 2 + (Math.PI * i) / 24; pts.push(new THREE.Vector3(-hw + r + Math.cos(a) * r, Math.sin(a) * r, 0)) }
  return pts
}

function makeOutline(THREE, kind, color) {
  const geo = new THREE.BufferGeometry().setFromPoints(outlinePoints(kind, THREE))
  const line = new THREE.LineLoop(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }))
  line.userData.outline = true
  return line
}

// Opacidade nominal de cada material, para o movimento e o apagado multiplicarem sem acumular.
// Materiais de figura/contorno são sempre transparentes; os da forma só enquanto a opacidade < 1 (evita ordenação torta).
function fadeTargets(root) {
  const list = []
  root.traverse((o) => {
    if (!o.material) return
    for (const m of [].concat(o.material)) {
      if (m.userData.baseOpacity === undefined) { m.userData.baseOpacity = m.opacity; m.userData.baseTransparent = m.transparent }
      list.push(m)
    }
  })
  return list
}

// Nível de foco do stage (≈0.12 apagada, 0.35 normal, 1 foco) → estado do movimento.
export function estadoDoNivel(level) {
  const l = Number.isFinite(level) ? level : 0.35
  return l > 0.8 ? 'foco' : l < 0.2 ? 'apagada' : 'normal'
}

export async function makePiece(stage, peca, { estilo, padrao, cor, contorno } = {}) {
  const { THREE } = stage
  const choice = escolherForma(peca, estilo, padrao)
  const outer = new THREE.Group() // o stage escala e posiciona este grupo
  const inner = new THREE.Group() // os movimentos só mexem aqui
  const face = new THREE.Group() // sempre voltado à câmera: figura e contorno
  outer.add(inner)
  inner.add(face)
  const color = cor === undefined || cor === null ? 0xE8ECF3 : cor

  let plane = null
  let shape = null
  if (choice.kind === 'figura') {
    let tex = null
    try { tex = await loadFigure(stage, choice.nome, { cor }) } catch { tex = null }
    if (tex) {
      plane = new THREE.Mesh(
        new THREE.PlaneGeometry(BASE, BASE),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
      )
      plane.material.userData.alwaysTransparent = true
      face.add(plane)
    }
  }
  if (!plane) {
    const forma = choice.kind === 'forma' ? choice.forma : FORMAS.includes(padrao) ? padrao : 'caixa'
    shape = makeShape(THREE, forma, color)
    inner.add(shape.group)
  }
  if (contorno === 'pilula' || contorno === 'losango') {
    const line = makeOutline(THREE, contorno, color)
    line.material.userData.alwaysTransparent = true
    face.add(line)
  }

  const fades = fadeTargets(inner)
  const tipo = peca && peca.movimento
  const q = new THREE.Quaternion()

  const off = stage.onFrame(() => {
    const lvl = Number.isFinite(outer.userData.level) ? outer.userData.level : 0.35 // escrito pelo stage a cada quadro
    const m = motionAt(tipo, stage.now() / 1000, { intensidade: intensidade(estadoDoNivel(lvl)) })
    inner.position.y = m.dy
    inner.scale.setScalar(m.scale)
    if (shape) inner.rotation.y = m.rotY
    const dim = plane ? 0.45 + 0.55 * Math.min(Math.max(lvl, 0), 1) : 1 // forma já escurece pelo emissivo do stage
    for (const f of fades) {
      f.opacity = f.userData.baseOpacity * m.opacity * dim
      const t = f.userData.alwaysTransparent || f.userData.baseTransparent || f.opacity < 0.999
      if (f.transparent !== t) { f.transparent = t; f.needsUpdate = true }
    }
    // figura e contorno voltados à câmera; girar/balançar giram só o plano em torno do próprio Y
    inner.updateWorldMatrix(true, false)
    inner.getWorldQuaternion(q).invert()
    face.quaternion.copy(q).multiply(stage.camera.quaternion)
    if (plane) plane.rotation.y = m.rotY
    if (shape) for (const s of shape.spinners) { s.o.rotation.y += s.ry; s.o.rotation.x += s.rx }
  })
  outer.userData.dispose = off
  outer.userData.fallback = choice.kind === 'figura' && !plane
  return outer
}
