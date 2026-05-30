import { resolveChampionName } from './championNameFallback'
import type { DraftRole, DraftSnapshot, SlotPick } from './types'

const ROLES: DraftRole[] = ['top', 'jungle', 'middle', 'bottom', 'support', 'unknown']

function normRole(s: string): DraftRole {
  const x = s.toLowerCase().trim()
  if (ROLES.includes(x as DraftRole)) {
    return x as DraftRole
  }
  if (x === 'mid') {
    return 'middle'
  }
  if (x === 'adc' || x === 'bot') {
    return 'bottom'
  }
  if (x === 'utility' || x === 'sup' || x === 'support') {
    return 'support'
  }
  if (x === 'jg' || x === 'jgl') {
    return 'jungle'
  }
  return 'unknown'
}

function extractJsonObject(text: string): string {
  const t = text.trim()
  const code = t.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const start = code.indexOf('{')
  const end = code.lastIndexOf('}')
  if (start < 0 || end <= start) {
    return code
  }
  return code.slice(start, end + 1)
}

function toSlot(
  row: unknown,
  nameToId: ReadonlyMap<string, number>
): SlotPick {
  if (row == null || typeof row !== 'object') {
    return { role: 'unknown', championId: null, championName: null, cellId: null }
  }
  const o = row as Record<string, unknown>
  const r = typeof o['role'] === 'string' ? normRole(o['role']) : 'unknown'
  const rawName = typeof o['championName'] === 'string' ? o['championName'].trim() : ''
  if (!rawName) {
    return { role: r, championId: null, championName: null, cellId: null }
  }
  const genericId = /^(?:champion\s*)?(\d+)$/i.exec(rawName)?.[1]
  if (genericId) {
    const id = Number(genericId)
    if (Number.isInteger(id) && id > 0) {
      return {
        role: r,
        championId: id,
        championName: resolveChampionName(id, null),
        cellId: null
      }
    }
  }
  const id = nameToId.get(rawName.toLowerCase().replace(/'/g, '')) ?? null
  return {
    role: r,
    championId: id,
    championName: id != null ? rawName : rawName,
    cellId: null
  }
}

export function parseDraftVisionResponse(
  raw: string,
  nameToId: ReadonlyMap<string, number>
): { snapshot: DraftSnapshot; confidence: string } | null {
  let j: unknown
  try {
    j = JSON.parse(extractJsonObject(raw)) as unknown
  } catch {
    return null
  }
  if (j == null || typeof j !== 'object') {
    return null
  }
  const o = j as Record<string, unknown>
  const a = o['allyPicks']
  const e = o['enemyPicks']
  if (!Array.isArray(a) || !Array.isArray(e)) {
    return null
  }
  const ally: SlotPick[] = a.map((x) => toSlot(x, nameToId)).slice(0, 5)
  const enemy: SlotPick[] = e.map((x) => toSlot(x, nameToId)).slice(0, 5)
  const myRole = typeof o['myRole'] === 'string' ? normRole(o['myRole']) : 'unknown'
  const conf = typeof o['confidence'] === 'string' ? o['confidence'] : 'low'
  const snapshot: DraftSnapshot = {
    ally,
    enemy,
    myTeam: null,
    myRole: myRole === 'unknown' ? null : myRole,
    localPlayerCellId: null,
    bans: null,
    myPickOrder: null
  }
  return { snapshot, confidence: conf }
}
