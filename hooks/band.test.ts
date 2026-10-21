import { expect, mock, test } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'

import { world } from './testkit'

const SURFACES = ['terminal', 'desktop'] as const
const BAND = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 80,
  scroll: { offset: 0, bodyRows: 9 },
  view: {},
}

// Stands for another mod's band drawn beneath this plugin (the engine's drawing in a test).
function otherMods(on: Parameters<Parameters<typeof test>[1]>[1]) {
  on('ui.render', { component: 'AbovePrompt' }, async ($, e) => {
    const { Text } = $.ui.resolve(e)
    return h(Text, null, '⚙ Config Mods') as RenderElement
  })
}

for (const surface of SURFACES) {
  test(`a faixa mostra o botão Jarvis Viewer e mantém os outros mods (${surface})`, async ($, on) => {
    mock.clock(on)
    world(on)
    otherMods(on)
    const ui = await $.ui.mount({ plugin: 'jarvis-viewer', surface, component: 'AbovePrompt', props: BAND })
    expect((await ui.find({ key: 'viewer' }))?.text).toContain('Jarvis Viewer')
    expect(await ui.find({ text: '⚙ Config Mods' })).toBeDefined()
  })

  test(`o botão pede ao Claude a explicação anterior no viewer (${surface})`, async ($, on) => {
    const clock = mock.clock(on)
    const calls = world(on)
    otherMods(on)
    const ui = await $.ui.mount({ plugin: 'jarvis-viewer', surface, component: 'AbovePrompt', props: BAND })
    await ui.press({ key: 'viewer' })
    await clock.settle()
    expect(calls.submitted).toEqual(['Mostre no viewer a explicação anterior.'])
  })
}

test('com uma pesquisa na faixa, o botão não aparece', async ($, on) => {
  mock.clock(on)
  world(on)
  otherMods(on)
  const ui = await $.ui.mount({ plugin: 'jarvis-viewer', surface: 'desktop', component: 'AbovePrompt', props: { ...BAND, hasSurvey: true } })
  expect(await ui.find({ key: 'viewer' })).toBeUndefined()
})
