import { test } from 'node:test'
import assert from 'node:assert/strict'
import { niceTicks, chartScale, barBase, barExtent, donutAngles, formatValue, tickDigits, valueDigits, withAxis, parseRef, stagger, RELIEF, CHART_H } from '../scenes/grafico.js'

const finite = (a) => a.every(Number.isFinite)

test('niceTicks: ~5 marcas crescentes, com o intervalo cobrindo os dados', () => {
  const t = niceTicks(0, 14)
  assert.ok(t.length >= 3 && t.length <= 6, String(t))
  assert.ok(t[0] <= 0 && t[t.length - 1] >= 14)
  for (let i = 1; i < t.length; i++) assert.ok(t[i] > t[i - 1])
  assert.deepEqual(niceTicks(-2, 5), [-2, 0, 2, 4, 6])
})

test('niceTicks inclui o 0 quando min > 0 ou max < 0', () => {
  const a = niceTicks(40, 90)
  assert.ok(a.includes(0) && a[a.length - 1] >= 90)
  const b = niceTicks(-90, -40)
  assert.ok(b.includes(0) && b[0] <= -90)
})

test('niceTicks com min = max = 5: sem NaN e com intervalo positivo', () => {
  const t = niceTicks(5, 5)
  assert.ok(finite(t) && t.length >= 2)
  assert.ok(t[1] - t[0] > 0)
  assert.ok(t.includes(0) && t[t.length - 1] >= 5)
  const z = niceTicks(0, 0)
  assert.ok(finite(z) && z[z.length - 1] > z[0])
  const n = niceTicks(-5, -5)
  assert.ok(finite(n) && n[0] <= -5 && n.includes(0))
})

test('niceTicks sem zero (linhas/dispersão): valores iguais ganham folga; entradas inválidas não quebram', () => {
  const t = niceTicks(5, 5, 5, { zero: false })
  assert.ok(finite(t) && t[0] < 5 && t[t.length - 1] > 5)
  assert.ok(!niceTicks(1000, 1050, 5, { zero: false }).includes(0))
  assert.ok(finite(niceTicks(NaN, undefined)))
  assert.ok(finite(niceTicks(Infinity, -Infinity)))
})

test('barBase é sempre 0 e a altura é |v|; negativas descem', () => {
  for (const v of [7, 0, -3.5, 1e-9]) {
    assert.equal(barBase(v), 0)
    assert.equal(barExtent(v).base, 0)
    assert.equal(barExtent(v).height, Math.abs(v))
  }
  assert.equal(barExtent(-3).dir, -1)
  assert.equal(barExtent(-3).top, -3)
  assert.equal(barExtent(3).dir, 1)
  assert.equal(barExtent(NaN).height, 0)
})

test('Review Focus 4: escala com negativos inclui o zero e o mínimo; barras partem do zero', () => {
  const sc = chartScale([3, -2, 5])
  assert.ok(sc.min <= -2 && sc.max >= 5 && sc.ticks.includes(0))
  assert.ok(Math.abs(sc.toY(sc.min) + CHART_H / 2) < 1e-9 && Math.abs(sc.toY(sc.max) - CHART_H / 2) < 1e-9)
  assert.ok(sc.toY(-2) < sc.zeroY && sc.toY(3) > sc.zeroY) // negativa abaixo da linha do zero
  // alturas na tela proporcionais ao valor (mesma escala): |y(v) - y(0)| = |v| * k
  const k = (sc.toY(5) - sc.zeroY) / 5
  assert.ok(Math.abs((sc.zeroY - sc.toY(-2)) - 2 * k) < 1e-9)
})

test('Review Focus 4: valores todos iguais não dividem por zero', () => {
  for (const vals of [[5, 5, 5], [-4, -4], [0, 0], [5], []]) {
    const sc = chartScale(vals)
    assert.ok(sc.max > sc.min, JSON.stringify(vals))
    assert.ok(finite([sc.min, sc.max, sc.zeroY, ...vals.map(sc.toY)]), JSON.stringify(vals))
    assert.ok(sc.ticks.includes(0))
  }
  const eq = chartScale([5, 5, 5])
  assert.ok(eq.toY(5) > eq.zeroY)
})

