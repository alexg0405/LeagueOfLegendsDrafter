import { describe, expect, it } from 'vitest'
import { boxIdFromLocation, isOverlayRouteFromLocation } from './route'

describe('isOverlayRouteFromLocation', () => {
  it('accepts hash and query overlay routes', () => {
    expect(isOverlayRouteFromLocation({ hash: '#/overlay', search: '' } as Location)).toBe(true)
    expect(isOverlayRouteFromLocation({ hash: '#/overlay/items', search: '' } as Location)).toBe(true)
    expect(isOverlayRouteFromLocation({ hash: '', search: '?window=overlay' } as Location)).toBe(true)
    expect(isOverlayRouteFromLocation({ hash: '#/overlay', search: '?window=overlay' } as Location)).toBe(true)
    expect(isOverlayRouteFromLocation({ hash: '', search: '' } as Location)).toBe(false)
  })
})

describe('boxIdFromLocation', () => {
  it('reads floating box ids and rejects anything else', () => {
    expect(boxIdFromLocation({ hash: '#/box/box-2' } as Location)).toBe('box-2')
    expect(boxIdFromLocation({ hash: '#/overlay' } as Location)).toBeNull()
    expect(boxIdFromLocation({ hash: '#/box/../../etc' } as Location)).toBeNull()
    expect(boxIdFromLocation({ hash: '' } as Location)).toBeNull()
  })
})
