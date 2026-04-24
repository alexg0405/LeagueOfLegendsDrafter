#!/usr/bin/env node
/**
 * Riot public API ETL: ranked solo (queue 420) match-v5 -> lane A vs B win/loss counts.
 *
 * Prereq: Riot development API key from https://developer.riotgames.com/
 * (respect rate limits; long-term: production key for higher throughput.)
 *
 * Usage:
 *   set RIOT_API_KEY=...   (or add to .env in project root)
 *   node scripts/riot-lane-etl.mjs --puuid <PUUID> --platform na1
 *   node scripts/riot-lane-etl.mjs --riot "Summoner#NA1" --platform na1
 *
 * Output: etl-out/lane-matchup-raw.json (gitignored) — feed into your shrinkage + scoring.
 *
 * @see https://developer.riotgames.com/apis#match-v5/GET_getMatchIds
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT_DIR = join(ROOT, 'etl-out')
const OUT_FILE = join(OUT_DIR, 'lane-matchup-raw.json')

/** @type {Record<string, string>} platform host -> regional routing (match v5, account) */
const PLATFORM_TO_REGION = {
  na1: 'americas',
  br1: 'americas',
  la1: 'americas',
  la2: 'americas',
  oce1: 'sea',
  ph2: 'sea',
  sg2: 'sea',
  th2: 'sea',
  tw2: 'sea',
  vn2: 'sea',
  euw1: 'europe',
  eun1: 'europe',
  tr1: 'europe',
  ru: 'europe',
  kr: 'asia',
  jp1: 'asia'
}

const POSITIONS = new Set(['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'])

function loadEnvFile() {
  const p = join(ROOT, '.env')
  if (!existsSync(p)) {
    return
  }
  const raw = readFileSync(p, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) {
      continue
    }
    const eq = t.indexOf('=')
    if (eq < 1) {
      continue
    }
    const k = t.slice(0, eq).trim()
    let v = t.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    if (process.env[k] == null) {
      process.env[k] = v
    }
  }
}

function parseArgs() {
  const a = process.argv.slice(2)
  const o = { platform: 'na1', count: 50, queue: 420, riot: null, puuid: null }
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--puuid') {
      o.puuid = a[++i] ?? null
    } else if (a[i] === '--riot' || a[i] === '-r') {
      o.riot = a[++i] ?? null
    } else if (a[i] === '--platform' || a[i] === '-p') {
      o.platform = (a[++i] ?? 'na1').toLowerCase()
    } else if (a[i] === '--count' || a[i] === '-n') {
      o.count = Number(a[++i] ?? 50)
    } else if (a[i] === '--queue' || a[i] === '-q') {
      o.queue = Number(a[++i] ?? 420)
    } else if (a[i] === '--help' || a[i] === '-h') {
      o.help = true
    }
  }
  return o
}

async function sleep(ms) {
  return new Promise((r) => {
    setTimeout(r, ms)
  })
}

async function riotGet(url, key) {
  const res = await fetch(url, {
    headers: { 'X-Riot-Token': key }
  })
  if (res.status === 429) {
    const ra = res.headers.get('Retry-After')
    const s = ra ? Math.min(60, Math.max(1, parseInt(ra, 10))) : 2
    await sleep(s * 1000)
    return riotGet(url, key)
  }
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`GET ${url} -> ${res.status} ${t.slice(0, 200)}`)
  }
  if (res.status === 204) {
    return null
  }
  return res.json()
}

function normalizePosition(p) {
  if (!p || p === 'NONE' || p === 'Invalid') {
    return null
  }
  const u = String(p).toUpperCase()
  return POSITIONS.has(u) ? u : null
}

/**
 * @param {object} match - match v5 DTO
 * @param {string} [patchFilter] - if set, only process when gameVersion starts with it (e.g. "15.1")
 */
function aggregateMatch(match, patchFilter) {
  if (!match?.info?.participants) {
    return []
  }
  const ver = String(match.info.gameVersion ?? '')
  if (patchFilter && !ver.startsWith(patchFilter)) {
    return []
  }
  const byTeamPos = { 100: new Map(), 200: new Map() }
  for (const part of match.info.participants) {
    const pos = normalizePosition(part.teamPosition ?? part.lane)
    if (!pos) {
      continue
    }
    const tid = part.teamId
    if (tid !== 100 && tid !== 200) {
      continue
    }
    if (!byTeamPos[tid].has(pos)) {
      byTeamPos[tid].set(pos, [])
    }
    byTeamPos[tid].get(pos).push({
      id: part.championId,
      win: part.win
    })
  }
  /** @type {Array<{ pos: string, a: number, b: number, blueWon: boolean }>} */
  const rows = []
  for (const pos of POSITIONS) {
    const b = byTeamPos[100].get(pos)
    const r = byTeamPos[200].get(pos)
    if (!b || !r || b.length !== 1 || r.length !== 1) {
      continue
    }
    const blue = b[0]
    const red = r[0]
    if (blue.id === red.id) {
      continue
    }
    /** blue perspective: blue wins = blueChamp beat redChamp */
    const posKey =
      pos === 'UTILITY' ? 'support' : pos === 'MIDDLE' ? 'middle' : pos.toLowerCase()
    rows.push({
      pos: posKey,
      a: blue.id,
      b: red.id,
      /** did blue side win? */
      blueWon: blue.win
    })
  }
  return rows
}

