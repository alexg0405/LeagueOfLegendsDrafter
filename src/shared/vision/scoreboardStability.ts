/**
 * Tracks how long a condition (e.g. full scoreboard on screen) has been true
 * in continuous ticks. When stable for >= thresholdMs, `stable` is true.
 * Used for the "hold Tab ~2s" story — vision will later set `visible` from template match.
 */
export function createStabilityTracker(thresholdMs: number) {
  let acc = 0
  return {
    tick(visible: boolean, deltaMs: number) {
      if (visible) {
        acc = Math.min(thresholdMs + 1, acc + Math.max(0, deltaMs))
      } else {
        acc = 0
      }
      return {
        stable: acc >= thresholdMs,
        progressMs: acc,
        remainingMs: Math.max(0, thresholdMs - acc)
      }
    },
    reset() {
      acc = 0
    }
  }
}

export const DEFAULT_SCOREBOARD_STABLE_MS = 2000
