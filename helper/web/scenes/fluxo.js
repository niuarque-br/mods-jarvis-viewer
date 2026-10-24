// Cena «fluxo»: nós em camadas; início/fim são pílulas, decisão é losango. O marcador percorre o `path` do passo
// e as arestas rotuladas mostram o rótulo quando o marcador passa. Câmera de frente (planar).
// Não importa three: usa stage.THREE, então as funções puras abaixo rodam em `node --test`.
import { layered, arrange } from '../engine/layout.js'
import { makePiece, stale, gone } from '../engine/pieces.js'
import { pathEdges, lastStop, markerPos, createMarker, addArrowHead } from '../engine/flowkit.js'

export { pathEdges, lastStop, markerPos }

const COLORS = { inicio: 0x36C5A0, etapa: 0x5B8DEF, decisao: 0xE5B94E, fim: 0xE86A92 }
const ACCENT = 0xD97757
const SEG_MS = 1000
const GAP_MS = 150
const SETTLE_MS = 700
const DIM = 0.22
const LIT = 0.9

// Deslocamento [dx, dy] do ponto de controle da aresta a→b: descida de um nível é reta;
// retorno (sobe ou mesma fila) e salto de vários níveis contornam a fila.
// Com `horizontal` (níveis em x crescente) o cálculo é o mesmo num quadro girado: descer vira ir para a direita.
export function flowBend(a, b, horizontal = false) {
  if (horizontal) {
    const [bx, by] = flowBend([-a[1] * 1.33, -a[0] * 0.565], [-b[1] * 1.33, -b[0] * 0.565])
    return [by ? -by : 0, bx ? -bx : 0]
  }
  const dy = b[1] - a[1]
  const dx = b[0] - a[0]
  if (dy > 0.1) return [2.2, 0] // sobe: laço de retorno
  if (dy > -0.1) return [0, 1.2 + Math.min(Math.abs(dx) * 0.1, 0.8)] // mesma fila
  if (dy < -3) return [dx >= 0 ? 1.5 : -1.5, 0] // pula níveis
  return [0, 0]
}

const CONTORNO = { inicio: 'pilula', fim: 'pilula', decisao: 'losango' }

// Opções da peça de um nó. O contorno da forma original só entra quando o nó é desenhado por uma figura.
export function pieceOptions(n, scene) {
  return { estilo: scene && scene.estilo, padrao: 'caixa', contorno: n && n.figura ? CONTORNO[n.kind] : undefined }
}

// Posições dos nós: níveis de cima para baixo, ou da esquerda para a direita com estilo.arranjo = 'horizontal'.
export function flowPositions(nodes, edges, estilo) {
  return arrange(layered(nodes, edges), estilo)
}

// O desenho de hoje do nó (usado sem figura nem estilo.forma, e quando a figura não carrega).
function legacyMesh(THREE, n, color) {
  const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.15, roughness: 0.35, metalness: 0.2 })
  let mesh
  if (n.kind === 'inicio' || n.kind === 'fim') {
    mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.95, 8, 24), mat)
    mesh.rotation.z = Math.PI / 2
  } else if (n.kind === 'decisao') {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.25, 0.5), mat)
    mesh.rotation.z = Math.PI / 4
  } else mesh = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.0, 0.5), mat)
  const g = new THREE.Group()
  g.add(mesh)
  return g
}

