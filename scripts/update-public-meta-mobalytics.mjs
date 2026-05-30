import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const metaPath = resolve(repoRoot, 'src/shared/data/publicMetaStatsSeed.json')
const synergyPath = resolve(repoRoot, 'src/shared/data/publicSynergyStatsSeed.json')
const championIndexPath = resolve(repoRoot, 'src/shared/data/championSearchIndex.json')
const publicDataDir = resolve(repoRoot, 'src/renderer/public/data')
const publicMetaPath = resolve(publicDataDir, 'publicMetaStatsSeed.json')
const publicSynergyPath = resolve(publicDataDir, 'publicSynergyStatsSeed.json')
const publicManifestPath = resolve(publicDataDir, 'meta-manifest.json')

const ROLE_TO_MOBALYTICS = {
  top: 'top',
  jungle: 'jungle',
  middle: 'mid',
  bottom: 'adc',
  support: 'support'
}

const MOBALYTICS_TO_ROLE = {
  Top: 'top',
  Jungle: 'jungle',
  Mid: 'middle',
  Bot: 'bottom',
  Support: 'support'
}

const SOURCE_PREFIX = 'mobalytics-emerald-plus'
const MATCHUP_GAMES_FALLBACK = 1200
const MIN_GAMES = 1000
const FETCH_DELAY_MS = 125
const DDRAGON_VERSIONS_URL = 'https://ddragon.leagueoflegends.com/api/versions.json'

const SLUG_OVERRIDES = {
  'Cho\'Gath': 'chogath',
  'Dr. Mundo': 'drmundo',
  'Jarvan IV': 'jarvaniv',
  'K\'Sante': 'ksante',
  'Kha\'Zix': 'khazix',
  'Kai\'Sa': 'kaisa',
  'Kog\'Maw': 'kogmaw',
  'LeBlanc': 'leblanc',
  'Master Yi': 'masteryi',
  'Miss Fortune': 'missfortune',
  'Nunu & Willump': 'nunu',
  'Rek\'Sai': 'reksai',
  'Renata Glasc': 'renata',
  'Tahm Kench': 'tahmkench',
  'Twisted Fate': 'twistedfate',
  'Vel\'Koz': 'velkoz',
  'Wukong': 'monkeyking',
  'Xin Zhao': 'xinzhao'
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

function patchParts(label) {
  return String(label)
    .split('.')
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0))
}

function comparePatchLabels(a, b) {
  const aa = patchParts(a)
  const bb = patchParts(b)
  const len = Math.max(aa.length, bb.length)
  for (let i = 0; i < len; i += 1) {
    const d = (aa[i] ?? 0) - (bb[i] ?? 0)
    if (d !== 0) {
      return d
    }
  }
  return String(a).localeCompare(String(b))
}

function shortPatchLabel(version) {
  const [major, minor] = String(version).split('.')
  return major && minor ? `${major}.${minor}` : String(version)
}

async function fetchCurrentDDragonPatch() {
  const response = await fetch(DDRAGON_VERSIONS_URL, {
    headers: {
      'user-agent': 'Mozilla/5.0 NexusDraftMetaUpdater/2.0'
    }
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

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms))
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function championSlug(name) {
  return (
    SLUG_OVERRIDES[name] ??
    name
      .toLowerCase()
      .replace(/&/g, '')
      .replace(/[^a-z0-9]/g, '')
  )
}

function rateToDecimal(value) {
  return Math.round((Number(value) / 100) * 10000) / 10000
}

function parseIntWithSpaces(value) {
  return Number.parseInt(String(value).replace(/\s+/g, ''), 10)
}

function buildUrl(name, role) {
  return `https://mobalytics.gg/lol/champions/${championSlug(name)}/build/${ROLE_TO_MOBALYTICS[role]}`
}

function section(text, start, end) {
  const startIdx = text.indexOf(start)
  if (startIdx < 0) {
    return ''
  }
  const from = startIdx + start.length
  const endIdx = end ? text.indexOf(end, from) : -1
  return text.slice(from, endIdx >= 0 ? endIdx : undefined)
}

function parseChampionRates(segment, championsByName) {
  const rows = []
  for (const champion of championsByName.values()) {
    const re = new RegExp(`${escapeRegExp(champion.name)}\\s+([0-9]+(?:\\.[0-9]+)?)%\\s+Win Rate`, 'i')
    const match = re.exec(segment)
    if (!match) {
      continue
    }
    rows.push({ championId: champion.id, winRate: rateToDecimal(match[1]) })
  }
  rows.sort((a, b) => b.winRate - a.winRate)
  return rows
}

function parseBuildPage(html, expectedRole, champion, championsByName) {
  const text = htmlToText(html)
  const header = new RegExp(
    `${escapeRegExp(champion.name)}\\s*·\\s*(Top|Jungle|Mid|Bot|Support)\\s+Build[\\s\\S]*?Win rate\\s+([0-9]+(?:\\.[0-9]+)?)%[\\s\\S]*?Pick rate\\s+([0-9]+(?:\\.[0-9]+)?)%[\\s\\S]*?Ban rate\\s+([0-9]+(?:\\.[0-9]+)?)%[\\s\\S]*?Matches\\s+([0-9\\s]+)-[\\s\\S]*?patch\\s+([0-9.]+)`,
    'i'
  ).exec(text)
  if (!header) {
    return null
  }

  const role = MOBALYTICS_TO_ROLE[header[1]]
  if (role !== expectedRole) {
    return null
  }

  const games = parseIntWithSpaces(header[5])
  if (!Number.isFinite(games) || games < MIN_GAMES) {
    return null
  }

  const overview = section(text, `${champion.name} Matchups Overview`, `${champion.name} General information`)
  const weak = parseChampionRates(section(overview, 'Weak Against', 'Strong Against'), championsByName)
  const strong = parseChampionRates(section(overview, 'Strong Against', 'Best Synergy (DUO)'), championsByName)
  const synergy = parseChampionRates(section(overview, 'Best Synergy (DUO)', ''), championsByName)

  return {
    role,
    patch: header[6],
    base: {
      role,
      championId: champion.id,
      winRate: rateToDecimal(header[2]),
      pickRate: rateToDecimal(header[3]),
      banRate: rateToDecimal(header[4]),
      games,
      sourceAvgWinRate: 0.5,
      source: `${SOURCE_PREFIX}-${header[6]}`,
      candidate: true
    },
    counters: [
      ...weak.map((row) => ({ enemyId: row.championId, winRate: row.winRate })),
      ...strong.map((row) => ({ enemyId: row.championId, winRate: row.winRate }))
    ].map((row) => ({
      role,
      candidateId: champion.id,
      enemyId: row.enemyId,
      winRate: row.winRate,
      games: Math.min(games, MATCHUP_GAMES_FALLBACK),
      source: `${SOURCE_PREFIX}-${header[6]}`
    })),
    synergy: synergy.map((row) => ({
      championId: champion.id,
      allyId: row.championId,
      winRate: row.winRate,
      source: `${SOURCE_PREFIX}-${header[6]}`
    }))
  }
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
      rankFilter: 'emerald_plus',
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
const championIndex = JSON.parse(await readFile(championIndexPath, 'utf8'))
const champions = championIndex.champions
const championsById = new Map(champions.map((champion) => [champion.id, champion]))
const championsByName = new Map(champions.map((champion) => [champion.name, champion]))

const rolePairs = current.roleBase
  .map((row) => ({ role: row.role, championId: row.championId, candidate: row.candidate !== false }))
  .filter((row, idx, arr) => arr.findIndex((other) => other.role === row.role && other.championId === row.championId) === idx)

const fetched = []
const failed = []
for (const pair of rolePairs) {
  const champion = championsById.get(pair.championId)
  if (!champion) {
    continue
  }
  const url = buildUrl(champion.name, pair.role)
  try {
    const response = await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 NexusDraftMetaUpdater/2.0'
      }
    })
    if (!response.ok) {
      failed.push(`${champion.name}/${pair.role}: ${response.status}`)
      continue
    }
    const parsed = parseBuildPage(await response.text(), pair.role, champion, championsByName)
    if (!parsed) {
      failed.push(`${champion.name}/${pair.role}: parse`)
      continue
    }
    parsed.base.candidate = pair.candidate
    fetched.push(parsed)
  } catch (error) {
    failed.push(`${champion.name}/${pair.role}: ${error instanceof Error ? error.message : String(error)}`)
  }
  await sleep(FETCH_DELAY_MS)
}

