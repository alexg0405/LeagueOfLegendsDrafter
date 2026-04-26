import searchIndex from '../data/championSearchIndex.json'
import type { DraftUpdate } from './types'

type SearchRow = { id: number; name: string; key?: string; tags: string[]; partype: string }

const STATIC_BY_ID: Map<number, SearchRow> = (() => {
  const m = new Map<number, SearchRow>()
  for (const c of searchIndex.champions) {
    m.set(c.id, { id: c.id, name: c.name, tags: [], partype: 'None' })
  }
  return m
})()

/**
 * Full roster for overlay lookup (id + name), merged with live DDragon tags when available.
 * Never rely on a partial `BUNDLED` map: search would miss most champions if IPC DDragon is absent.
 */
export function buildOverlayChampionSearchPool(fromDraft: DraftUpdate['championsSearch']): SearchRow[] {
  const m = new Map(STATIC_BY_ID)
  if (fromDraft && fromDraft.length > 0) {
    for (const c of fromDraft) {
      m.set(c.id, {
        id: c.id,
        name: c.name,
        key: c.key,
        tags: c.tags ?? [],
        partype: c.partype ?? 'None'
      })
    }
  }
  return Array.from(m.values()).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

export function nameMatchesChampionQuery(championName: string, queryRaw: string): boolean {
  const q = queryRaw.trim()
  if (!q) {
    return false
  }
  const lower = championName.toLowerCase()
  const qLower = q.toLowerCase()
  if (lower.includes(qLower) || String(championName) === q) {
    return true
  }
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const nq = norm(q)
  if (nq.length === 0) {
    return false
  }
  return norm(championName).includes(nq)
}
