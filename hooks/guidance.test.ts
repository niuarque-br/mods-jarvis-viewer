import { expect, mock, test } from 'claude-code/testing'

import { guidance, viewerPrompt } from './guidance'
import { world } from './testkit'

const COMPOSE = { model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: { name: 'default', isKeepingCodingInstructions: true }, traits: [] } as never
const RUN = { command: 'viewer', args: '', origin: { kind: 'user' } as never, presentation: 'inline' as never }

test('IA escolhe orienta quando usar e quando não', () => {
  const g = guidance('IA escolhe')
  for (const s of ['mostrar_cena', 'arquitetura', 'resposta curta', 'preview_start', 'uma frase curta antes']) expect(g).toContain(s)
  expect(g).not.toContain('só quando o usuário pedir')
  expect(g.length).toBeLessThan(1200)
})
test('valor desconhecido conta como IA escolhe', () => expect(guidance('xyz')).toBe(guidance('IA escolhe')))
test('Sob demanda só quando pedir', () => {
  const g = guidance('Sob demanda')
  expect(g).toContain('só quando o usuário pedir')
  expect(g.length).toBeLessThan(1200)
  // the criteria apply only once the user asks: no unconditional "Use para:" (final review minor)
  expect(g).not.toContain('Use para:')
  expect(g.indexOf('só quando o usuário pedir')).toBeLessThan(g.indexOf('arquitetura'))
  for (const s of ['mostrar_cena', 'preview_start', 'uma frase curta antes']) expect(g).toContain(s)
})
test('viewerPrompt vazio', () => expect(viewerPrompt('  ')).toBe('Mostre no viewer a explicação anterior.'))
test('viewerPrompt com assunto', () => expect(viewerPrompt('o cache')).toBe('Explique o cache mostrando no viewer.'))

test('prompt.compose acrescenta a seção', { options: { presentation: 'Sob demanda' } }, async ($, on) => {
  on('prompt.compose', async () => ({ sections: [{ id: 'x', text: 'y', scope: 'session' as const }] }))
  world(on)
  const out = await $.prompt.compose(COMPOSE)
  expect(out.sections).toHaveLength(2)
  expect(out.sections[1]).toMatchObject({ id: 'jarvis-viewer', scope: 'session' })
  expect(out.sections[1]?.text).toContain('só quando o usuário pedir')
})

test('prompt.compose usa IA escolhe por padrão', async ($, on) => {
  on('prompt.compose', async () => ({ sections: [] }))
  world(on)
  const out = await $.prompt.compose(COMPOSE)
  expect(out.sections[0]?.text).toBe(guidance('IA escolhe'))
})

test('/viewer registra e submete o prompt', async ($, on) => {
  const clock = mock.clock(on)
  const calls = world(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(calls.commands).toEqual([{ name: 'viewer', description: 'Mostra no viewer a explicação anterior ou um assunto' }])
  const r = await $.command.run({ ...RUN, args: 'o cache' })
  await clock.settle()
  expect(calls.submitted).toEqual(['Explique o cache mostrando no viewer.'])
  expect(r).toMatchObject({ text: 'Pedindo a cena ao Claude…' })
  await $.command.run(RUN)
  await clock.settle()
  expect(calls.submitted[1]).toBe('Mostre no viewer a explicação anterior.')
})
