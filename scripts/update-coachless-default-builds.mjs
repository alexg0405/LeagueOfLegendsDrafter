import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outPath = resolve(repoRoot, 'src/shared/data/uggDefaultItemBuildsSeed.json')
const API = 'https://api.coachless.gg/api'
const DDRAGON = 'https://ddragon.leagueoflegends.com'
const roles = ['top', 'jungle', 'middle', 'bottom', 'support']
const roleEnum = { top: 0, jungle: 1, middle: 2, bottom: 3, support: 4 }
const coachlessRole = { top: 'top', jungle: 'jungle', middle: 'mid', bottom: 'adc', support: 'support' }
const itemType = {
  legendaries: 1,
  boots: 2,
  support: 3,
  starter: 6
}
const defaultLeagueTiers = [5, 6, 7] // Emerald, Diamond, Master+ in Coachless filters.

function tokenFromEnv() {
  return (process.env.COACHLESS_ACCESS_TOKEN ?? process.env.COACHLESS_TOKEN ?? '').trim()
}

function authHeader(token) {
  return /^bearer\s+/i.test(token) ? token : `Bearer ${token}`
}

function unique(values) {
  return Array.from(new Set(values.filter((value) => Number.isFinite(value))))
}

function compactChampionSlug(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

async function publicJson(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'NexusDraftCoachlessUpdater/1.0' } })
  if (!res.ok) {
    throw new Error(`${url} ${res.status}`)
  }
  return res.json()
}

