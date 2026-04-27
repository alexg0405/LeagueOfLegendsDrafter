import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const seedPath = resolve(repoRoot, 'src/shared/data/publicMetaStatsSeed.json')

const LANES = ['top', 'jungle', 'middle', 'bottom', 'support']
const TIER = 'diamond_plus'
const MIN_FLEX_LANE_PCT = 5
const MIN_FLEX_GAMES = 1000

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
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
  const match = /Average Diamond\+ Win Rate:\s*<!--t=[^>]*-->([\d.]+)/.exec(html)
  if (!match) {
    throw new Error('Could not find Diamond+ average win rate.')
  }
  return Number(match[1])
}

function extractPatch(html) {
  const match = /Patch\s+([0-9.]+)/.exec(html)
  if (!match) {
    throw new Error('Could not find patch label.')
  }
  return match[1]
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

async function fetchLaneRows(lane) {
  const url = `https://lolalytics.com/lol/tierlist/?lane=${lane}&tier=${TIER}&view=grid`
  const response = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 NexusDraftMetaUpdater/1.0'
    }
  })
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`)
  }
  const html = await response.text()
  const qwik = extractQwikState(html)
  const avgWinRate = extractAverageWinRate(html)
  const patch = extractPatch(html)
  const rowMap = findChampionRowMap(qwik.objs)
  const rows = []

  for (const [championId, rowRef] of rowMap) {
    const row = decodeRow(qwik.objs, refValue(qwik.objs, rowRef))
    if (!row) {
      continue
    }
    const role = normalizeLane(row.lane)
    const defaultLane = normalizeLane(row.defaultLane)
    if (role !== lane) {
      continue
    }
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
      defaultLane,
      sourceAvgWinRate: roundRate(avgWinRate),
      source: `lolalytics-diamond-plus-${patch}`
    })
  }

  return { patch, rows }
}

function formatRow(row) {
  return `    { "role": "${row.role}", "championId": ${row.championId}, "winRate": ${row.winRate}, "pickRate": ${row.pickRate}, "banRate": ${row.banRate}, "games": ${row.games}, "sourceAvgWinRate": ${row.sourceAvgWinRate}, "source": "${row.source}" }`
}

function formatSeed(seed) {
  const rowLines = seed.roleBase.map(formatRow)
  const counterLines = seed.counters.map(
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
${rowLines.join(',\n')}
  ],
  "counters": [
${counterLines.join(',\n')}
  ]
}
`
}

const current = JSON.parse(await readFile(seedPath, 'utf8'))
const fetched = []
for (const lane of LANES) {
  fetched.push(await fetchLaneRows(lane))
}

const patches = Array.from(new Set(fetched.map((x) => x.patch)))
if (patches.length !== 1) {
  throw new Error(`Expected one patch across lanes, saw: ${patches.join(', ')}`)
}

const allRows = fetched
  .flatMap((x) => x.rows)

const rowsByChampion = new Map()
for (const row of allRows) {
  const rows = rowsByChampion.get(row.championId) ?? []
  rows.push(row)
  rowsByChampion.set(row.championId, rows)
}

const roleBase = []
for (const rows of rowsByChampion.values()) {
  const primary = rows
    .slice()
    .sort((a, b) => b.lanePct - a.lanePct || b.games - a.games)[0]
  for (const row of rows) {
    const includePrimary = row.role === primary.role
    const includeFlex = row.lanePct >= MIN_FLEX_LANE_PCT && row.games >= MIN_FLEX_GAMES
    if (!includePrimary && !includeFlex) {
      continue
    }
    const { lanePct, defaultLane, ...baseRow } = row
    void lanePct
    void defaultLane
    roleBase.push(baseRow)
  }
}

roleBase.sort((a, b) => LANES.indexOf(a.role) - LANES.indexOf(b.role) || a.championId - b.championId)

const championIds = new Set(roleBase.map((row) => row.championId))
console.log(`Fetched ${roleBase.length} Diamond+ role rows covering ${championIds.size} champions.`)

const next = {
  schema: current.schema,
  patch: patches[0],
  rankFilter: TIER,
  updatedAt: todayIsoDate(),
  notes:
    'Current-patch public meta seed. roleBase rows use Lolalytics Diamond+ role rates normalized by the Diamond+ source average in code; tiny off-role samples are excluded from candidate pools.',
  roleBase,
  counters: []
}

await writeFile(seedPath, formatSeed(next), 'utf8')
