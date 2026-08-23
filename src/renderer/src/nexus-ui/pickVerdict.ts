/**
 * One word and one colour for a pick, derived from its lobby win-rate delta.
 *
 * Shared by the desktop overlay and the web app so a champion never reads as
 * "GREAT" in one surface and "GOOD" in the other.
 */

export type PickVerdict = {
  /** Short, non-jargon label shown in the badge. */
  word: 'GREAT' | 'GOOD' | 'FINE' | 'MEH' | 'RISKY' | 'OK'
  /** Text colour for the delta number next to the badge. */
  cls: string
  /** Border/background/text classes for the badge itself. */
  chip: string
}

const GREAT_DELTA = 0.02
const GOOD_DELTA = 0.005
const MEH_DELTA = -0.02

export function pickVerdict(delta: number | null | undefined): PickVerdict {
  if (delta == null) {
    return { word: 'OK', cls: 'text-nexus-muted', chip: 'border-nexus-line text-nexus-muted' }
  }
  if (delta >= GREAT_DELTA) {
    return {
      word: 'GREAT',
      cls: 'text-nexus-lime',
      chip: 'border-nexus-lime/70 bg-nexus-lime/15 text-nexus-lime'
    }
  }
  if (delta >= GOOD_DELTA) {
    return {
      word: 'GOOD',
      cls: 'text-nexus-lime/85',
      chip: 'border-nexus-lime/45 bg-nexus-lime/10 text-nexus-lime/85'
    }
  }
  if (delta > -GOOD_DELTA) {
    return { word: 'FINE', cls: 'text-nexus-text/80', chip: 'border-nexus-line text-nexus-text/80' }
  }
  if (delta > MEH_DELTA) {
    return {
      word: 'MEH',
      cls: 'text-nexus-yellow/90',
      chip: 'border-nexus-yellow/50 bg-nexus-yellow/10 text-nexus-yellow/90'
    }
  }
  return {
    word: 'RISKY',
    cls: 'text-nexus-red/85',
    chip: 'border-nexus-red/60 bg-nexus-red/10 text-nexus-red/85'
  }
}
