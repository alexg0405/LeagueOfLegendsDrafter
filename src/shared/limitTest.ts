/**
 * Simplified effective HP vs a damage type (v1). League uses non-linear damage reduction;
 * this is a coaching estimate, not a combat simulator.
 */
export function effectiveHpVsPhysical(hp: number, armor: number): number {
  if (hp <= 0) {
    return 0
  }
  if (armor >= 0) {
    return hp * (1 + armor / 100)
  }
  return hp * (2 - 100 / (100 - armor))
}

export function effectiveHpVsMagic(hp: number, magicResist: number): number {
  return effectiveHpVsPhysical(hp, magicResist)
}

export type LimitTestLine = {
  label: string
  value: string
  lowConfidence: boolean
}

/**
 * Placeholder for Tab snapshot → burst vs target eff. HP. Wire real stats later.
 */
export function formatLimitTestStub(
  yourLabel: string,
  targetLabel: string
): LimitTestLine[] {
  return [
    { label: 'Context', value: `${yourLabel} → ${targetLabel}`, lowConfidence: true },
    {
      label: 'Note',
      value: 'Limit math uses Data Dragon + Tab snapshot (not implemented yet).',
      lowConfidence: true
    }
  ]
}
