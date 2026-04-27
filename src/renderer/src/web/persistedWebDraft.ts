import type { DraftDeltaListMode, DraftRole } from '@shared/draft'

const KEY = 'nexusdraft.web.draft.v1'

export type ManualBoardPersist = {
  ally: Record<Exclude<DraftRole, 'unknown'>, number | null>
  enemy: Record<Exclude<DraftRole, 'unknown'>, number | null>
}

export type ManualInputBoardPersist = {
  ally: Record<Exclude<DraftRole, 'unknown'>, string>
  enemy: Record<Exclude<DraftRole, 'unknown'>, string>
}

type PersistedV1 = {
  v: 1
  board: ManualBoardPersist
  championInputs: ManualInputBoardPersist
  role: Exclude<DraftRole, 'unknown'>
  rollouts: number
  deltaMode: DraftDeltaListMode
}

function safeJsonParse(s: string): unknown {
  try {
    return JSON.parse(s) as unknown
  } catch {
    return null
  }
}

function isValidDeltaMode(x: string): x is DraftDeltaListMode {
  return x === 'best' || x === 'worst'
}

function isValidRole(x: string): x is Exclude<DraftRole, 'unknown'> {
  return x === 'top' || x === 'jungle' || x === 'middle' || x === 'bottom' || x === 'support'
}

function validate(v: unknown): PersistedV1 | null {
  if (!v || typeof v !== 'object') {
    return null
  }
  const o = v as Record<string, unknown>
  if (o.v !== 1) {
    return null
  }
  if (!isValidRole(String(o.role))) {
    return null
  }
  if (!isValidDeltaMode(String(o.deltaMode))) {
    return null
  }
  const r = Number(o.rollouts)
  if (!Number.isFinite(r) || r < 0 || r > 200) {
    return null
  }
  if (!o.board || !o.championInputs) {
    return null
  }
  return o as unknown as PersistedV1
}

export function loadPersistedWebDraft(): PersistedV1 | null {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null
  }
  const raw = window.localStorage.getItem(KEY)
  if (!raw) {
    return null
  }
  return validate(safeJsonParse(raw))
}

export function savePersistedWebDraft(p: PersistedV1): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return
  }
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    // Quota or private mode; ignore
  }
}

export function clearPersistedWebDraft(): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return
  }
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}
