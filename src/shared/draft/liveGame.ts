import type { DraftRole } from './types'

/**
 * Riot's Live Client Data API (https://127.0.0.1:2999/liveclientdata/allgamedata) as a small,
 * bounded snapshot. The API only exposes what the player can already see in game (the Tab
 * scoreboard), which is what keeps in-game build help inside Riot's third-party rules.
 *
 * Deliberately drops summoner names / Riot IDs: the overlay only needs champions and items.
 */

export type LiveGameTeam = 'ORDER' | 'CHAOS'

export type LiveGameItem = {
  itemId: number
  name: string
  count: number
  slot: number
}

export type LiveGamePlayer = {
  /** DDragon champion key ("MonkeyKing"), from `rawChampionName`. */
  championKey: string | null
  championName: string
  /** Resolved in the renderer from Data Dragon; the main process leaves it null. */
  championId: number | null
  team: LiveGameTeam
  role: DraftRole
  level: number
  kills: number
  deaths: number
  assists: number
  creepScore: number
  wardScore: number
  items: LiveGameItem[]
  isActive: boolean
  isBot: boolean
  isDead: boolean
  respawnTimer: number
  keystone: string | null
  summonerSpells: string[]
}

export type LiveGameActiveStats = {
  armor: number
  magicResist: number
  attackDamage: number
  abilityPower: number
  maxHealth: number
}

export type LiveGameSnapshot = {
  gameTime: number
  gameMode: string
  mapNumber: number | null
  /** False when spectating (no active player). */
  hasActivePlayer: boolean
  activeTeam: LiveGameTeam | null
  activeGold: number | null
  activeLevel: number | null
  activeStats: LiveGameActiveStats | null
  players: LiveGamePlayer[]
}

export type LiveGameState = 'no-game' | 'loading' | 'in-game' | 'error'

export type LiveGameStatus = {
  state: LiveGameState
  snapshot: LiveGameSnapshot | null
  error: string | null
  checkedAt: string
}

const MAX_PLAYERS = 12
const MAX_ITEMS = 8
const RAW_CHAMPION_PREFIX = 'game_character_displayname_'

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

function num(raw: unknown, fallback = 0, max = 1e7): number {
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : Number.NaN
  return Number.isFinite(value) ? Math.max(-max, Math.min(max, value)) : fallback
}

function text(raw: unknown, max = 64): string {
  return typeof raw === 'string' ? raw.slice(0, max) : ''
}

export function liveGamePositionToRole(position: unknown): DraftRole {
  switch (String(position ?? '').toUpperCase()) {
    case 'TOP':
      return 'top'
    case 'JUNGLE':
      return 'jungle'
    case 'MIDDLE':
    case 'MID':
      return 'middle'
    case 'BOTTOM':
    case 'BOT':
    case 'ADC':
      return 'bottom'
    case 'UTILITY':
    case 'SUPPORT':
      return 'support'
    default:
      return 'unknown'
  }
}

/** "game_character_displayname_MonkeyKing" -> "MonkeyKing" */
export function championKeyFromRawName(raw: unknown): string | null {
  const value = text(raw, 96)
  if (!value.startsWith(RAW_CHAMPION_PREFIX)) {
    return null
  }
  const key = value.slice(RAW_CHAMPION_PREFIX.length).replace(/[^A-Za-z0-9]/g, '')
  return key || null
}

function parseItems(raw: unknown): LiveGameItem[] {
  if (!Array.isArray(raw)) {
    return []
  }
  const out: LiveGameItem[] = []
  for (const row of raw.slice(0, MAX_ITEMS)) {
    if (!isRecord(row)) {
      continue
    }
    const itemId = Math.trunc(num(row.itemID, 0))
    if (itemId <= 0) {
      continue
    }
    out.push({
      itemId,
      name: text(row.displayName, 64),
      count: Math.max(1, Math.trunc(num(row.count, 1, 99))),
      slot: Math.trunc(num(row.slot, out.length, 10))
    })
  }
  return out.sort((a, b) => a.slot - b.slot)
}

function identityKeys(row: Record<string, unknown>): string[] {
  return [row.riotId, row.summonerName, row.riotIdGameName]
    .map((value) => text(value, 96).trim().toLowerCase())
    .filter(Boolean)
}

function activeIdentity(active: Record<string, unknown>): string[] {
  const keys = identityKeys(active)
  const gameName = text(active.riotIdGameName, 96)
  const tag = text(active.riotIdTagLine, 16)
  if (gameName && tag) {
    keys.push(`${gameName}#${tag}`.toLowerCase())
  }
  return keys
}

function parseActiveStats(raw: unknown): LiveGameActiveStats | null {
  if (!isRecord(raw)) {
    return null
  }
  return {
    armor: num(raw.armor),
    magicResist: num(raw.magicResist),
    attackDamage: num(raw.attackDamage),
    abilityPower: num(raw.abilityPower),
    maxHealth: num(raw.maxHealth)
  }
}

