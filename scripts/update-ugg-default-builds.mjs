import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outPath = resolve(repoRoot, 'src/shared/data/uggDefaultItemBuildsSeed.json')
const roles = ['top', 'jungle', 'middle', 'bottom', 'support']
const uggRole = { top: 'top', jungle: 'jungle', middle: 'mid', bottom: 'adc', support: 'support' }
const compactRoleKey = { jungle: '1', support: '2', bottom: '3', top: '4', middle: '5' }
const compactEmeraldPlusKey = '8'
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

async function json(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'NexusDraftSeedUpdater/1.0' } })
  if (!res.ok) throw new Error(`${url} ${res.status}`)
  return res.json()
}

async function text(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'NexusDraftSeedUpdater/1.0' } })
  if (!res.ok) return ''
  return res.text()
}

function uggStatsPatch(patch) {
  const [major, minor] = String(patch).split('.')
  return `${major}_${minor}`
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

const retiredOrOffstoreItemNames = new Set()

const summonersRiftModeNames = new Set(['classic', 'sr', 'summoners rift', "summoner's rift", 'summoners_rift'])

function canonicalItemName(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/\u2019/g, "'")
    .replace(/[â€™']/g, "'")
    .replace(/[^a-z0-9']+/g, ' ')
    .trim()
}

function isModeExclusiveItemId(id) {
  return id >= 10000
}

function hasOnlyNonRiftModes(item) {
  const modes = Array.isArray(item.modes) ? item.modes : Array.isArray(item.requiredModes) ? item.requiredModes : null
  if (!modes?.length) return false
  const normalized = modes.map(canonicalItemName).filter(Boolean)
  return normalized.length > 0 && normalized.every((mode) => !summonersRiftModeNames.has(mode))
}

function currentStoreItems(itemJson) {
  const byId = new Map()
  for (const [idText, item] of Object.entries(itemJson.data ?? {})) {
    const id = Number(idText)
    const name = String(item.name ?? '').toLowerCase().replace(/[’']/g, "'")
    if (
      Number.isFinite(id) &&
      !isModeExclusiveItemId(id) &&
      item.maps?.['11'] === true &&
      item.hideFromAll !== true &&
      item.inStore !== false &&
      item.gold?.purchasable === true &&
      item.requiredAlly == null &&
      item.requiredBuffCurrencyName == null &&
      item.requiredChampion == null &&
      item.specialRecipe == null &&
      !hasOnlyNonRiftModes(item) &&
      !retiredOrOffstoreItemNames.has(canonicalItemName(item.name)) &&
      name !== "prowler's claw"
    ) {
      byId.set(id, item)
    }
  }
  return byId
}

function phaseBuckets(ids, itemById) {
  const valid = unique(ids).filter((id) => itemById.has(id))
  const starter = valid.filter((id) => (itemById.get(id).gold?.total ?? 0) <= 700 && !String(itemById.get(id).name ?? '').toLowerCase().includes('potion')).slice(0, 1)
  const boots = valid.filter((id) => (itemById.get(id).tags ?? []).some((tag) => String(tag).toLowerCase() === 'boots')).slice(0, 1)
  const completed = valid
    .filter((id) => !starter.includes(id) && !boots.includes(id) && (itemById.get(id).gold?.total ?? 0) >= 2200)
    .slice(0, 6)
  return {
    starting: starter,
    boots,
    core: completed.slice(0, 3),
    final: unique([...boots, ...completed]).slice(0, 6)
  }
}

function parseJsonObjectAt(textValue, startIndex) {
  if (startIndex < 0 || textValue[startIndex] !== '{') return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let idx = startIndex; idx < textValue.length; idx += 1) {
    const char = textValue[idx]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }
    if (char === '"') {
      inString = true
    } else if (char === '{') {
      depth += 1
    } else if (char === '}') {
      depth -= 1
      if (depth === 0) {
        try {
          return JSON.parse(textValue.slice(startIndex, idx + 1))
        } catch {
          return null
        }
      }
    }
  }
  return null
}

function embeddedRoleStats(html, role) {
  const marker = `"world_emerald_plus_${uggRole[role]}":`
  const markerIndex = html.indexOf(marker)
  if (markerIndex < 0) return null
  const objectStart = html.indexOf('{', markerIndex + marker.length)
  return parseJsonObjectAt(html, objectStart)
}

function topOptionIds(stats, optionKey) {
  const rows = Array.isArray(stats?.[optionKey]) ? stats[optionKey] : []
  return rows
    .slice()
    .sort((a, b) => {
      const aMatches = Number(a?.matches ?? 0)
      const bMatches = Number(b?.matches ?? 0)
      if (bMatches !== aMatches) return bMatches - aMatches
      return Number(b?.win_rate ?? 0) - Number(a?.win_rate ?? 0)
    })
    .map((row) => Number(row?.id))
    .filter(Number.isFinite)
    .slice(0, 2)
}

function scrapedRowFromStats(champion, role, stats, itemById) {
  if (!stats || stats.build_warning === true) return null
  const ids = [
    ...(stats.rec_starting_items?.ids ?? []),
    ...(stats.rec_core_items?.ids ?? []),
    ...topOptionIds(stats, 'item_options_1'),
    ...topOptionIds(stats, 'item_options_2'),
    ...topOptionIds(stats, 'item_options_3'),
    ...topOptionIds(stats, 'item_options_4'),
    ...topOptionIds(stats, 't3_boots_options')
  ].map(Number).filter(Number.isFinite)
  const row = {
    championId: Number(champion.key),
    role,
    sourceType: 'ugg',
    sourceUrl: `https://u.gg/lol/champions/${slug(champion.name)}/build/${uggRole[role]}`,
    winRate: Number.isFinite(stats.win_rate) ? stats.win_rate : undefined,
    matches: Number.isFinite(stats.matches) ? stats.matches : undefined,
    ...phaseBuckets(ids, itemById)
  }
  return meaningfulBuild(row) ? row : null
}

function scrapedRowsFromHtml(champion, html, itemById) {
  const rowsByRole = new Map()
  if (!html) return rowsByRole
  for (const role of roles) {
    const stats = embeddedRoleStats(html, role)
    const row = scrapedRowFromStats(champion, role, stats, itemById)
    if (row) rowsByRole.set(role, row)
  }
  return rowsByRole
}

function compactOptionIds(groups) {
  return (Array.isArray(groups) ? groups.slice(0, 3) : [])
    .flatMap((group) => Array.isArray(group) ? group : [])
    .slice()
    .sort((a, b) => {
      const aMatches = Number(a?.[2] ?? 0)
      const bMatches = Number(b?.[2] ?? 0)
      if (bMatches !== aMatches) return bMatches - aMatches
      return Number(b?.[1] ?? 0) - Number(a?.[1] ?? 0)
    })
    .map((row) => Number(row?.[0]))
    .filter(Number.isFinite)
    .slice(0, 8)
}

function compactStatsMatches(compactRow) {
  const data = Array.isArray(compactRow) ? compactRow[0] : null
  return Number(data?.[6]?.[1] ?? data?.[3]?.[0] ?? 0)
}

function bestCombo(rows, dataIndex) {
  const combos = new Map()
  for (const compactRow of rows) {
    const data = Array.isArray(compactRow) ? compactRow[0] : null
    const ids = Array.isArray(data?.[dataIndex]?.[2]) ? data[dataIndex][2].map(Number).filter(Number.isFinite) : []
    if (!ids.length) continue
    const key = ids.join(',')
    const current = combos.get(key) ?? { ids, matches: 0, wins: 0 }
    current.matches += Number(data?.[dataIndex]?.[0] ?? 0)
    current.wins += Number(data?.[dataIndex]?.[1] ?? 0)
    combos.set(key, current)
  }
  return Array.from(combos.values()).sort((a, b) => {
    if (b.matches !== a.matches) return b.matches - a.matches
    return b.wins - a.wins
  })[0]?.ids ?? []
}

function aggregateOptionIds(rows) {
  const options = new Map()
  for (const compactRow of rows) {
    const data = Array.isArray(compactRow) ? compactRow[0] : null
    for (const group of Array.isArray(data?.[5]) ? data[5].slice(0, 3) : []) {
      for (const option of Array.isArray(group) ? group : []) {
        const id = Number(option?.[0])
        if (!Number.isFinite(id)) continue
        const current = options.get(id) ?? { id, wins: 0, matches: 0 }
        current.wins += Number(option?.[1] ?? 0)
        current.matches += Number(option?.[2] ?? 0)
        options.set(id, current)
      }
    }
  }
  return Array.from(options.values())
    .sort((a, b) => {
      if (b.matches !== a.matches) return b.matches - a.matches
      return b.wins - a.wins
    })
    .map((row) => row.id)
    .slice(0, 8)
}

function rowFromAggregatedCompactStats(champion, role, compactRows, itemById, sourceType = 'ugg') {
  const rows = compactRows.filter((row) => Array.isArray(row?.[0]) && row[0][7] !== true)
  if (!rows.length) return null
  const total = rows.reduce((sum, row) => {
    const data = row[0]
    return {
      wins: sum.wins + Number(data?.[6]?.[0] ?? 0),
      matches: sum.matches + Number(data?.[6]?.[1] ?? 0)
    }
  }, { wins: 0, matches: 0 })
  const ids = [
    ...bestCombo(rows, 2),
    ...bestCombo(rows, 3),
    ...aggregateOptionIds(rows)
  ]
  const row = {
    championId: Number(champion.key),
    role,
    sourceType,
    sourceUrl: `https://u.gg/lol/champions/${slug(champion.name)}/build/${uggRole[role]}`,
    winRate: total.matches > 0 ? Math.round((total.wins / total.matches) * 10000) / 100 : undefined,
    matches: total.matches || undefined,
    ...phaseBuckets(ids, itemById)
  }
  return meaningfulBuild(row) ? row : null
}

function rowFromCompactStats(champion, role, compactRow, itemById, sourceType = 'ugg') {
  const data = Array.isArray(compactRow) ? compactRow[0] : null
  if (!Array.isArray(data) || data[7] === true) return null
  const ids = [
    ...(Array.isArray(data[2]?.[2]) ? data[2][2] : []),
    ...(Array.isArray(data[3]?.[2]) ? data[3][2] : []),
    ...compactOptionIds(data[5])
  ].map(Number).filter(Number.isFinite)
  const row = {
    championId: Number(champion.key),
    role,
    sourceType,
    sourceUrl: `https://u.gg/lol/champions/${slug(champion.name)}/build/${uggRole[role]}`,
    winRate: Number.isFinite(data[6]?.[0]) && Number.isFinite(data[6]?.[1]) && data[6][1] > 0
      ? Math.round((data[6][0] / data[6][1]) * 10000) / 100
      : undefined,
    matches: Number.isFinite(data[6]?.[1]) ? data[6][1] : undefined,
    ...phaseBuckets(ids, itemById)
  }
  return meaningfulBuild(row) ? row : null
}

function compactRowsFromStats(champion, stats, itemById) {
  const rowsByRole = new Map()
  for (const role of roles) {
    const roleKey = compactRoleKey[role]
    const preferredCompactRows = Object.values(stats ?? {})
      .map((rankRows) => rankRows?.[compactEmeraldPlusKey]?.[roleKey])
      .filter(Boolean)
    const preferredRow = rowFromAggregatedCompactStats(champion, role, preferredCompactRows, itemById, 'ugg')
    if (preferredRow) {
      rowsByRole.set(role, preferredRow)
      continue
    }
    const best = Object.values(stats ?? {})
      .flatMap((rankRows) => Object.values(rankRows ?? {}).map((rows) => rows?.[roleKey]).filter(Boolean))
      .sort((a, b) => compactStatsMatches(b) - compactStatsMatches(a))
      .map((row) => rowFromCompactStats(champion, role, row, itemById, 'ugg-fallback'))
      .find(Boolean)
    if (best) rowsByRole.set(role, best)
  }
  return rowsByRole
}

function normalizeRowItems(row, itemById) {
  const valid = (ids) => unique(ids ?? []).filter((id) => itemById.has(id))
  const starting = valid(row.starting).slice(0, 1)
  const boots = valid(row.boots).filter((id) => (itemById.get(id)?.tags ?? []).some((tag) => String(tag).toLowerCase() === 'boots')).slice(0, 1)
  const core = valid(row.core).filter((id) => (itemById.get(id)?.gold?.total ?? 0) >= 2200).slice(0, 3)
  const final = valid([...boots, ...(row.final ?? []), ...core]).filter((id) => (itemById.get(id)?.gold?.total ?? 0) >= 900).slice(0, 6)
  return { ...row, starting, boots, core, final }
}

function meaningfulBuild(row) {
  const starting = row?.starting?.length ?? 0
  const boots = row?.boots?.length ?? 0
  const core = row?.core?.length ?? 0
  const final = row?.final?.length ?? 0
  return core >= 3 && final >= 4 && (starting > 0 || boots > 0)
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
  const row = normalizeRowItems({
    championId: Number(champion.key),
    role,
    ...generatedTemplateFor(champion, role)
  }, itemById)
  return meaningfulBuild(row) ? withSource(row, champion.name) : null
}

async function main() {
  const versions = await json('https://ddragon.leagueoflegends.com/api/versions.json')
  const patch = versions[0]
  const [champions, items] = await Promise.all([
    json(`https://ddragon.leagueoflegends.com/cdn/${patch}/data/en_US/champion.json`),
    json(`https://ddragon.leagueoflegends.com/cdn/${patch}/data/en_US/item.json`)
  ])
  const itemById = currentStoreItems(items)
  const previous = JSON.parse(await readFile(outPath, 'utf8').catch(() => '{"builds":[]}'))
  const previousByKey = new Map((previous.builds ?? []).map((row) => [`${row.championId}:${row.role}`, row]))
  const trustedByKey = new Map(trustedDefaultRows.map((row) => [`${row.championId}:${row.role}`, row]))
  const builds = []
  for (const champion of Object.values(champions.data ?? {})) {
    const statsUrl = `https://stats2.u.gg/lol/1.5/overview/${uggStatsPatch(patch)}/ranked_solo_5x5/${champion.key}/1.5.0.json`
    const stats = await json(statsUrl).catch(() => null)
    const scrapedByRole = compactRowsFromStats(champion, stats, itemById)
    for (const role of roles) {
      const key = `${champion.key}:${role}`
      const pinnedRow = pinnedOverrideKeys.has(key) ? trustedByKey.get(key) : null
      if (pinnedRow) {
        const normalized = normalizeRowItems(withSource({ ...pinnedRow, sourceType: 'pinned' }, champion.name), itemById)
        if (meaningfulBuild(normalized)) {
          builds.push(normalized)
          continue
        }
      }
      const scrapedRow = scrapedByRole.get(role)
      if (scrapedRow) {
        builds.push(scrapedRow)
        continue
      }
      const trustedRow = trustedByKey.get(key)
      if (trustedRow) {
        const normalized = normalizeRowItems(withSource({ ...trustedRow, sourceType: 'trusted' }, champion.name), itemById)
        if (meaningfulBuild(normalized)) {
          builds.push(normalized)
          continue
        }
      }
      const previousRow = previousByKey.get(key) ? normalizeRowItems(previousByKey.get(key), itemById) : null
      const row = previousRow?.sourceType === 'ugg' && meaningfulBuild(previousRow)
        ? previousRow
        : generatedRow(champion, role, itemById)
      if (row) builds.push(row)
    }
  }
  builds.sort((a, b) => a.championId - b.championId || a.role.localeCompare(b.role))
  const sourceCounts = builds.reduce((counts, row) => {
    const sourceType = row.sourceType ?? 'generated'
    counts[sourceType] = (counts[sourceType] ?? 0) + 1
    return counts
  }, {})
  await writeFile(outPath, `${JSON.stringify({ patch, source: 'U.GG public champion build pages plus current Data Dragon fallback templates, normalized to Riot item ids.', sourceCounts, builds }, null, 2)}\n`)
  console.log({ patch, builds: builds.length, sourceCounts })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
