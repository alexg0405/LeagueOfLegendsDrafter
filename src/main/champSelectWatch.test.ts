import { describe, expect, it } from 'vitest'
import { ChampSelectWatch, champSelectSignal } from './champSelectWatch'

function watch(endAfter = 3) {
  const events: string[] = []
  const w = new ChampSelectWatch({ endAfter, onStart: () => events.push('start'), onEnd: () => events.push('end') })
  return { w, events }
}

describe('champSelectSignal', () => {
  it('reads a session as in, a 404 or a missing client as out, and errors as unknown', () => {
    expect(champSelectSignal({ lockfileFound: true, champSelect: true })).toBe('in')
    expect(champSelectSignal({ lockfileFound: true, champSelect: false })).toBe('out')
    expect(champSelectSignal({ lockfileFound: false })).toBe('out')
    expect(champSelectSignal({ lockfileFound: true })).toBe('unknown')
  })
})

describe('ChampSelectWatch', () => {
  it('starts once when a session appears', () => {
    const { w, events } = watch()
    w.update('out')
    w.update('in')
    w.update('in')
    expect(events).toEqual(['start'])
    expect(w.inChampSelect).toBe(true)
  })

  it('ends only after several polls in a row without a session', () => {
    const { w, events } = watch(3)
    w.update('in')
    w.update('out')
    w.update('out')
    expect(events).toEqual(['start'])
    w.update('in')
    w.update('out')
    w.update('out')
    w.update('out')
    expect(events).toEqual(['start', 'end'])
    expect(w.inChampSelect).toBe(false)
    w.update('out')
    expect(events).toEqual(['start', 'end'])
  })

  it('ignores polls that cannot tell, without resetting the count', () => {
    const { w, events } = watch(2)
    w.update('in')
    w.update('unknown')
    w.update('out')
    w.update('unknown')
    expect(events).toEqual(['start'])
    w.update('out')
    expect(events).toEqual(['start', 'end'])
  })

  it('never ends a champ select it never saw, and starts again for the next one', () => {
    const { w, events } = watch(1)
    w.update('out')
    w.update('unknown')
    expect(events).toEqual([])
    w.update('in')
    w.update('out')
    w.update('in')
    expect(events).toEqual(['start', 'end', 'start'])
  })
})