async function coachlessPost(endpoint, body, token) {
  const res = await fetch(`${API}${endpoint}`, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/plain, */*',
      authorization: authHeader(token),
      'content-type': 'application/json',
      origin: 'https://coachless.gg',
      referer: 'https://coachless.gg/builds',
      'user-agent': 'NexusDraftCoachlessUpdater/1.0'
    },
    body: JSON.stringify(body)
  })
  if (res.status === 401 || res.status === 403) {
    const err = new Error(`Coachless returned ${res.status}. Set COACHLESS_ACCESS_TOKEN to a valid signed-in Coachless token with access to item statistics.`)
    err.coachlessAuth = true
    throw err
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Coachless ${endpoint} ${res.status}${text ? `: ${text.slice(0, 240)}` : ''}`)
  }
  return res.json()
}

function canonicalItemName(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/\u2019/g, "'")
    .replace(/[^a-z0-9']+/g, ' ')
    .trim()
}

function currentStoreItems(itemJson) {
  const byId = new Map()
  for (const [idText, item] of Object.entries(itemJson.data ?? {})) {
    const id = Number(idText)
    const name = canonicalItemName(item?.name)
    if (
      Number.isFinite(id) &&
      id < 10000 &&
      item?.maps?.['11'] === true &&
      item.hideFromAll !== true &&
      item.inStore !== false &&
      item.gold?.purchasable === true &&
      item.requiredAlly == null &&
      item.requiredBuffCurrencyName == null &&
      item.requiredChampion == null &&
      item.specialRecipe == null &&
      name !== "prowler's claw"
    ) {
      byId.set(id, item)
    }
  }
  return byId
}

function isBoot(id, itemById) {
  return (itemById.get(id)?.tags ?? []).some((tag) => String(tag).toLowerCase() === 'boots')
}

function normalizeRowItems(row, itemById) {
  const valid = (ids) => unique((ids ?? []).map(Number)).filter((id) => itemById.has(id))
  const starting = valid(row.starting).filter((id) => !isBoot(id, itemById)).slice(0, 1)
  const boots = valid(row.boots).filter((id) => isBoot(id, itemById)).slice(0, 1)
  const core = valid(row.core).filter((id) => !starting.includes(id) && !boots.includes(id)).slice(0, 3)
  const final = valid([...boots, ...(row.final ?? []), ...core]).filter((id) => !starting.includes(id)).slice(0, 6)
  return { ...row, starting, boots, core, final }
}

function meaningfulBuild(row) {
  const starting = row?.starting?.length ?? 0
  const boots = row?.boots?.length ?? 0
  const core = row?.core?.length ?? 0
  const final = row?.final?.length ?? 0
  return core >= 2 && final >= 3 && (starting > 0 || boots > 0)
}

function rowsFromResponse(value) {
  if (Array.isArray(value)) return value
  for (const key of ['data', 'items', 'rows', 'result', 'results']) {
    const child = value?.[key]
    if (Array.isArray(child)) return child
    if (Array.isArray(child?.data)) return child.data
  }
  return []
}

function numberFrom(row, keys) {
  for (const key of keys) {
    const value = Number(row?.[key])
    if (Number.isFinite(value)) {
      return value
    }
  }
  return 0
}

function itemIdFromRow(row) {
  const direct = numberFrom(row, ['itemId', 'ItemId', 'item', 'Item', 'id', 'Id'])
  if (direct > 0) return direct
  return numberFrom(row?.item ?? row?.Item, ['itemId', 'ItemId', 'id', 'Id'])
}

function occurrenceFromRow(row) {
  return numberFrom(row, ['occurrence', 'Occurrence', 'matches', 'Matches', 'matchCount', 'MatchCount', 'count', 'Count'])
}

function wpaFromRow(row) {
  return numberFrom(row, ['wpaOverall', 'WpaOverall', 'wpa', 'Wpa', 'delta', 'Delta'])
}

function winRateFromRow(row) {
  const value = numberFrom(row, ['winRate', 'WinRate', 'win_rate'])
  return value > 0 ? value : undefined
}

function bestItem(rows, itemById, blockedIds = new Set()) {
  return rows
    .map((row) => ({ row, id: itemIdFromRow(row), occurrence: occurrenceFromRow(row), wpa: wpaFromRow(row) }))
    .filter((row) => row.id > 0 && itemById.has(row.id) && !blockedIds.has(row.id))
    .sort((a, b) => b.occurrence - a.occurrence || b.wpa - a.wpa || a.id - b.id)[0] ?? null
}

function weightedWpa(rows) {
  let weighted = 0
  let total = 0
  for (const entry of rows) {
    const occurrence = Math.max(1, entry.occurrence)
    weighted += entry.wpa * occurrence
    total += occurrence
  }
  return total > 0 ? Math.round((weighted / total) * 1000) / 1000 : undefined
}

function averageWinRate(rows) {
  const values = rows.map((entry) => winRateFromRow(entry.row)).filter((value) => value != null)
  return values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100 : undefined
}

function commonFilters(championId, role, patch) {
  return {
    patch: { major: patch.major, patch: patch.patch, patchAdditions: 0 },
    championIds: [championId],
    matchupChampionIds: null,
    leagueTiers: defaultLeagueTiers,
    regions: null,
    role: roleEnum[role]
  }
}

async function itemRows({ championId, role, patch, token, slots, type, selected }) {
  const firstSlot = Array.isArray(slots) && slots.length === 1 && slots[0] === 1
  const secondSlot = Array.isArray(slots) && slots.length === 1 && slots[0] === 2
  const body = {
    commonFilters: commonFilters(championId, role, patch),
    itemSlots: type === itemType.starter || type === itemType.support ? null : slots,
    itemType: role === 'support' && firstSlot ? itemType.support : type,
    keystone: null,
    starterId: type === itemType.starter ? null : selected.starterId,
    firstPurchaseId: null,
    firstLegendaryId: firstSlot ? null : selected.firstLegendaryId,
    secondLegendaryId: type === itemType.legendaries && secondSlot ? null : selected.secondLegendaryId,
    loadFirstEpicPurchase: false,
    includeSupportItems: firstSlot
  }
  return rowsFromResponse(await coachlessPost('/ChampionWinprob/GetGlobalItemStatistics', body, token))
}

async function coachlessRowForChampionRole(champion, role, patch, itemById, token) {
  const championId = Number(champion.key)
  const selected = { starterId: null, firstLegendaryId: null, secondLegendaryId: null }
  const picked = []
  const blocked = new Set()

  const starter = bestItem(await itemRows({ championId, role, patch, token, slots: null, type: itemType.starter, selected }), itemById)
  if (starter) {
    selected.starterId = starter.id
    picked.push(starter)
    blocked.add(starter.id)
  }

  const first = bestItem(await itemRows({ championId, role, patch, token, slots: [1], type: itemType.legendaries, selected }), itemById, blocked)
  if (first) {
    selected.firstLegendaryId = first.id
    picked.push(first)
    blocked.add(first.id)
  }

  const second = bestItem(await itemRows({ championId, role, patch, token, slots: [2], type: itemType.legendaries, selected }), itemById, blocked)
  if (second) {
    selected.secondLegendaryId = second.id
    picked.push(second)
    blocked.add(second.id)
  }

  const boots = bestItem(await itemRows({ championId, role, patch, token, slots: null, type: itemType.boots, selected }), itemById, blocked)
  if (boots) {
    picked.push(boots)
    blocked.add(boots.id)
  }

  const third = bestItem(await itemRows({ championId, role, patch, token, slots: [3], type: itemType.legendaries, selected }), itemById, blocked)
  if (third) {
    picked.push(third)
    blocked.add(third.id)
  }

  const fourth = bestItem(await itemRows({ championId, role, patch, token, slots: [4, 5, 6], type: itemType.legendaries, selected }), itemById, blocked)
  if (fourth) {
    picked.push(fourth)
  }

  const coreIds = [first?.id, second?.id, third?.id].filter(Number.isFinite)
  const row = normalizeRowItems({
    championId,
    role,
    sourceType: 'coachless',
    sourceUrl: `https://coachless.gg/builds/${compactChampionSlug(champion.id)}?role=${coachlessRole[role]}`,
    starting: starter ? [starter.id] : [],
    boots: boots ? [boots.id] : [],
    core: coreIds,
    final: unique([boots?.id, ...coreIds, fourth?.id]),
    matches: Math.max(...picked.map((entry) => entry.occurrence), 0) || undefined,
    wpaOverall: weightedWpa(picked),
    winRate: averageWinRate(picked)
  }, itemById)
  return meaningfulBuild(row) ? row : null
}

async function main() {
  const token = tokenFromEnv()
  if (!token) {
    throw new Error('Coachless item-stat endpoints require auth. Set COACHLESS_ACCESS_TOKEN or COACHLESS_TOKEN from a signed-in Coachless session before running this updater.')
  }

  const patches = await publicJson(`${API}/ChampionWinprob/GetPatches`)
  const patch = patches
    .slice()
    .sort((a, b) => Number(a.major) - Number(b.major) || Number(a.patch) - Number(b.patch))
    .at(-1)
  if (!patch) {
    throw new Error('Coachless returned no patch metadata.')
  }

  const versions = await publicJson(`${DDRAGON}/api/versions.json`)
  const ddragonPatch = versions.find((version) => version.startsWith(`${patch.major}.${patch.patch}.`)) ?? versions[0]
  const [champions, items] = await Promise.all([
    publicJson(`${DDRAGON}/cdn/${ddragonPatch}/data/en_US/champion.json`),
    publicJson(`${DDRAGON}/cdn/${ddragonPatch}/data/en_US/item.json`)
  ])
  const itemById = currentStoreItems(items)
  const previous = JSON.parse(await readFile(outPath, 'utf8').catch(() => '{"builds":[]}'))
  const previousByKey = new Map((previous.builds ?? []).map((row) => [`${row.championId}:${row.role}`, row]))
  const builds = []
  const championRows = Object.values(champions.data ?? {})
  let coachlessCount = 0
  let fallbackCount = 0
  let checked = 0

  console.log(`Coachless patch ${patch.label ?? `${patch.major}.${patch.patch}`} with Data Dragon ${ddragonPatch}.`)
  for (const champion of championRows) {
    for (const role of roles) {
      const key = `${champion.key}:${role}`
      let row = null
      try {
        row = await coachlessRowForChampionRole(champion, role, patch, itemById, token)
      } catch (err) {
        if (err?.coachlessAuth) {
          throw err
        }
        console.warn(`Coachless row failed for ${champion.id} ${role}: ${err.message}`)
      }
      if (row) {
        builds.push(row)
        coachlessCount += 1
      } else {
        const previousRow = previousByKey.get(key)
        const fallback = previousRow ? normalizeRowItems(previousRow, itemById) : null
        if (fallback && meaningfulBuild(fallback)) {
          builds.push(fallback)
          fallbackCount += 1
        }
      }
    }
    checked += 1
    if (checked % 10 === 0) {
      console.log(`Processed ${checked}/${championRows.length} champions...`)
    }
  }

  builds.sort((a, b) => a.championId - b.championId || a.role.localeCompare(b.role))
  const sourceCounts = builds.reduce((counts, row) => {
    const sourceType = row.sourceType ?? 'generated'
    counts[sourceType] = (counts[sourceType] ?? 0) + 1
    return counts
  }, {})
  if (coachlessCount === 0) {
    throw new Error('Coachless returned no usable item builds; keeping the existing seed untouched.')
  }
  await writeFile(
    outPath,
    `${JSON.stringify({
      patch: ddragonPatch,
      source: 'Coachless ChampionWinprob item statistics with existing seed fallbacks, normalized to Riot item ids.',
      coachlessPatch: patch.label ?? `${patch.major}.${patch.patch}`,
      sourceCounts,
      builds
    }, null, 2)}\n`
  )
  console.log({ patch: ddragonPatch, coachlessPatch: patch.label, builds: builds.length, coachlessCount, fallbackCount, sourceCounts })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