const patches = Array.from(new Set(fetched.map((row) => row.patch))).sort(comparePatchLabels)
if (!patches.includes(targetPatch)) {
  throw new Error(`Expected Mobalytics data for current patch ${targetPatch}, saw: ${patches.join(', ')}`)
}

const staleFetched = fetched.filter((row) => row.patch !== targetPatch)
const currentFetched = fetched.filter((row) => row.patch === targetPatch)
if (currentFetched.length === 0) {
  throw new Error(`No Mobalytics rows parsed for current patch ${targetPatch}.`)
}

const roleBase = currentFetched
  .map((row) => row.base)
  .sort((a, b) => Object.keys(ROLE_TO_MOBALYTICS).indexOf(a.role) - Object.keys(ROLE_TO_MOBALYTICS).indexOf(b.role) || a.championId - b.championId)

const counters = currentFetched
  .flatMap((row) => row.counters)
  .filter((row) => row.candidateId !== row.enemyId)
  .sort((a, b) => Object.keys(ROLE_TO_MOBALYTICS).indexOf(a.role) - Object.keys(ROLE_TO_MOBALYTICS).indexOf(b.role) || a.candidateId - b.candidateId || a.enemyId - b.enemyId)

const synergyRows = currentFetched
  .flatMap((row) => row.synergy)
  .filter((row) => row.championId !== row.allyId)
  .sort((a, b) => a.championId - b.championId || a.allyId - b.allyId)

const updatedAt = todayIsoDate()
const nextMetaSeed = formatMetaSeed({
    schema: current.schema,
    patch: targetPatch,
    rankFilter: 'emerald_plus',
    updatedAt,
    notes:
      'Current-patch public meta seed. roleBase, counters, and matchup overview rows use Mobalytics Emerald+ public champion build pages; sourceAvgWinRate is 50% because Mobalytics exposes champion rates without a global source average.',
    roleBase,
    counters
  })

const nextSynergySeed = formatSynergySeed({
    schema: 'nexus_public_synergy_seed_v1',
    patch: targetPatch,
    rankFilter: 'emerald_plus',
    updatedAt,
    notes:
      'Mobalytics Emerald+ Best Synergy (DUO) rows scraped from public champion build pages; win rates are exposed without per-pair sample counts.',
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

console.log(
  `Fetched ${roleBase.length} role rows, ${counters.length} matchup rows, ${synergyRows.length} synergy rows for patch ${targetPatch}.`
)
if (staleFetched.length > 0) {
  const stalePatches = Array.from(new Set(staleFetched.map((row) => row.patch))).sort(comparePatchLabels)
  console.warn(`Skipped ${staleFetched.length} stale role page(s) from patch ${stalePatches.join(', ')}.`)
}
if (failed.length > 0) {
  console.warn(`Skipped ${failed.length} role pages:`)
  for (const line of failed.slice(0, 30)) {
    console.warn(`  ${line}`)
  }
  if (failed.length > 30) {
    console.warn(`  ... ${failed.length - 30} more`)
  }
}
