export function isOverlayRouteFromLocation(location: Pick<Location, 'hash' | 'search'>): boolean {
  return (
    location.hash === '#/overlay' ||
    location.hash.startsWith('#/overlay') ||
    new URLSearchParams(location.search).get('window') === 'overlay'
  )
}

export function isOverlayRoute(): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  return isOverlayRouteFromLocation(window.location)
}

/** Floating overlay box windows load `#/box/<id>`. */
export function boxIdFromLocation(location: Pick<Location, 'hash'>): string | null {
  const match = /^#\/box\/([a-z0-9-]{1,24})$/.exec(location.hash)
  return match ? match[1]! : null
}

export function currentBoxId(): string | null {
  if (typeof window === 'undefined') {
    return null
  }
  return boxIdFromLocation(window.location)
}
