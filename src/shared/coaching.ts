/** Re-export draft types for legacy import paths (`@shared/coaching`). Prefer `@shared/draft`. */
export type { DraftUpdate, DraftSnapshot, PickSuggestion, DraftSource, DraftRole } from './draft/types'
import { isDraftUpdate } from './draft/validate'
export { isDraftUpdate }
export const isCoachingUpdate = isDraftUpdate
