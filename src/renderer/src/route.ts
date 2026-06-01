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
