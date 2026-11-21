import { describe, expect, it } from 'vitest'
import { PeekController, type PeekDeps } from './peekController'

type Setup = Partial<{ enabled: boolean; inGame: boolean; visible: boolean; league: boolean; mode: 'hold' | 'toggle' }>

function harness(overrides: Setup = {}) {
  const state = { key: false, mod: false, league: true, enabled: true, inGame: true, visible: false, mode: 'hold' as 'hold' | 'toggle', ...overrides }
  const events: string[] = []
  const deps: PeekDeps = {
    reader: {
      keyDown: () => state.key,
      modifierDown: () => state.mod,
      leagueForeground: () => state.league
    },
    isEnabled: () => state.enabled,
    isInGame: () => state.inGame,
    mode: () => state.mode,
    overlayVisible: () => state.visible,
    showOverlay: () => {
      state.visible = true
      events.push('show')
    },
    hideOverlay: () => {
      state.visible = false
      events.push('hide')
    },
    notify: (active) => events.push(active ? 'peek:on' : 'peek:off')
  }
  const peek = new PeekController(deps)
  const press = () => {
    state.key = true
    peek.tick()
    state.key = false
    peek.tick()
  }
  return { state, events, peek, press }
}

describe('peek key: hold mode', () => {
  it('shows the overlay while the key is held and hides it on release', () => {
    const { state, events, peek } = harness()
    peek.tick()
    expect(events).toEqual([])
    state.key = true
    peek.tick()
    peek.tick()
    expect(peek.isActive).toBe(true)
    expect(events).toEqual(['show', 'peek:on'])
    state.key = false
    peek.tick()
    expect(peek.isActive).toBe(false)
    expect(events).toEqual(['show', 'peek:on', 'hide', 'peek:off'])
  })

  it('leaves an overlay the user already had open on screen', () => {
    const { state, events, peek } = harness({ visible: true })
    state.key = true
    peek.tick()
    state.key = false
    peek.tick()
    expect(events).toEqual(['peek:on', 'peek:off'])
    expect(state.visible).toBe(true)
  })

  it('ignores the key outside a game, when disabled, with a modifier held, or outside League', () => {
    for (const setup of [{ inGame: false }, { enabled: false }, { league: false }] as Setup[]) {
      const { state, events, peek } = harness(setup)
      state.key = true
      peek.tick()
      expect(events).toEqual([])
    }
    const { state, events, peek } = harness()
    state.mod = true
    state.key = true
    peek.tick()
    expect(events).toEqual([])
  })

  it('starts once League comes to the front while the key is still held', () => {
    const { state, events, peek } = harness({ league: false })
    state.key = true
    peek.tick()
    state.league = true
    peek.tick()
    expect(events).toEqual(['show', 'peek:on'])
  })

  it('respects a manual toggle during the peek', () => {
    const { state, events, peek } = harness()
    state.key = true
    peek.tick()
    peek.userToggled()
    state.key = false
    peek.tick()
    expect(events).toEqual(['show', 'peek:on', 'peek:off'])
    expect(state.visible).toBe(true)
  })

  it('closes the peek when the game ends mid-hold', () => {
    const { state, events, peek } = harness()
    state.key = true
    peek.tick()
    state.inGame = false
    peek.tick()
    expect(events).toEqual(['show', 'peek:on', 'hide', 'peek:off'])
    expect(peek.isActive).toBe(false)
  })
})

describe('peek key: toggle mode', () => {
  it('shows on one press and hides on the next, ignoring how long the key is held', () => {
    const { state, events, peek, press } = harness({ mode: 'toggle' })
    state.key = true
    peek.tick()
    peek.tick()
    peek.tick()
    expect(events).toEqual(['show', 'peek:on'])
    state.key = false
    peek.tick()
    expect(state.visible).toBe(true)
    press()
    expect(events).toEqual(['show', 'peek:on', 'hide', 'peek:off'])
    expect(state.visible).toBe(false)
  })

  it('a press hides an overlay the user opened by hand', () => {
    const { state, events, press } = harness({ mode: 'toggle', visible: true })
    press()
    expect(events).toEqual(['hide'])
    expect(state.visible).toBe(false)
  })

  it('only counts presses made in League', () => {
    const { state, events, press } = harness({ mode: 'toggle', league: false })
    press()
    expect(events).toEqual([])
    state.league = true
    press()
    expect(events).toEqual(['show', 'peek:on'])
  })

  it('hands control back when the user hides it with the hotkey', () => {
    const { state, events, peek, press } = harness({ mode: 'toggle' })
    press()
    peek.userToggled()
    state.visible = false
    expect(events).toEqual(['show', 'peek:on', 'peek:off'])
    press()
    expect(events).toEqual(['show', 'peek:on', 'peek:off', 'show', 'peek:on'])
  })

  it('hides what it opened when the game ends', () => {
    const { state, events, peek, press } = harness({ mode: 'toggle' })
    press()
    state.inGame = false
    peek.tick()
    expect(events).toEqual(['show', 'peek:on', 'hide', 'peek:off'])
  })
})
