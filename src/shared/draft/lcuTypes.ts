import type { DraftSnapshot } from './types'

export type LcuChampSelectResult = {
  lockfileFound: boolean
  lcuReachable: boolean
  snapshot: DraftSnapshot | null
  error: string | null
}
