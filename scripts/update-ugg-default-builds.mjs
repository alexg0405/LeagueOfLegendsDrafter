/**
 * Refresh the bundled champion build-path seed from U.GG's public stats JSON.
 *
 * One request per champion returns every role/rank/region, so this stays cheap enough to run
 * daily from CI. We read the WORLD region (`12`) at Emerald+ (`17`) and only widen to Platinum+
 * or all ranks — or the previous patch early in a new patch — when the sample is thin.
 *
 * Output keeps the legacy fields the Rust draft engine reads (`starting`, `boots`, `core`, `final`)
 * and adds the full build path: purchase order, 4th/5th/6th item options with win rates, skill
 * order, summoner spells and runes.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
/** Slim seed bundled with the draft engine and its workers: legacy item fields only. */
const outPath = resolve(repoRoot, 'src/shared/data/uggDefaultItemBuildsSeed.json')
/** Full build paths, code-split and loaded when a Build view opens. */
const fullOutPath = resolve(repoRoot, 'src/shared/data/buildPathsSeed.json')
/** Same full file, served by the website for live refresh of installed apps. */
const publicOutPath = resolve(repoRoot, 'src/renderer/public/data/buildPathsSeed.json')
const ENGINE_FIELDS = ['championId', 'role', 'sourceType', 'sourceUrl', 'winRate', 'matches', 'rolePct', 'starting', 'boots', 'core', 'final']
const publicManifestPath = resolve(repoRoot, 'src/renderer/public/data/meta-manifest.json')

const roles = ['top', 'jungle', 'middle', 'bottom', 'support']
const uggRole = { top: 'top', jungle: 'jungle', middle: 'mid', bottom: 'adc', support: 'support' }
/** U.GG compact overview keys. Verified: emerald_plus(17) = emerald(16) + diamond_plus(11). */
const UGG_ROLE_KEY = { jungle: '1', support: '2', bottom: '3', top: '4', middle: '5' }
const UGG_WORLD_REGION = '12'
const UGG_RANK = { emerald_plus: '17', platinum_plus: '10', overall: '8' }
/** Below this many games a role build is too noisy to trust over a wider sample. */
const MIN_ROLE_SAMPLE = 1000
/** If a champion's best role is this thin on the new patch, also read the previous patch. */
const PREVIOUS_PATCH_THRESHOLD = 2500
const FETCH_CONCURRENCY = 6
const FETCH_DELAY_MS = 60
const USER_AGENT = 'Mozilla/5.0 NexusDraftSeedUpdater/2.0'
const pinnedOverrideKeys = new Set(['50:bottom', '50:jungle', '50:middle', '50:support', '50:top'])

