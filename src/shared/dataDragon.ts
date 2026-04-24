const VERSIONS_URL = 'https://ddragon.leagueoflegends.com/api/versions.json'

let cachedVersion: string | null = null

/**
 * Returns latest patch string from Data Dragon (e.g. "15.1.1").
 * Future: ETag, disk cache, user override in settings.
 */
export async function getLatestDDragonVersion(): Promise<string> {
  if (cachedVersion) {
    return cachedVersion
  }
  const res = await fetch(VERSIONS_URL)
  if (!res.ok) {
    throw new Error(`Failed to load versions: ${res.status}`)
  }
  const list = (await res.json()) as string[]
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error('Invalid versions.json')
  }
  cachedVersion = list[0]!
  return cachedVersion
}

export function ddragonChampionImageUrl(
  version: string,
  championKey: string
): string {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${championKey}.png`
}

/** Riot DDragon: official class tags and resource bar type (drives our AD/AP / tank hints). */
export type ChampionLite = {
  id: number
  key: string
  name: string
  tags: string[]
  partype: string
}

const championCache = new Map<string, Map<string, number>>()
const championListCache = new Map<string, ChampionLite[]>()

/**
 * Fetches DDragon `champion.json` and returns champions + a lowercase-name → id map
 * (first match wins on ambiguous nicknames; prefer LCU for truth).
 */
export async function loadChampionMaps(version: string): Promise<{
  byLowerName: Map<string, number>
  champions: ChampionLite[]
}> {
  if (championCache.has(version)) {
    return {
      byLowerName: championCache.get(version)!,
      champions: championListCache.get(version) ?? []
    }
  }
  const url = `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`champion.json ${res.status}`)
  }
  const j = (await res.json()) as {
    data: Record<string, { key: string; name: string; id: number; tags?: string[]; partype?: string }>
  }
  const byLowerName = new Map<string, number>()
  const champions: ChampionLite[] = []
  for (const ch of Object.values(j.data)) {
    champions.push({
      id: ch.id,
      key: ch.key,
      name: ch.name,
      tags: Array.isArray(ch.tags) ? ch.tags : [],
      partype: typeof ch.partype === 'string' && ch.partype.length > 0 ? ch.partype : 'None'
    })
    byLowerName.set(ch.name.toLowerCase(), ch.id)
    byLowerName.set(ch.key.toLowerCase(), ch.id)
  }
  championCache.set(version, byLowerName)
  championListCache.set(version, champions)
  return { byLowerName, champions }
}
