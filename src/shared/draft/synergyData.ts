/**
 * Sparse ally synergy (candidate id → ally id → small bonus in [-1, 2]).
 * Community-style; not live Riot stats. Used for fast draft sum term.
 */
export const ALLY_SYNERGY_BONUS: Record<string, Record<string, number>> = {
  /* Engage sup + common partners */
  '111': { '22': 1, '81': 1, '119': 0.5, '51': 0.5 },
  '12': { '81': 0.5, '22': 0.5, '51': 0.5 },
  '53': { '22': 1, '81': 0.5 },
  '201': { '22': 0.5, '51': 1 },
  /* ADC ↔ sup */
  '22': { '111': 1, '12': 0.5, '201': 0.5 },
  '81': { '111': 1, '53': 0.5 },
  /* Jungle mid */
  '64': { '61': 0.5, '103': 0.5, '238': 0.5 },
  '121': { '134': 0.5, '7': 0.5 },
  /* Top jungle */
  '266': { '64': 0.5, '121': 0.5 }
}