export async function build(scene, stage, alive) {
  const { THREE } = stage
  const nodes = Array.isArray(scene.nodes) ? scene.nodes : []
  const edges = Array.isArray(scene.edges) ? scene.edges : []
  const steps = Array.isArray(scene.steps) ? scene.steps : []
  const horiz = !!(scene.estilo && scene.estilo.arranjo === 'horizontal')
  const pos = flowPositions(nodes, edges, scene.estilo)
  const vec = new Map([...pos].map(([id, p]) => [id, new THREE.Vector3(...p)]))

  const pieces = new Map()
  const cores = nodes.map((n) => COLORS[n.kind] ?? COLORS.etapa)
  const made = await Promise.all(nodes.map((n, i) => makePiece(stage, n, { ...pieceOptions(n, scene), cor: cores[i], desenho: () => legacyMesh(THREE, n, cores[i]) })))
  if (stale(alive, made)) return gone()
  nodes.forEach((n, i) => {
    const color = cores[i]
    const g = made[i]
    g.position.copy(vec.get(n.id))
    stage.addPiece(n.id, g, { label: n.label, detail: n.detail, color })
    pieces.set(n.id, g)
  })

  // arestas: tubo + ponta de seta; o rótulo só entra quando o marcador passa
  const edgeInfo = new Map() // "a>b" -> { curve, mats, level, want, label, lab, shown }
  for (const e of edges) {
    const key = e.from + '>' + e.to
    const A = vec.get(e.from)
    const B = vec.get(e.to)
    if (edgeInfo.has(key) || e.from === e.to || !A || !B) continue
    const [bx, by] = flowBend([A.x, A.y, 0], [B.x, B.y, 0], horiz)
    const curve = bx || by
      ? new THREE.QuadraticBezierCurve3(A.clone(), A.clone().add(B).multiplyScalar(0.5).add(new THREE.Vector3(bx, by, 0)), B.clone())
      : new THREE.LineCurve3(A.clone(), B.clone())
    const tubeMat = new THREE.MeshBasicMaterial({ color: stage.tubeColor, transparent: true, opacity: DIM })
    stage.scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 32, 0.03, 8), tubeMat))
    const headMat = addArrowHead(stage, curve, stage.tubeColor, 0.95, DIM)
    const lab = new THREE.Group()
    // perto do destino e para o lado, longe do rótulo do nó de origem; o palco põe o rótulo ~1,2 abaixo de um grupo vazio
    lab.position.copy(curve.getPoint(0.68))
    lab.position.x += (B.x >= A.x ? 1 : -1) * 0.8
    lab.position.y += 1.5
    edgeInfo.set(key, { curve, mats: [tubeMat, headMat], level: DIM, want: DIM, label: e.label || '', lab, shown: false })
  }
  const setLabel = (info, key, on) => {
    if (!info.label || info.shown === on) return
    info.shown = on
    stage.addPiece('aresta:' + key, info.lab, on ? { label: info.label } : {}) // sem rótulo = tira o texto da tela
  }

  const marker = createMarker(stage, ACCENT)
  const off = stage.onFrame(() => {
    for (const info of edgeInfo.values()) {
      info.level += (info.want - info.level) * 0.1
      for (const m of info.mats) m.opacity = info.level
    }
  })

  const box = new THREE.Box3()
  for (const v of vec.values()) box.expandByPoint(v)
  box.expandByVector(new THREE.Vector3(2.2, 1.4, 0.5))
  stage.fit(box, { planar: true })

  let token = 0
  return {
    pieces,
    async play(stepIndex, step) {
      const my = ++token
      stage.focus(step && step.focus)
      const onPath = new Set(pathEdges(step && step.path).map(([a, b]) => a + '>' + b))
      for (const [key, info] of edgeInfo) {
        info.want = onPath.has(key) ? LIT : DIM
        setLabel(info, key, false)
      }
      const path = (step && Array.isArray(step.path) ? step.path : []).filter((id) => vec.has(id))
      if (!path.length) {
        const stop = lastStop(steps, stepIndex)
        marker.place(stop && vec.has(stop) ? vec.get(stop) : null)
        return stage.wait(SETTLE_MS)
      }
      marker.place(vec.get(path[0]))
      if (path.length < 2) return stage.wait(SETTLE_MS)
      const hops = pathEdges(path)
      const curves = hops.map(([a, b]) => {
        const info = edgeInfo.get(a + '>' + b)
        return info ? info.curve : new THREE.LineCurve3(vec.get(a).clone(), vec.get(b).clone())
      })
      await marker.travel(curves, {
        segMs: SEG_MS,
        gapMs: GAP_MS,
        onArrive: (k) => {
          if (my !== token) return
          const key = hops[k][0] + '>' + hops[k][1]
          const info = edgeInfo.get(key)
          if (info) setLabel(info, key, true)
        },
      })
      await stage.wait(SETTLE_MS)
    },
    dispose() {
      token++
      off()
      marker.dispose()
      edgeInfo.clear()
      pieces.clear()
    },
  }
}