/**
 * @param {Record<string, Record<string, { w: number, l: number }>>} acc
 * @param {string} keyPos
 * @param {number} a
 * @param {number} b
 * @param {boolean} aWon
 */
function bump(acc, keyPos, a, b, aWon) {
  const sa = String(a)
  const sb = String(b)
  if (!acc[keyPos]) {
    acc[keyPos] = Object.create(null)
  }
  if (!acc[keyPos][sa]) {
    acc[keyPos][sa] = Object.create(null)
  }
  if (!acc[keyPos][sa][sb]) {
    acc[keyPos][sa][sb] = { w: 0, l: 0 }
  }
  if (aWon) {
    acc[keyPos][sa][sb].w += 1
  } else {
    acc[keyPos][sa][sb].l += 1
  }
}

function mergeInto(store, keyPos, a, b, aWon) {
  /** symmetric learning: (a vs b) from a's team perspective */
  bump(store, keyPos, a, b, aWon)
}

async function resolvePuuidFromRiot(riot, region) {
  const hash = riot.indexOf('#')
  if (hash < 0) {
    throw new Error('Use format GameName#TAG e.g. Doublelift#NA1')
  }
  const gameName = riot.slice(0, hash)
  const tagLine = riot.slice(hash + 1)
  const enc = `${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`
  const url = `https://${region}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${enc}`
  const key = process.env['RIOT_API_KEY']
  const j = await riotGet(url, key)
  if (!j?.puuid) {
    throw new Error('No puuid in account response')
  }
  return j.puuid
}

async function main() {
  loadEnvFile()
  const args = parseArgs()
  if (args.help) {
    // eslint-disable-next-line no-console
    console.log(`riot-lane-etl: fetch ranked matches and build lane (A vs B) w/l tables.

  --puuid    Summoner puuid
  --riot     "Name#TAG"  (resolves puuid)
  --platform na1 (default) | euw1 | kr | ...
  --count    match ids to pull (default 50)
  --queue    420 = ranked solo (default)

  Set RIOT_API_KEY in environment or .env
`)
    process.exit(0)
  }

  const key = process.env['RIOT_API_KEY']?.trim()
  if (!key) {
    console.error('Missing RIOT_API_KEY (set env or add to .env).')
    process.exit(1)
  }

  const platform = args.platform
  const region = PLATFORM_TO_REGION[platform]
  if (!region) {
    console.error(`Unknown platform: ${platform}. Add it to PLATFORM_TO_REGION in the script.`)
    process.exit(1)
  }

  let puuid = args.puuid
  if (!puuid && args.riot) {
    puuid = await resolvePuuidFromRiot(args.riot, region)
    // eslint-disable-next-line no-console
    console.log('Resolved puuid (first 8):', puuid.slice(0, 8) + '…')
  }
  if (!puuid) {
    console.error('Provide --puuid or --riot "Name#TAG"')
    process.exit(1)
  }

  const listUrl = `https://${region}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=${args.queue}&start=0&count=${Math.min(100, args.count)}`
  /** @type {string[]} */
  const ids = await riotGet(listUrl, key)
  if (!Array.isArray(ids) || ids.length === 0) {
    console.error('No match ids returned. Try another summoner, queue, or count.')
    process.exit(1)
  }
  // eslint-disable-next-line no-console
  console.log('Match ids:', ids.length)

  /** @type {Record<string, Record<string, Record<string, { w: number, l: number }>>>} */
  const byPos = Object.create(null)
  const patchSeen = new Set()
  let ok = 0
  for (const id of ids) {
    const murl = `https://${region}.api.riotgames.com/lol/match/v5/matches/${id}`
    let match
    try {
      match = await riotGet(murl, key)
    } catch (e) {
      console.error('skip', id, e instanceof Error ? e.message : String(e))
      continue
    }
    if (match?.info?.gameVersion) {
      patchSeen.add(match.info.gameVersion)
    }
    const rows = aggregateMatch(match)
    if (!rows.length) {
      continue
    }
    for (const row of rows) {
      const blueWon = row.blueWon
      mergeInto(byPos, row.pos, row.a, row.b, blueWon)
      mergeInto(byPos, row.pos, row.b, row.a, !blueWon)
    }
    ok += 1
    await sleep(120)
  }

  mkdirSync(OUT_DIR, { recursive: true })
  const out = {
    meta: {
      source: 'riot-match-v5',
      platform,
      region,
      queue: args.queue,
      matchesRequested: ids.length,
      matchesParsed: ok,
      gameVersions: [...patchSeen].sort(),
      generatedAt: new Date().toISOString()
    },
    /** (a vs b) counts from both sides: pair key "a|b" may appear; we store a->b */
    byPosition: byPos
  }
  writeFileSync(OUT_FILE, JSON.stringify(out, null, 2), 'utf8')
  // eslint-disable-next-line no-console
  console.log('Wrote', OUT_FILE, '— use these w/l for Beta priors and shrinkage toward role baseline.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