test('donutAngles somam 2π, em ordem e por |v|', () => {
  const a = donutAngles([1, 2, 3, 4])
  const sum = a.reduce((s, x) => s + (x.end - x.start), 0)
  assert.ok(Math.abs(sum - 2 * Math.PI) < 1e-9)
  for (let i = 1; i < a.length; i++) assert.ok(Math.abs(a[i].start - a[i - 1].end) < 1e-9)
  assert.ok(Math.abs(a[3].frac - 0.4) < 1e-9)
  const neg = donutAngles([-1, 1])
  assert.ok(Math.abs(neg[0].end - neg[0].start - Math.PI) < 1e-9)
  assert.ok(Math.abs(donutAngles([2, 2], 1).at(-1).end - (1 + 2 * Math.PI)) < 1e-9)
})

test('donutAngles com soma zero: setores vazios, sem NaN', () => {
  const a = donutAngles([0, 0, NaN])
  assert.equal(a.length, 3)
  assert.ok(a.every((s) => s.end === s.start && s.frac === 0))
  assert.deepEqual(donutAngles([]), [])
})

test('relevo do gráfico fica em 0,15 unidade ou menos', () => assert.ok(RELIEF > 0 && RELIEF <= 0.15))

test('formatValue: unidade e sinal', () => {
  assert.equal(formatValue(12.5, 'R$'), '12,5 R$')
  assert.equal(formatValue(-3, 'un'), '−3 un')
  assert.equal(formatValue(40, '%'), '40%')
  assert.equal(formatValue(7), '7')
  assert.equal(formatValue(NaN, 'x'), '— x')
})

test('parseRef e stagger', () => {
  assert.deepEqual(parseRef('vendas#2'), { series: 'vendas', index: 2, id: 'vendas#2' })
  assert.deepEqual(parseRef('a#b#3'), { series: 'a#b', index: 3, id: 'a#b#3' })
  assert.equal(parseRef('vendas'), null)
  assert.equal(parseRef(3), null)
  assert.equal(stagger(0, 0, 4), 0)
  assert.equal(stagger(1, 3, 4), 1)
  assert.ok(stagger(0.3, 0, 4) > stagger(0.3, 3, 4))
  assert.equal(stagger(0.5, 0, 1), 1)
})

test('niceTicks com entradas gigantes volta logo e sem NaN/Infinity', () => {
  const t0 = Date.now()
  const a = niceTicks(1e16, 1e16 + 2, 5, { zero: false })
  const b = niceTicks(-1e308, 1e308)
  const c = niceTicks(0, 1e308)
  const d = niceTicks(0, 5e-324 * 3, 5, { zero: false })
  assert.ok(Date.now() - t0 < 500)
  for (const t of [a, b, c, d]) assert.ok(t.length >= 2 && t.length <= 51 && finite(t), String(t))
})

test('eixo pequeno (0,001 a 0,005) tem casas suficientes para não virar tudo 0', () => {
  const sc = chartScale([0.001, 0.003, 0.005])
  const td = tickDigits(sc.ticks)
  assert.ok(td >= 3)
  const labels = sc.ticks.map((t) => formatValue(t, '', td))
  assert.equal(new Set(labels).size, labels.length)
  assert.ok(labels.some((l) => l === '0,002'), labels.join('|'))
  assert.ok(valueDigits(sc.ticks) >= 3)
  assert.equal(formatValue(0.0034, '', valueDigits(sc.ticks)), '0,0034')
  assert.equal(tickDigits([0, 5, 10]), 0)
  assert.equal(valueDigits([0, 5, 10]), 2)
  assert.equal(formatValue(12.345, 'x'), '12,35 x')
  assert.ok(tickDigits([0, 1e-12]) <= 6)
})

test('withAxis: com foco os rótulos de eixo continuam acesos; sem foco, nada', () => {
  assert.equal(withAxis(new Set(), ['__tick:y0']), undefined)
  const l = withAxis(new Set(['s#1']), ['__tick:y0', '__cat:1', '__cat:1'])
  assert.deepEqual(l.sort(), ['__cat:1', '__tick:y0', 's#1'])
})
