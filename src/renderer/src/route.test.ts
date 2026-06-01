import { describe, expect, it } from 'vitest'
import { isOverlayRouteFromLocation } from './route'

describe('isOverlayRouteFromLocation', () => {
  it('accepts hash and query overlay routes', () => {
    expect(isOverlayRouteFromLocation({ hash: '#/overlay', search: '' } as Location)).toBe(true)
    expect(isOverlayRouteFromLocation({ hash: '#/overlay/items', search: '' } as Location)).toBe(true)
    expect(isOverlayRouteFromLocation({ hash: '', search: '?window=overlay' } as Location)).toBe(true)
    expect(isOverlayRouteFromLocation({ hash: '#/overlay', search: '?window=overlay' } as Location)).toBe(true)
    expect(isOverlayRouteFromLocation({ hash: '', search: '' } as Location)).toBe(false)
  })
})
