export function isOverlayRoute(): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  return window.location.hash === '#/overlay' || window.location.hash.startsWith('#/overlay')
}
