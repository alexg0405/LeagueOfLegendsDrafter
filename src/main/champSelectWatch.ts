import type { LcuChampSelectResult } from '../shared/draft/lcuTypes'

/** One LCU poll, reduced to: in champ select, definitely not, or can't tell. */
export type ChampSelectSignal = 'in' | 'out' | 'unknown'

export function champSelectSignal(result: Pick<LcuChampSelectResult, 'lockfileFound' | 'champSelect'>): ChampSelectSignal {
  if (result.champSelect === true) {
    return 'in'
  }
  // No session (404), or no client at all (closed, or it closed itself for the game).
  if (result.champSelect === false || !result.lockfileFound) {
    return 'out'
  }
  return 'unknown'
}

/**
 * Turns the 400 ms LCU poll into champ select start/end events. "Ended" needs `endAfter` polls
 * in a row that say there is no session, so one failed request never closes the overlay
 * mid-draft. Polls that can't tell either way neither end it nor reset the count.
 */
export class ChampSelectWatch {
  private active = false
  private outStreak = 0

  constructor(private readonly opts: { endAfter: number; onStart: () => void; onEnd: () => void }) {}

  get inChampSelect(): boolean {
    return this.active
  }

  update(signal: ChampSelectSignal): void {
    if (signal === 'in') {
      this.outStreak = 0
      if (!this.active) {
        this.active = true
        this.opts.onStart()
      }
      return
    }
    if (signal === 'unknown' || !this.active) {
      return
    }
    this.outStreak += 1
    if (this.outStreak >= this.opts.endAfter) {
      this.active = false
      this.outStreak = 0
      this.opts.onEnd()
    }
  }
}