const trustedDefaultRows = [
  { championId: 15, role: 'bottom', starting: [1055], boots: [3006], core: [3508, 6675, 3031], final: [3006, 3508, 6675, 3031, 3036, 3033] },
  { championId: 18, role: 'bottom', starting: [1055], boots: [3006], core: [6676, 3031, 3036], final: [3006, 6676, 3031, 3036, 3033, 3085] },
  { championId: 21, role: 'bottom', starting: [1055], boots: [3006], core: [3508, 3031, 3036], final: [3006, 3508, 3031, 3036, 3033, 6676] },
  { championId: 22, role: 'bottom', starting: [1055], boots: [3006], core: [6672, 3031, 3036], final: [3006, 6672, 3031, 3036, 3085, 3033] },
  { championId: 29, role: 'bottom', starting: [1055], boots: [3006], core: [3153, 3085, 3031], final: [3006, 3153, 3085, 3031, 3033, 3072] },
  { championId: 30, role: 'bottom', starting: [1056], boots: [3020], core: [6653, 3118, 3135], final: [3020, 6653, 3118, 3135, 3089, 3157] },
  { championId: 42, role: 'bottom', starting: [1055], boots: [3006], core: [3078, 3508, 6697], final: [3006, 3078, 3508, 6697, 3036, 3072] },
  { championId: 45, role: 'bottom', starting: [1056], boots: [3020], core: [6655, 4628, 3089], final: [3020, 6655, 4628, 3089, 3135, 3157] },
  { championId: 50, role: 'bottom', starting: [1056], boots: [3158], core: [3118, 6653, 3116], final: [3158, 3118, 6653, 3116, 3157, 4633] },
  { championId: 50, role: 'jungle', starting: [1102], boots: [3158], core: [3118, 2503, 3152], final: [3158, 3118, 2503, 3152, 3157, 3135] },
  { championId: 50, role: 'middle', starting: [1056], boots: [3158], core: [3118, 6653, 3116], final: [3158, 3118, 6653, 3116, 3157, 4633] },
  { championId: 50, role: 'support', starting: [3871], boots: [3158], core: [3118, 3116, 6653], final: [3158, 3118, 3116, 6653, 3157, 3102] },
  { championId: 50, role: 'top', starting: [1056], boots: [3158], core: [3118, 6653, 3116], final: [3158, 3118, 6653, 3116, 3157, 4633] },
  { championId: 51, role: 'bottom', starting: [1055], boots: [3006], core: [6676, 3031, 3036], final: [3006, 6676, 3031, 3036, 3094, 3033] },
  { championId: 63, role: 'bottom', starting: [1056], boots: [3020], core: [6653, 3118, 3135], final: [3020, 6653, 3118, 3135, 3089, 3157] },
  { championId: 67, role: 'bottom', starting: [1055], boots: [3006], core: [3153, 3124, 3302], final: [3006, 3153, 3124, 3302, 3033, 3072] },
  { championId: 69, role: 'bottom', starting: [1056], boots: [], core: [6653, 3116, 3089], final: [6653, 3116, 3089, 3135, 3157, 3102] },
  { championId: 81, role: 'bottom', starting: [1055], boots: [3158], core: [3004, 3078, 3161], final: [3158, 3004, 3078, 3161, 6694, 3036] },
  { championId: 96, role: 'bottom', starting: [1055], boots: [3006], core: [3153, 3124, 3302], final: [3006, 3153, 3124, 3302, 3091, 3036] },
  { championId: 104, role: 'bottom', starting: [1055], boots: [3006], core: [6676, 3031, 3036], final: [3006, 6676, 3031, 3036, 3072, 3033] },
  { championId: 110, role: 'bottom', starting: [1055], boots: [3006], core: [6672, 3124, 3302], final: [3006, 6672, 3124, 3302, 3036, 3139] },
  { championId: 115, role: 'bottom', starting: [1056], boots: [3020], core: [6655, 4628, 3089], final: [3020, 6655, 4628, 3089, 3135, 3157] },
  { championId: 119, role: 'bottom', starting: [1055], boots: [3006], core: [6676, 3031, 3072], final: [3006, 6676, 3031, 3072, 3033, 3156] },
  { championId: 133, role: 'bottom', starting: [1055], boots: [3006], core: [6676, 3031, 3094], final: [3006, 6676, 3031, 3094, 3036, 3033] },
  { championId: 145, role: 'bottom', starting: [1055], boots: [3006], core: [6672, 3124, 3302], final: [3006, 6672, 3124, 3302, 3036, 3085] },
  { championId: 147, role: 'bottom', starting: [1056], boots: [3020], core: [6653, 3116, 3089], final: [3020, 6653, 3116, 3089, 3135, 3157] },
  { championId: 163, role: 'bottom', starting: [1056], boots: [3020], core: [2503, 4628, 3089], final: [3020, 2503, 4628, 3089, 3135, 3157] },
  { championId: 202, role: 'bottom', starting: [1055], boots: [3006], core: [6676, 3031, 3094], final: [3006, 6676, 3031, 3094, 3036, 3072] },
  { championId: 221, role: 'bottom', starting: [1055], boots: [3006], core: [6672, 3031, 3046], final: [3006, 6672, 3031, 3046, 3036, 3033] },
  { championId: 222, role: 'bottom', starting: [1055], boots: [3006], core: [6672, 3031, 3085], final: [3006, 6672, 3031, 3085, 3036, 3033] },
  { championId: 235, role: 'bottom', starting: [1055], boots: [3158], core: [6697, 6694, 3036], final: [3158, 6697, 6694, 3036, 3033, 3072] },
  { championId: 236, role: 'bottom', starting: [1055], boots: [3006], core: [3508, 6676, 3031], final: [3006, 3508, 6676, 3031, 3036, 3072] },
  { championId: 360, role: 'bottom', starting: [1055], boots: [3006], core: [6676, 3031, 3072], final: [3006, 6676, 3031, 3072, 3033, 3036] },
  { championId: 429, role: 'bottom', starting: [1055], boots: [3006], core: [3153, 3124, 3302], final: [3006, 3153, 3124, 3302, 3033, 3139] },
  { championId: 498, role: 'bottom', starting: [1055], boots: [3006], core: [6675, 3031, 3046], final: [3006, 6675, 3031, 3046, 3036, 3072] },
  { championId: 523, role: 'bottom', starting: [1055], boots: [3006], core: [6676, 3031, 3036], final: [3006, 6676, 3031, 3036, 3072, 3033] },
  { championId: 895, role: 'bottom', starting: [1055], boots: [3006], core: [6676, 3031, 3036], final: [3006, 6676, 3031, 3036, 3072, 3033] },
  { championId: 901, role: 'bottom', starting: [1055], boots: [3158], core: [3078, 3161, 3036], final: [3158, 3078, 3161, 3036, 6694, 3072] }
]

