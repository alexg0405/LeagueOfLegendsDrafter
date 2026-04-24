/**
 * Turn raw win/loss counts into a score suitable for pick ranking
 * (Beta / empirical-Bayes style shrinkage toward 50% or a role prior).
 */
export function shrunkWinRate(
  wins: number,
  losses: number,
  options?: { k?: number; prior?: number }
): number {
  const k = options?.k ?? 20
  const prior = options?.prior ?? 0.5
  const n = wins + losses
  if (n === 0) {
    return prior
  }
  return (wins + k * prior) / (n + k)
}

/** Map shrunk rate to a bounded matchup bonus e.g. for adding to a linear pick score. */
export function winRateToBonus(p: number, scale = 4): number {
  return (p - 0.5) * scale
}