function spellName(raw: unknown): string {
  return isRecord(raw) ? text(raw.displayName, 32) : ''
}

/**
 * Parse `/liveclientdata/allgamedata`. Returns null when the payload is not a game yet
 * (the endpoint answers during loading with partial data).
 */
export function parseLiveClientAllGameData(raw: unknown): LiveGameSnapshot | null {
  if (!isRecord(raw)) {
    return null
  }
  const players = Array.isArray(raw.allPlayers) ? raw.allPlayers : []
  if (players.length === 0) {
    return null
  }
  const active = isRecord(raw.activePlayer) && !('error' in raw.activePlayer) ? raw.activePlayer : null
  const activeKeys = active ? new Set(activeIdentity(active)) : new Set<string>()
  const gameData = isRecord(raw.gameData) ? raw.gameData : {}

  const parsed: LiveGamePlayer[] = []
  for (const row of players.slice(0, MAX_PLAYERS)) {
    if (!isRecord(row)) {
      continue
    }
    const team = row.team === 'CHAOS' ? 'CHAOS' : row.team === 'ORDER' ? 'ORDER' : null
    if (!team) {
      continue
    }
    const scores = isRecord(row.scores) ? row.scores : {}
    const runes = isRecord(row.runes) ? row.runes : {}
    const keystone = isRecord(runes.keystone) ? text(runes.keystone.displayName, 40) || null : null
    const spells = isRecord(row.summonerSpells) ? row.summonerSpells : {}
    parsed.push({
      championKey: championKeyFromRawName(row.rawChampionName),
      championName: text(row.championName, 40) || 'Unknown',
      championId: null,
      team,
      role: liveGamePositionToRole(row.position),
      level: Math.trunc(num(row.level, 1, 30)),
      kills: Math.trunc(num(scores.kills, 0, 999)),
      deaths: Math.trunc(num(scores.deaths, 0, 999)),
      assists: Math.trunc(num(scores.assists, 0, 999)),
      creepScore: Math.trunc(num(scores.creepScore, 0, 9999)),
      wardScore: Math.round(num(scores.wardScore, 0, 9999) * 10) / 10,
      items: parseItems(row.items),
      isActive: activeKeys.size > 0 && identityKeys(row).some((key) => activeKeys.has(key)),
      isBot: row.isBot === true,
      isDead: row.isDead === true,
      respawnTimer: Math.max(0, Math.round(num(row.respawnTimer, 0, 999))),
      keystone,
      summonerSpells: [spellName(spells.summonerSpellOne), spellName(spells.summonerSpellTwo)].filter(Boolean)
    })
  }
  if (parsed.length === 0) {
    return null
  }
  const me = parsed.find((p) => p.isActive) ?? null
  return {
    gameTime: Math.max(0, Math.round(num(gameData.gameTime, 0, 1e6))),
    gameMode: text(gameData.gameMode, 32) || 'UNKNOWN',
    mapNumber: Number.isFinite(Number(gameData.mapNumber)) ? Number(gameData.mapNumber) : null,
    hasActivePlayer: me != null,
    activeTeam: me?.team ?? null,
    activeGold: active ? Math.max(0, Math.floor(num(active.currentGold, 0))) : null,
    activeLevel: active ? Math.trunc(num(active.level, me?.level ?? 1, 30)) : null,
    activeStats: active ? parseActiveStats(active.championStats) : null,
    players: parsed
  }
}

/** Renderer-side guard for the IPC payload. */
export function isLiveGameStatus(raw: unknown): raw is LiveGameStatus {
  if (!isRecord(raw)) {
    return false
  }
  if (!['no-game', 'loading', 'in-game', 'error'].includes(String(raw.state))) {
    return false
  }
  if (raw.snapshot != null) {
    const snap = raw.snapshot
    if (!isRecord(snap) || !Array.isArray(snap.players) || snap.players.length > MAX_PLAYERS) {
      return false
    }
    for (const p of snap.players) {
      if (!isRecord(p) || (p.team !== 'ORDER' && p.team !== 'CHAOS') || !Array.isArray(p.items) || p.items.length > MAX_ITEMS) {
        return false
      }
    }
  }
  return typeof raw.checkedAt === 'string'
}

/** Stable fingerprint so the main process only broadcasts real changes. */
export function liveGameStatusSignature(status: LiveGameStatus): string {
  const snap = status.snapshot
  if (!snap) {
    return `${status.state}|${status.error ?? ''}`
  }
  const players = snap.players
    .map((p) => `${p.championKey}:${p.level}:${p.kills}/${p.deaths}/${p.assists}:${p.items.map((i) => `${i.itemId}x${i.count}`).join(',')}:${p.isDead ? 1 : 0}`)
    .join(';')
  // Gold moves every second; bucket it so idle farming does not spam IPC.
  return `${status.state}|${Math.floor(snap.gameTime / 5)}|${Math.floor((snap.activeGold ?? 0) / 25)}|${players}`
}

export function formatGameClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