const defaultTemplates = {
  assassin: { starting: [1055], boots: [3158], core: [6699, 6697, 6694], final: [3158, 6699, 6697, 6694, 6696, 6698] },
  critMarksman: { starting: [1055], boots: [3006], core: [6676, 3031, 3036], final: [3006, 6676, 3031, 3036, 3094, 3033] },
  enchanterSupport: { starting: [3870], boots: [3158], core: [2065, 6617, 3504], final: [3158, 2065, 6617, 3504, 3222, 3107] },
  fighter: { starting: [1054], boots: [3047], core: [3078, 6610, 3053], final: [3047, 3078, 6610, 3053, 3071, 3161] },
  jungleAssassin: { starting: [1102], boots: [3158], core: [6699, 6697, 6694], final: [3158, 6699, 6697, 6694, 6696, 6698] },
  jungleFighter: { starting: [1102], boots: [3047], core: [3078, 6610, 3071], final: [3047, 3078, 6610, 3071, 3053, 3161] },
  jungleMage: { starting: [1102], boots: [3020], core: [2503, 3152, 3135], final: [3020, 2503, 3152, 3135, 3089, 3157] },
  jungleOnHit: { starting: [1102], boots: [3006], core: [3153, 3124, 3302], final: [3006, 3153, 3124, 3302, 3072, 3036] },
  jungleTank: { starting: [1103], boots: [3047], core: [3068, 6665, 2502], final: [3047, 3068, 6665, 2502, 2504, 3075] },
  mage: { starting: [1056], boots: [3020], core: [6655, 4628, 3089], final: [3020, 6655, 4628, 3089, 3135, 3157] },
  mageBurn: { starting: [1056], boots: [3020], core: [6653, 3118, 3135], final: [3020, 6653, 3118, 3135, 3089, 3157] },
  mageBruiser: { starting: [1056], boots: [3158], core: [4633, 3115, 3157], final: [3158, 4633, 3115, 3157, 3135, 3089] },
  meleeCrit: { starting: [1055], boots: [3006], core: [3032, 3031, 3046], final: [3006, 3032, 3031, 3046, 3036, 3072] },
  marksmanCaster: { starting: [1055], boots: [3158], core: [3004, 3078, 3161], final: [3158, 3004, 3078, 3161, 6694, 3036] },
  meleeOnHit: { starting: [1055], boots: [3006], core: [3153, 3124, 3302], final: [3006, 3153, 3124, 3302, 3072, 3036] },
  onHitMarksman: { starting: [1055], boots: [3006], core: [3153, 3124, 3302], final: [3006, 3153, 3124, 3302, 3091, 3036] },
  supportMage: { starting: [3871], boots: [3020], core: [2065, 6620, 3107], final: [3020, 2065, 6620, 3107, 3222, 6617] },
  supportTank: { starting: [3869], boots: [3047], core: [3190, 3109, 3050], final: [3047, 3190, 3109, 3050, 2502, 3075] },
  tank: { starting: [1054], boots: [3047], core: [3068, 6665, 2502], final: [3047, 3068, 6665, 2502, 2504, 3075] }
}

const onHitCarryNames = new Set(['ashe', 'kaisa', 'kalista', 'kayle', 'kogmaw', 'teemo', 'twitch', 'varus', 'vayne', 'zeri'])
const casterMarksmanNames = new Set(['corki', 'ezreal', 'jayce', 'nilah', 'smolder'])
const meleeCritNames = new Set(['gangplank', 'tryndamere', 'yasuo', 'yone'])
const meleeOnHitNames = new Set(['belveth', 'masteryi'])
const burnMageNames = new Set(['anivia', 'aurelionsol', 'brand', 'cassiopeia', 'karthus', 'lillia', 'malzahar', 'rumble', 'swain', 'taliyah', 'teemo', 'zyra'])
const bruiserMageNames = new Set(['diana', 'gwen', 'mordekaiser', 'rumble', 'singed', 'sylas', 'vladimir'])

