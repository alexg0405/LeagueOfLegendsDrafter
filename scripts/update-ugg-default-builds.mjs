import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outPath = resolve(repoRoot, 'src/shared/data/uggDefaultItemBuildsSeed.json')
const roles = ['top', 'jungle', 'middle', 'bottom', 'support']
const uggRole = { top: 'top', jungle: 'jungle', middle: 'mid', bottom: 'adc', support: 'support' }

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

function unique(values) {
  return Array.from(new Set(values))
}

function currentStoreItems(itemJson) {
  const byId = new Map()
  for (const [idText, item] of Object.entries(itemJson.data ?? {})) {
    const id = Number(idText)
    const name = String(item.name ?? '').toLowerCase().replace(/[’']/g, "'")
    if (
      Number.isFinite(id) &&
      item.maps?.['11'] === true &&
      item.hideFromAll !== true &&
      item.inStore !== false &&
      item.gold?.purchasable === true &&
      item.requiredAlly == null &&
      item.requiredBuffCurrencyName == null &&
      item.specialRecipe == null &&
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
  const builds = []
  for (const champion of Object.values(champions.data ?? {})) {
    for (const role of roles) {
      const url = `https://u.gg/lol/champions/${slug(champion.name)}/build/${uggRole[role]}`
      const html = await text(url)
      const ids = Array.from(html.matchAll(/\/item\/(\d+)\.png/g), (match) => Number(match[1]))
      const buckets = phaseBuckets(ids, itemById)
      const key = `${champion.key}:${role}`
      const previousRow = previousByKey.get(key)
      const row = unique([...buckets.starting, ...buckets.boots, ...buckets.core, ...buckets.final]).length
        ? { championId: Number(champion.key), role, sourceUrl: url, ...buckets }
        : previousRow
      if (row) builds.push(row)
    }
  }
  builds.sort((a, b) => a.championId - b.championId || a.role.localeCompare(b.role))
  await writeFile(outPath, `${JSON.stringify({ patch, source: 'U.GG public champion build pages, normalized to Riot Data Dragon item ids.', builds }, null, 2)}\n`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
