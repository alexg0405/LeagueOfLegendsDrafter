/**
 * Refresh bundled public meta seeds from Lolalytics Emerald+ pages.
 * (Script name kept for workflow compatibility; Mobalytics HTML is Cloudflare-blocked.)
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const metaPath = resolve(repoRoot, 'src/shared/data/publicMetaStatsSeed.json')
const synergyPath = resolve(repoRoot, 'src/shared/data/publicSynergyStatsSeed.json')
const publicDataDir = resolve(repoRoot, 'src/renderer/public/data')
const publicMetaPath = resolve(publicDataDir, 'publicMetaStatsSeed.json')
const publicSynergyPath = resolve(publicDataDir, 'publicSynergyStatsSeed.json')
const publicManifestPath = resolve(publicDataDir, 'meta-manifest.json')

const LANES = ['top', 'jungle', 'middle', 'bottom', 'support']
const TIER = 'emerald_plus'
const SOURCE_PREFIX = 'lolalytics-emerald-plus'
const MIN_FLEX_LANE_PCT = 5
const MIN_FLEX_GAMES = 1000
const MIN_COUNTER_GAMES = 80
const FETCH_DELAY_MS = 110
const DDRAGON_VERSIONS_URL = 'https://ddragon.leagueoflegends.com/api/versions.json'
const USER_AGENT = 'Mozilla/5.0 NexusDraftMetaUpdater/3.0'
const SLUG_OVERRIDES = {
  MonkeyKing: 'wukong'
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

function shortPatchLabel(version) {
  const [major, minor] = String(version).split('.')
  return major && minor ? `${major}.${minor}` : String(version)
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms))
}

function roundRate(n) {
  return Math.round((n / 100) * 10000) / 10000
}

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function refValue(objs, ref) {
  if (typeof ref !== 'string') {
    return ref
  }
  const token = ref.replace(/!$/, '')
  if (!/^[0-9a-z]+$/.test(token)) {
    return ref
  }
  const id = Number.parseInt(token, 36)
  return objs[String(id)]
}

function decodeRow(objs, raw) {
  if (!plainObject(raw)) {
    return null
  }
  const out = {}
  for (const [key, value] of Object.entries(raw)) {
    out[key] = refValue(objs, value)
  }
  return out
}

function extractQwikState(html) {
  const match = /<script type="qwik\/json">([\s\S]*?)<\/script>/.exec(html)
  if (!match) {
    throw new Error('Could not find Qwik state in Lolalytics response.')
  }
  return JSON.parse(match[1])
}

function extractAverageWinRate(html) {
  const match =
    /Average Emerald\+\s*Win Rate:\s*(?:<!--[^>]*-->)?\s*([0-9]+(?:\.[0-9]+)?)/i.exec(html) ||
    /Average Emerald\+\s*Win Rate:\s*([0-9]+(?:\.[0-9]+)?)/i.exec(html)
  if (!match) {
    throw new Error('Could not find Emerald+ average win rate.')
  }
  return Number(match[1])
}

function extractPatch(html) {
  const match = /(?:EMERALD\+\s+)?Patch\s+([0-9.]+)/i.exec(html)
  if (!match) {
    throw new Error('Could not find patch label.')
  }
  return shortPatchLabel(match[1])
}

function findChampionRowMap(objs) {
  let best = null
  for (const value of Object.values(objs)) {
    if (!plainObject(value)) {
      continue
    }
    const entries = Object.entries(value).filter(([key]) => /^\d+$/.test(key))
    if (entries.length < 100) {
      continue
    }
    const hits = entries.filter(([, rowRef]) => {
      const row = refValue(objs, rowRef)
      return plainObject(row) && 'wr' in row && 'games' in row && 'lane' in row
    }).length
    if (!best || hits > best.hits) {
      best = { hits, entries }
    }
  }
  if (!best || best.hits < 100) {
    throw new Error('Could not find champion stat row map.')
  }
  return best.entries
}

function normalizeLane(value) {
  if (value === 'mid') return 'middle'
  if (value === 'adc' || value === 'bot') return 'bottom'
  if (value === 'sup' || value === 'utility') return 'support'
  return value
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent': USER_AGENT,
      accept: 'text/html,application/xhtml+xml'
    }
  })
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`)
  }
  return response.text()
}

async function fetchCurrentDDragonPatch() {
  const response = await fetch(DDRAGON_VERSIONS_URL, {
    headers: { 'user-agent': USER_AGENT }
  })
  if (!response.ok) {
    throw new Error(`Failed to fetch Data Dragon versions: ${response.status}`)
  }
  const versions = await response.json()
  if (!Array.isArray(versions) || typeof versions[0] !== 'string') {
    throw new Error('Invalid Data Dragon versions response.')
  }
  return shortPatchLabel(versions[0])
}

async function fetchDDragonChampions(fullVersion) {
  const response = await fetch(`https://ddragon.leagueoflegends.com/cdn/${fullVersion}/data/en_US/champion.json`, {
    headers: { 'user-agent': USER_AGENT }
  })
  if (!response.ok) {
    throw new Error(`Failed to fetch Data Dragon champions: ${response.status}`)
  }
  const json = await response.json()
  const byId = new Map()
  for (const champion of Object.values(json.data ?? {})) {
    const id = Number(champion.key)
    if (!Number.isFinite(id)) continue
    byId.set(id, {
      id,
      name: String(champion.name ?? ''),
      slug: SLUG_OVERRIDES[String(champion.id)] ?? String(champion.id ?? '').toLowerCase()
    })
  }
  return byId
}

async function fetchLaneRows(lane) {
  const url = `https://lolalytics.com/lol/tierlist/?lane=${lane}&tier=${TIER}&view=grid`
  const html = await fetchHtml(url)
  const qwik = extractQwikState(html)
  const avgWinRate = extractAverageWinRate(html)
  const patch = extractPatch(html)
  const rowMap = findChampionRowMap(qwik.objs)
  const rows = []

  for (const [championId, rowRef] of rowMap) {
    const row = decodeRow(qwik.objs, refValue(qwik.objs, rowRef))
    if (!row) continue
    const role = normalizeLane(row.lane)
    if (role !== lane) continue
    const games = Number(row.games)
    const lanePct = Number(row.pctLane)
    rows.push({
      role: lane,
      championId: Number(championId),
      winRate: roundRate(Number(row.wr)),
      pickRate: roundRate(Number(row.pr)),
      banRate: roundRate(Number(row.br)),
      games,
      lanePct,
      sourceAvgWinRate: roundRate(avgWinRate),
      source: `${SOURCE_PREFIX}-${patch}`
    })
  }

  return { patch, avgWinRate, rows }
}

function extractCounterRows(html, role, candidateId, patch) {
  const qwik = extractQwikState(html)
  const pagePatch = extractPatch(html)
  if (pagePatch !== patch) {
    return { patch: pagePatch, rows: [] }
  }
  const rows = []
  for (const value of Object.values(qwik.objs)) {
    if (!plainObject(value) || !('vsWr' in value && 'cid' in value && 'n' in value)) {
      continue
    }
    const row = decodeRow(qwik.objs, value)
    if (!row) continue
    const enemyId = Number(row.cid)
    const games = Number(row.n)
    const vsWr = Number(row.vsWr)
    if (!Number.isFinite(enemyId) || enemyId <= 0 || enemyId === candidateId) continue
    if (!Number.isFinite(games) || games < MIN_COUNTER_GAMES) continue
    if (!Number.isFinite(vsWr) || vsWr <= 0 || vsWr >= 100) continue
    rows.push({
      role,
      candidateId,
      enemyId,
      winRate: roundRate(vsWr),
      games: Math.trunc(games),
      source: `${SOURCE_PREFIX}-${patch}`
    })
  }
  return { patch: pagePatch, rows }
}

function extractSynergyRows(html, championId, patch) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
  // Qwik counters pages expose Good Synergy as vsWr-like objects without a stable duo section in HTML.
  // Prefer structured objects tagged via defaultLane + high vsWr only when we also see a synergy marker nearby — skip noisy HTML.
  void text
  void championId
  void patch
  return []
}

function formatMetaSeed(seed) {
  const roleBase = seed.roleBase.map(
    (row) =>
      `    { "role": "${row.role}", "championId": ${row.championId}, "winRate": ${row.winRate}, "pickRate": ${row.pickRate}, "banRate": ${row.banRate}, "games": ${row.games}, "sourceAvgWinRate": ${row.sourceAvgWinRate}, "source": "${row.source}", "candidate": ${row.candidate} }`
  )
  const counters = seed.counters.map(
    (row) =>
      `    { "role": "${row.role}", "candidateId": ${row.candidateId}, "enemyId": ${row.enemyId}, "winRate": ${row.winRate}, "games": ${row.games}, "source": "${row.source}" }`
  )
  return `{
  "schema": "${seed.schema}",
  "patch": "${seed.patch}",
  "rankFilter": "${seed.rankFilter}",
  "updatedAt": "${seed.updatedAt}",
  "notes": "${seed.notes}",
  "roleBase": [
${roleBase.join(',\n')}
  ],
  "counters": [
${counters.join(',\n')}
  ]
}
`
}

function formatSynergySeed(seed) {
  const rows = seed.rows.map(
    (row) =>
      `    { "championId": ${row.championId}, "allyId": ${row.allyId}, "winRate": ${row.winRate}, "source": "${row.source}" }`
  )
  return `{
  "schema": "${seed.schema}",
  "patch": "${seed.patch}",
  "rankFilter": "${seed.rankFilter}",
  "updatedAt": "${seed.updatedAt}",
  "notes": "${seed.notes}",
  "rows": [
${rows.join(',\n')}
  ]
}
`
}

function formatManifest({ patch, updatedAt, roleBaseCount, counterCount, synergyCount }) {
  return `${JSON.stringify(
    {
      schema: 'nexus_public_meta_manifest_v1',
      patch,
      updatedAt,
      metaUrl: 'publicMetaStatsSeed.json',
      synergyUrl: 'publicSynergyStatsSeed.json',
      rankFilter: TIER,
      roleBaseCount,
      counterCount,
      synergyCount
    },
    null,
    2
  )}\n`
}

const current = JSON.parse(await readFile(metaPath, 'utf8'))
const targetPatch = await fetchCurrentDDragonPatch()
const versionsResponse = await fetch(DDRAGON_VERSIONS_URL, { headers: { 'user-agent': USER_AGENT } })
const versions = await versionsResponse.json()
const championsById = await fetchDDragonChampions(versions[0])

const fetchedLanes = []
for (const lane of LANES) {
  fetchedLanes.push(await fetchLaneRows(lane))
  await sleep(FETCH_DELAY_MS)
}

const lanePatches = Array.from(new Set(fetchedLanes.map((x) => x.patch)))
if (lanePatches.length !== 1) {
  throw new Error(`Expected one patch across Lolalytics lanes, saw: ${lanePatches.join(', ')}`)
}
const lolalyticsPatch = lanePatches[0]
if (lolalyticsPatch !== targetPatch) {
  throw new Error(`Expected Lolalytics data for current patch ${targetPatch}, saw: ${lolalyticsPatch}`)
}

const allRows = fetchedLanes.flatMap((x) => x.rows)
const rowsByChampion = new Map()
for (const row of allRows) {
  const rows = rowsByChampion.get(row.championId) ?? []
  rows.push(row)
  rowsByChampion.set(row.championId, rows)
}

const roleBase = []
for (const rows of rowsByChampion.values()) {
  const primary = rows.slice().sort((a, b) => b.lanePct - a.lanePct || b.games - a.games)[0]
  for (const row of rows) {
    const includePrimary = row.role === primary.role
    const includeFlex = row.lanePct >= MIN_FLEX_LANE_PCT && row.games >= MIN_FLEX_GAMES
    if (!includePrimary && !includeFlex) continue
    const { lanePct, ...baseRow } = row
    void lanePct
    roleBase.push({ ...baseRow, candidate: includePrimary })
  }
}
roleBase.sort((a, b) => LANES.indexOf(a.role) - LANES.indexOf(b.role) || a.championId - b.championId)

const primaryPairs = roleBase.filter((row) => row.candidate)
const counters = []
const synergyRows = []
const failed = []

for (const pair of primaryPairs) {
  const champion = championsById.get(pair.championId)
  if (!champion?.slug) {
    failed.push(`${pair.championId}/${pair.role}: missing slug`)
    continue
  }
  const url = `https://lolalytics.com/lol/${champion.slug}/counters/?lane=${pair.role}&tier=${TIER}`
  try {
    const html = await fetchHtml(url)
    const parsed = extractCounterRows(html, pair.role, pair.championId, targetPatch)
    if (parsed.patch !== targetPatch) {
      failed.push(`${champion.name}/${pair.role}: stale patch ${parsed.patch}`)
    } else if (parsed.rows.length === 0) {
      failed.push(`${champion.name}/${pair.role}: no counters`)
    } else {
      counters.push(...parsed.rows)
    }
    synergyRows.push(...extractSynergyRows(html, pair.championId, targetPatch))
  } catch (error) {
    failed.push(`${champion.name}/${pair.role}: ${error instanceof Error ? error.message : String(error)}`)
  }
  await sleep(FETCH_DELAY_MS)
}

counters.sort(
  (a, b) =>
    LANES.indexOf(a.role) - LANES.indexOf(b.role) ||
    a.candidateId - b.candidateId ||
    a.enemyId - b.enemyId
)

if (roleBase.length < 100) {
  throw new Error(`Too few role rows parsed (${roleBase.length}).`)
}
if (counters.length < 1000) {
  throw new Error(`Too few counter rows parsed (${counters.length}).`)
}

const updatedAt = todayIsoDate()
const nextMetaSeed = formatMetaSeed({
  schema: current.schema,
  patch: targetPatch,
  rankFilter: TIER,
  updatedAt,
  notes:
    'Current-patch public meta seed. roleBase and counters use Lolalytics Emerald+ public tier list and counters pages; sourceAvgWinRate is the Lolalytics Emerald+ average.',
  roleBase,
  counters
})

const nextSynergySeed = formatSynergySeed({
  schema: 'nexus_public_synergy_seed_v1',
  patch: targetPatch,
  rankFilter: TIER,
  updatedAt,
  notes:
    'Duo win-rate rows optional; ally synergy table is primarily generated from Emerald+ role rows plus class/threat heuristics.',
  rows: synergyRows
})

await mkdir(publicDataDir, { recursive: true })
await writeFile(metaPath, nextMetaSeed, 'utf8')
await writeFile(publicMetaPath, nextMetaSeed, 'utf8')
await writeFile(synergyPath, nextSynergySeed, 'utf8')
await writeFile(publicSynergyPath, nextSynergySeed, 'utf8')
await writeFile(
  publicManifestPath,
  formatManifest({
    patch: targetPatch,
    updatedAt,
    roleBaseCount: roleBase.length,
    counterCount: counters.length,
    synergyCount: synergyRows.length
  }),
  'utf8'
)

const covered = new Set(roleBase.map((row) => row.championId))
console.log(
  `Fetched ${roleBase.length} role rows (${covered.size} champions), ${counters.length} matchup rows, ${synergyRows.length} synergy rows for patch ${targetPatch}.`
)
if (failed.length > 0) {
  console.warn(`Skipped ${failed.length} counter pages:`)
  for (const line of failed.slice(0, 30)) {
    console.warn(`  ${line}`)
  }
  if (failed.length > 30) {
    console.warn(`  ... ${failed.length - 30} more`)
  }
}