function slug(name) {
  return name.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '').trim()
}

function sleep(ms) {
  return new Promise((done) => setTimeout(done, ms))
}

async function json(url, { retries = 2, optional = false } = {}) {
  let lastError = null
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': USER_AGENT, accept: 'application/json' } })
      if (res.status === 404 && optional) return null
      if (!res.ok) throw new Error(`${url} ${res.status}`)
      return await res.json()
    } catch (error) {
      lastError = error
      await sleep(400 * (attempt + 1))
    }
  }
  if (optional) return null
  throw lastError
}

function uggStatsPatch(patch) {
  const [major, minor] = String(patch).split('.')
  return `${major}_${minor}`
}

function shortPatch(patch) {
  const [major, minor] = String(patch).split('.')
  return `${major}.${minor}`
}

function previousPatch(patch) {
  const [major, minor] = String(patch).split('.').map(Number)
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return null
  return minor > 1 ? `${major}.${minor - 1}` : null
}

function unique(values) {
  return Array.from(new Set(values))
}

function compactName(name) {
  return String(name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function hasTag(champion, tag) {
  return (champion.tags ?? []).some((value) => String(value).toLowerCase() === tag)
}

const summonersRiftModeNames = new Set(['classic', 'sr', 'summoners rift', "summoner's rift", 'summoners_rift'])

function canonicalItemName(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/’/g, "'")
    .replace(/[^a-z0-9']+/g, ' ')
    .trim()
}

function hasOnlyNonRiftModes(item) {
  const modes = Array.isArray(item.modes) ? item.modes : Array.isArray(item.requiredModes) ? item.requiredModes : null
  if (!modes?.length) return false
  const normalized = modes.map(canonicalItemName).filter(Boolean)
  return normalized.length > 0 && normalized.every((mode) => !summonersRiftModeNames.has(mode))
}

/** Items a player can actually buy on Summoner's Rift this patch. */
function currentStoreItems(itemJson) {
  const byId = new Map()
  for (const [idText, item] of Object.entries(itemJson.data ?? {})) {
    const id = Number(idText)
    if (
      Number.isFinite(id) &&
      id < 10000 &&
      item.maps?.['11'] === true &&
      item.hideFromAll !== true &&
      item.inStore !== false &&
      item.gold?.purchasable === true &&
      item.requiredAlly == null &&
      item.requiredBuffCurrencyName == null &&
      item.requiredChampion == null &&
      item.specialRecipe == null &&
      !hasOnlyNonRiftModes(item)
    ) {
      byId.set(id, item)
    }
  }
  return byId
}

function isBoots(item) {
  return (item?.tags ?? []).some((tag) => String(tag).toLowerCase() === 'boots')
}

function isConsumable(item) {
  return item?.consumed === true || (item?.tags ?? []).some((tag) => String(tag).toLowerCase() === 'consumable')
}

function itemCost(item) {
  return Number(item?.gold?.total ?? 0)
}

/** Legacy buckets the draft engine reads. Order in `ids` is purchase priority. */
function legacyBuckets(startSet, orderedIds, itemById) {
  const valid = unique(orderedIds).filter((id) => itemById.has(id))
  const starting = unique(startSet)
    .filter((id) => itemById.has(id) && !isConsumable(itemById.get(id)) && itemCost(itemById.get(id)) <= 700)
    .slice(0, 1)
  const boots = valid.filter((id) => isBoots(itemById.get(id))).slice(0, 1)
  const completed = valid
    .filter((id) => !starting.includes(id) && !boots.includes(id) && itemCost(itemById.get(id)) >= 2200)
    .slice(0, 6)
  return {
    starting,
    boots,
    core: completed.slice(0, 3),
    final: unique([...boots, ...completed]).slice(0, 6)
  }
}

function normalizeRowItems(row, itemById) {
  const valid = (ids) => unique(ids ?? []).filter((id) => itemById.has(id))
  const starting = valid(row.starting).slice(0, 1)
  const boots = valid(row.boots).filter((id) => isBoots(itemById.get(id))).slice(0, 1)
  const core = valid(row.core).filter((id) => itemCost(itemById.get(id)) >= 2200).slice(0, 3)
  const final = valid([...boots, ...(row.final ?? []), ...core]).filter((id) => itemCost(itemById.get(id)) >= 900).slice(0, 6)
  return { ...row, starting, boots, core, final }
}

function meaningfulBuild(row) {
  const starting = row?.starting?.length ?? 0
  const boots = row?.boots?.length ?? 0
  const core = row?.core?.length ?? 0
  const final = row?.final?.length ?? 0
  return core >= 3 && final >= 4 && (starting > 0 || boots > 0)
}

function round1(value) {
  return Math.round(value * 10) / 10
}

function winRatePct(wins, matches) {
  return matches > 0 ? Math.round((wins / matches) * 10000) / 100 : undefined
}

/** Decoded U.GG compact overview entry for one region/rank/role. */
function decodeEntry(entry) {
  const data = Array.isArray(entry) ? entry[0] : null
  if (!Array.isArray(data)) return null
  const overall = Array.isArray(data[6]) ? data[6] : []
  const wins = Number(overall[0] ?? 0)
  const matches = Number(overall[1] ?? 0)
  const ids = (raw) => (Array.isArray(raw) ? raw.map(Number).filter((id) => Number.isFinite(id) && id > 0) : [])
  return {
    wins,
    matches,
    lowSample: data[7] === true,
    runes: Array.isArray(data[0])
      ? { matches: Number(data[0][0] ?? 0), wins: Number(data[0][1] ?? 0), primary: Number(data[0][2] ?? 0), sub: Number(data[0][3] ?? 0), perks: ids(data[0][4]) }
      : null,
    spells: Array.isArray(data[1]) ? ids(data[1][2]) : [],
    startSet: Array.isArray(data[2]) ? ids(data[2][2]) : [],
    startMatches: Array.isArray(data[2]) ? Number(data[2][0] ?? 0) : 0,
    core: Array.isArray(data[3]) ? ids(data[3][2]) : [],
    coreMatches: Array.isArray(data[3]) ? Number(data[3][0] ?? 0) : 0,
    coreWins: Array.isArray(data[3]) ? Number(data[3][1] ?? 0) : 0,
    skills: Array.isArray(data[4]) && Array.isArray(data[4][2]) ? data[4][2].map(String).filter((s) => /^[QWER]$/.test(s)) : [],
    skillPriority: Array.isArray(data[4]) && typeof data[4][3] === 'string' ? data[4][3].replace(/[^QWE]/g, '') : '',
    /** Slots 4, 5, 6: [itemId, wins, matches] per option. Later groups are consumables. */
    slotOptions: [0, 1, 2].map((slot) =>
      (Array.isArray(data[5]?.[slot]) ? data[5][slot] : [])
        .map((row) => ({ id: Number(row?.[0]), wins: Number(row?.[1] ?? 0), matches: Number(row?.[2] ?? 0) }))
        .filter((row) => Number.isFinite(row.id) && row.id > 0 && row.matches > 0)
    ),
    shards: Array.isArray(data[8]) && Array.isArray(data[8][2]) ? data[8][2].map(Number).filter(Number.isFinite) : []
  }
}

function roleEntry(stats, rankKey, role) {
  return decodeEntry(stats?.[UGG_WORLD_REGION]?.[rankKey]?.[UGG_ROLE_KEY[role]])
}

/** Ordered fallbacks: same rank on the new patch first, widen only when the sample is thin. */
function pickRoleSample(role, current, previous) {
  const candidates = [
    { patch: current.patch, rank: 'emerald_plus', min: MIN_ROLE_SAMPLE, entry: roleEntry(current.stats, UGG_RANK.emerald_plus, role) },
    previous && { patch: previous.patch, rank: 'emerald_plus', min: MIN_ROLE_SAMPLE, entry: roleEntry(previous.stats, UGG_RANK.emerald_plus, role) },
    { patch: current.patch, rank: 'platinum_plus', min: MIN_ROLE_SAMPLE, entry: roleEntry(current.stats, UGG_RANK.platinum_plus, role) },
    { patch: current.patch, rank: 'overall', min: 300, entry: roleEntry(current.stats, UGG_RANK.overall, role) },
    previous && { patch: previous.patch, rank: 'overall', min: 300, entry: roleEntry(previous.stats, UGG_RANK.overall, role) }
  ].filter((row) => row && row.entry && row.entry.core.length >= 2)
  const trusted = candidates.find((row) => row.entry.matches >= row.min && !row.entry.lowSample)
  if (trusted) return trusted
  return candidates.sort((a, b) => b.entry.matches - a.entry.matches)[0] ?? null
}

function optionRows(options, itemById) {
  return options
    .filter((row) => itemById.has(row.id) && !isConsumable(itemById.get(row.id)))
    .sort((a, b) => b.matches - a.matches || b.wins - a.wins)
    .slice(0, 4)
    .map((row) => [row.id, round1(((row.wins / row.matches) || 0) * 100), row.matches])
}

function scrapedRow(champion, role, sample, roleShare, itemById) {
  const entry = sample.entry
  const startSet = entry.startSet.filter((id) => itemById.has(id)).slice(0, 4)
  const order = unique(entry.core).filter((id) => itemById.has(id)).slice(0, 3)
  const items4 = optionRows(entry.slotOptions[0], itemById)
  const items5 = optionRows(entry.slotOptions[1], itemById)
  const items6 = optionRows(entry.slotOptions[2], itemById)
  const popular = [items4, items5, items6].flatMap((rows) => rows.slice(0, 2).map((row) => row[0]))
  const legacy = legacyBuckets(startSet, [...order, ...popular], itemById)
  const row = {
    championId: Number(champion.key),
    role,
    sourceType: 'ugg',
    sourceUrl: `https://u.gg/lol/champions/${slug(champion.name)}/build/${uggRole[role]}`,
    winRate: winRatePct(entry.wins, entry.matches),
    matches: entry.matches || undefined,
    patch: shortPatch(sample.patch),
    rank: sample.rank,
    rolePct: roleShare != null ? round1(roleShare * 100) : undefined,
    ...legacy,
    startSet,
    order,
    coreWinRate: entry.coreMatches > 0 ? round1((entry.coreWins / entry.coreMatches) * 100) : undefined,
    coreMatches: entry.coreMatches || undefined,
    items4,
    items5,
    items6,
    skills: entry.skills.length >= 6 ? entry.skills.slice(0, 18).join('') : undefined,
    skillPriority: entry.skillPriority.length === 3 ? entry.skillPriority : undefined,
    spells: entry.spells.length === 2 ? entry.spells : undefined,
    runes:
      entry.runes && entry.runes.perks.length >= 4
        ? { primary: entry.runes.primary, sub: entry.runes.sub, perks: entry.runes.perks, shards: entry.shards.slice(0, 3) }
        : undefined
  }
  return meaningfulBuild(row) || order.length >= 3 ? row : null
}

function withSource(row, championName) {
  return {
    championId: row.championId,
    role: row.role,
    sourceType: row.sourceType ?? 'generated',
    sourceUrl: `https://u.gg/lol/champions/${slug(championName)}/build/${uggRole[row.role]}`,
    starting: row.starting ?? [],
    boots: row.boots ?? [],
    core: row.core ?? [],
    final: row.final ?? []
  }
}

function generatedTemplateFor(champion, role) {
  const name = compactName(champion.name)
  const tank = hasTag(champion, 'tank')
  const fighter = hasTag(champion, 'fighter')
  const mage = hasTag(champion, 'mage')
  const assassin = hasTag(champion, 'assassin')
  const marksman = hasTag(champion, 'marksman')
  const support = hasTag(champion, 'support')

  if (role === 'support') {
    if (tank || (fighter && !mage)) return defaultTemplates.supportTank
    if (support && !tank) return mage ? defaultTemplates.supportMage : defaultTemplates.enchanterSupport
    if (mage) return defaultTemplates.supportMage
    return defaultTemplates.supportTank
  }

  if (role === 'jungle') {
    if (tank && !mage && !assassin) return defaultTemplates.jungleTank
    if (mage && !fighter && !tank) return defaultTemplates.jungleMage
    if (meleeOnHitNames.has(name)) return defaultTemplates.jungleOnHit
    if (fighter && !mage) return defaultTemplates.jungleFighter
    if (assassin && !mage) return defaultTemplates.jungleAssassin
    return defaultTemplates.jungleFighter
  }

  if (meleeCritNames.has(name)) return defaultTemplates.meleeCrit
  if (meleeOnHitNames.has(name)) return defaultTemplates.meleeOnHit

  if (marksman) {
    if (onHitCarryNames.has(name)) return defaultTemplates.onHitMarksman
    if (casterMarksmanNames.has(name) || fighter || mage) return defaultTemplates.marksmanCaster
    return defaultTemplates.critMarksman
  }

  if (mage) {
    if (bruiserMageNames.has(name) || (fighter && role !== 'middle')) return defaultTemplates.mageBruiser
    if (burnMageNames.has(name)) return defaultTemplates.mageBurn
    return defaultTemplates.mage
  }

  if (tank && !fighter) return defaultTemplates.tank
  if (fighter || tank) return defaultTemplates.fighter
  if (assassin) return defaultTemplates.assassin
  return role === 'bottom' ? defaultTemplates.critMarksman : defaultTemplates.fighter
}

function generatedRow(champion, role, itemById) {
  const row = normalizeRowItems({ championId: Number(champion.key), role, ...generatedTemplateFor(champion, role) }, itemById)
  return meaningfulBuild(row) ? withSource(row, champion.name) : null
}

/** Pinned rows keep their curated items but still get U.GG's skills/spells/runes when we have them. */
function pinnedRow(trusted, champion, scraped, itemById) {
  const base = normalizeRowItems(withSource({ ...trusted, sourceType: 'pinned' }, champion.name), itemById)
  if (!meaningfulBuild(base)) return null
  const order = [base.core[0], base.boots[0], base.core[1]].filter((id) => id != null)
  return {
    ...base,
    ...(scraped
      ? {
          winRate: scraped.winRate,
          matches: scraped.matches,
          patch: scraped.patch,
          rank: scraped.rank,
          rolePct: scraped.rolePct,
          startSet: scraped.startSet,
          skills: scraped.skills,
          skillPriority: scraped.skillPriority,
          spells: scraped.spells,
          runes: scraped.runes
        }
      : {}),
    order
  }
}

async function mapLimit(values, limit, fn) {
  const out = new Array(values.length)
  let next = 0
  async function worker() {
    while (next < values.length) {
      const idx = next
      next += 1
      out[idx] = await fn(values[idx], idx)
      await sleep(FETCH_DELAY_MS)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker))
  return out
}

function overviewUrl(patch, championKey) {
  return `https://stats2.u.gg/lol/1.5/overview/${uggStatsPatch(patch)}/ranked_solo_5x5/${championKey}/1.5.0.json`
}

function roleMatches(stats, role) {
  return roleEntry(stats, UGG_RANK.emerald_plus, role)?.matches ?? 0
}

function runeIndexFrom(runesReforged, usedIds) {
  const index = {}
  for (const tree of Array.isArray(runesReforged) ? runesReforged : []) {
    if (usedIds.has(tree.id)) index[tree.id] = [tree.name, tree.icon]
    for (const slot of tree.slots ?? []) {
      for (const rune of slot.runes ?? []) {
        if (usedIds.has(rune.id)) index[rune.id] = [rune.name, rune.icon]
      }
    }
  }
  return index
}

function spellIndexFrom(summonerJson, usedIds) {
  const index = {}
  for (const spell of Object.values(summonerJson?.data ?? {})) {
    const id = Number(spell.key)
    if (usedIds.has(id)) index[id] = [spell.name, spell.id]
  }
  return index
}

function formatSeed(seed) {
  const head = { ...seed }
  delete head.builds
  const lines = Object.entries(head).map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)}`)
  const builds = seed.builds.map((row) => `    ${JSON.stringify(row)}`).join(',\n')
  return `{\n${lines.join(',\n')},\n  "builds": [\n${builds}\n  ]\n}\n`
}

async function updateManifest(seed) {
  const raw = await readFile(publicManifestPath, 'utf8').catch(() => null)
  if (!raw) return
  const manifest = JSON.parse(raw)
  manifest.buildsUrl = 'buildPathsSeed.json'
  manifest.buildsPatch = seed.statsPatch
  manifest.buildsUpdatedAt = seed.updatedAt
  manifest.buildCount = seed.builds.length
  await writeFile(publicManifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
}

async function main() {
  const versions = await json('https://ddragon.leagueoflegends.com/api/versions.json')
  const patch = versions[0]
  const [champions, items, runesReforged, summoners] = await Promise.all([
    json(`https://ddragon.leagueoflegends.com/cdn/${patch}/data/en_US/champion.json`),
    json(`https://ddragon.leagueoflegends.com/cdn/${patch}/data/en_US/item.json`),
    json(`https://ddragon.leagueoflegends.com/cdn/${patch}/data/en_US/runesReforged.json`),
    json(`https://ddragon.leagueoflegends.com/cdn/${patch}/data/en_US/summoner.json`)
  ])
  const itemById = currentStoreItems(items)
  const trustedByKey = new Map(trustedDefaultRows.map((row) => [`${row.championId}:${row.role}`, row]))
  const previousPatchLabel = previousPatch(patch)
  const championList = Object.values(champions.data ?? {}).sort((a, b) => Number(a.key) - Number(b.key))

  let fetched = 0
  let usedPrevious = 0
  const statsByChampion = await mapLimit(championList, FETCH_CONCURRENCY, async (champion) => {
    const stats = await json(overviewUrl(patch, champion.key), { optional: true }).catch(() => null)
    fetched += 1
    const best = Math.max(0, ...roles.map((role) => roleMatches(stats, role)))
    let previous = null
    if (best < PREVIOUS_PATCH_THRESHOLD && previousPatchLabel) {
      const previousStats = await json(overviewUrl(previousPatchLabel, champion.key), { optional: true }).catch(() => null)
      if (previousStats) {
        previous = { patch: previousPatchLabel, stats: previousStats }
        usedPrevious += 1
      }
    }
    if (fetched % 25 === 0) console.log(`  fetched ${fetched}/${championList.length}`)
    return { current: { patch, stats }, previous }
  })

  const builds = []
  const usedRuneIds = new Set()
  const usedSpellIds = new Set()
  championList.forEach((champion, idx) => {
    const { current, previous } = statsByChampion[idx]
    const totalMatches = roles.reduce((sum, role) => sum + roleMatches(current.stats, role), 0)
    for (const role of roles) {
      const key = `${champion.key}:${role}`
      const sample = current.stats ? pickRoleSample(role, current, previous) : null
      const share = totalMatches > 0 ? roleMatches(current.stats, role) / totalMatches : null
      const scraped = sample ? scrapedRow(champion, role, sample, share, itemById) : null
      const trusted = trustedByKey.get(key)
      let row = null
      if (pinnedOverrideKeys.has(key) && trusted) {
        row = pinnedRow(trusted, champion, scraped, itemById)
      }
      if (!row && scraped) row = scraped
      if (!row && trusted) {
        const normalized = normalizeRowItems(withSource({ ...trusted, sourceType: 'trusted' }, champion.name), itemById)
        if (meaningfulBuild(normalized)) row = normalized
      }
      if (!row) row = generatedRow(champion, role, itemById)
      if (!row) continue
      for (const id of [row.runes?.primary, row.runes?.sub, ...(row.runes?.perks ?? [])]) if (id) usedRuneIds.add(id)
      for (const id of row.spells ?? []) usedSpellIds.add(id)
      builds.push(Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined)))
    }
  })

  builds.sort((a, b) => a.championId - b.championId || a.role.localeCompare(b.role))
  const sourceCounts = builds.reduce((counts, row) => {
    const sourceType = row.sourceType ?? 'generated'
    counts[sourceType] = (counts[sourceType] ?? 0) + 1
    return counts
  }, {})
  const seed = {
    schema: 'nexus_build_paths_v2',
    patch,
    statsPatch: shortPatch(patch),
    rank: 'emerald_plus',
    updatedAt: new Date().toISOString().slice(0, 10),
    source:
      'U.GG public stats (world, Emerald+; Platinum+/all ranks or previous patch only when a role sample is thin), normalized to current Riot item ids. Template fallbacks fill roles U.GG has no data for.',
    sourceCounts,
    champions: championList.map((champion) => [Number(champion.key), champion.id, champion.name]),
    runes: runeIndexFrom(runesReforged, usedRuneIds),
    spells: spellIndexFrom(summoners, usedSpellIds),
    builds
  }
  if (builds.length < championList.length * 3) {
    throw new Error(`Refusing to write a thin seed (${builds.length} rows for ${championList.length} champions).`)
  }
  const text = formatSeed(seed)
  const engineSeed = {
    ...seed,
    schema: 'nexus_build_paths_engine_v2',
    runes: undefined,
    spells: undefined,
    builds: builds.map((row) => Object.fromEntries(ENGINE_FIELDS.filter((key) => row[key] !== undefined).map((key) => [key, row[key]])))
  }
  delete engineSeed.runes
  delete engineSeed.spells
  const engineText = formatSeed(engineSeed)
  await writeFile(outPath, engineText)
  await writeFile(fullOutPath, text)
  await writeFile(publicOutPath, text)
  await updateManifest(seed)
  console.log({
    patch,
    champions: championList.length,
    builds: builds.length,
    sourceCounts,
    usedPreviousPatch: usedPrevious,
    engineBytes: engineText.length,
    fullBytes: text.length
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
