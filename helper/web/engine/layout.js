// Layouts puros (sem three, sem DOM): devolvem posições [x, y, z]; y negativo = mais abaixo.
const GAP_X = 3.2 // distância horizontal mínima entre peças vizinhas
const GAP_Y = 2.6 // distância entre níveis

const idOf = (n) => (n !== null && typeof n === 'object' ? n.id : n)
const edgeOf = (e) => (Array.isArray(e) ? [e[0], e[1]] : [e?.from, e?.to])

export function row(n, gap = 3) {
  const out = []
  for (let i = 0; i < n; i++) out.push([(i - (n - 1) / 2) * gap, 0, 0])
  return out
}

export function grid(n, cols, gap = 3) {
  const c = Math.max(1, Math.min(cols | 0 || 1, n || 1))
  const rows = Math.ceil(n / c)
  const out = []
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / c)
    const inRow = r === rows - 1 ? n - r * c : c
    out.push([((i % c) - (inRow - 1) / 2) * gap, -(r - (rows - 1) / 2) * gap, 0])
  }
  return out
}

export function bounds(points) {
  if (!points.length) return { min: [0, 0, 0], max: [0, 0, 0] }
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (const p of points) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]) }
  return { min, max }
}

// Níveis a partir das fontes (busca em profundidade só para achar arestas de retorno, que são ignoradas;
// depois o caminho mais longo no que sobra, de modo que toda aresta desce); ordem no nível por baricentro.
export function layered(nodes, edges = []) {
  const ids = []
  const known = new Set()
  for (const n of nodes) { const id = idOf(n); if (!known.has(id)) { known.add(id); ids.push(id) } }
  const out = new Map(ids.map((id) => [id, []]))
  const inc = new Map(ids.map((id) => [id, []]))
  for (const e of edges) {
    const [a, b] = edgeOf(e)
    if (!known.has(a) || !known.has(b) || a === b) continue
    if (!out.get(a).includes(b)) { out.get(a).push(b); inc.get(b).push(a) }
  }
  // arestas de retorno
  const state = new Map() // 1 = na pilha, 2 = terminado
  const back = new Set()
  const visit = (root) => {
    const stack = [[root, 0]]
    state.set(root, 1)
    while (stack.length) {
      const top = stack[stack.length - 1]
      const [u, i] = top
      if (i >= out.get(u).length) { state.set(u, 2); stack.pop(); continue }
      top[1]++
      const v = out.get(u)[i]
      if (state.get(v) === 1) back.add(u + '\u0000' + v)
      else if (!state.has(v)) { state.set(v, 1); stack.push([v, 0]) }
    }
  }
  for (const id of ids) if (!inc.get(id).length && !state.has(id)) visit(id)
  for (const id of ids) if (!state.has(id)) visit(id) // ciclos sem fonte
  const fwdOut = new Map(ids.map((id) => [id, out.get(id).filter((v) => !back.has(id + '\u0000' + v))]))
  const indeg = new Map(ids.map((id) => [id, 0]))
  for (const id of ids) for (const v of fwdOut.get(id)) indeg.set(v, indeg.get(v) + 1)
  const level = new Map(ids.map((id) => [id, 0]))
  const queue = ids.filter((id) => indeg.get(id) === 0)
  while (queue.length) {
    const u = queue.shift()
    for (const v of fwdOut.get(u)) {
      level.set(v, Math.max(level.get(v), level.get(u) + 1))
      indeg.set(v, indeg.get(v) - 1)
      if (indeg.get(v) === 0) queue.push(v)
    }
  }
  const depth = Math.max(0, ...level.values())
  const rows = Array.from({ length: depth + 1 }, () => [])
  for (const id of ids) rows[level.get(id)].push(id)
  // baricentro: varre para baixo e para cima algumas vezes
  const order = new Map()
  const setOrder = () => rows.forEach((r) => r.forEach((id, i) => order.set(id, i)))
  setOrder()
  const sweep = (r, neighbours) => {
    const key = new Map()
    r.forEach((id, i) => {
      const ns = neighbours(id).filter((x) => order.has(x))
      key.set(id, ns.length ? ns.reduce((s, x) => s + order.get(x), 0) / ns.length : i)
    })
    r.sort((a, b) => key.get(a) - key.get(b))
  }
  for (let pass = 0; pass < 4; pass++) {
    for (let l = 1; l <= depth; l++) { sweep(rows[l], (id) => inc.get(id).filter((x) => level.get(x) < l)); setOrder() }
    for (let l = depth - 1; l >= 0; l--) { sweep(rows[l], (id) => out.get(id).filter((x) => level.get(x) > l)); setOrder() }
  }
  const pos = new Map()
  rows.forEach((r, l) => r.forEach((id, i) => pos.set(id, [(i - (r.length - 1) / 2) * GAP_X, -l * GAP_Y, 0])))
  return pos
}

// Filhos espalhados sob o pai: cada folha ocupa uma coluna, o pai fica no meio dos filhos.
export function tree(nodes) {
  const ids = []
  const known = new Set()
  for (const n of nodes) { const id = idOf(n); if (!known.has(id)) { known.add(id); ids.push(id) } }
  const parentOf = new Map()
  const kids = new Map(ids.map((id) => [id, []]))
  const link = (p, c) => {
    if (!known.has(p) || !known.has(c) || p === c || parentOf.has(c)) return
    let a = p // não aceita ligação que feche um ciclo
    while (a !== undefined && a !== c) a = parentOf.get(a)
    if (a === c) return
    parentOf.set(c, p)
    kids.get(p).push(c)
  }
  for (const n of nodes) if (n !== null && typeof n === 'object' && n.parent !== undefined) link(n.parent, n.id)
  for (const n of nodes) if (n !== null && typeof n === 'object' && Array.isArray(n.children)) for (const c of n.children) link(n.id, c)
  const roots = ids.filter((id) => !parentOf.has(id))
  const pos = new Map()
  let nextCol = 0
  const place = (root) => {
    const stack = [[root, 0, 0, []]] // id, profundidade, índice do próximo filho, colunas dos filhos
    while (stack.length) {
      const top = stack[stack.length - 1]
      const [id, d] = top
      const ks = kids.get(id)
      if (top[2] < ks.length) { const k = ks[top[2]++]; stack.push([k, d + 1, 0, []]); continue }
      const col = top[3].length ? (top[3][0] + top[3][top[3].length - 1]) / 2 : nextCol++
      pos.set(id, [col * GAP_X, -d * GAP_Y, 0])
      stack.pop()
      if (stack.length) stack[stack.length - 1][3].push(col)
    }
  }
  roots.forEach(place)
  const b = bounds([...pos.values()])
  const cx = (b.min[0] + b.max[0]) / 2
  const cy = (b.min[1] + b.max[1]) / 2
  for (const [id, p] of pos) pos.set(id, [p[0] - cx, p[1] - cy, 0])
  return pos
}
