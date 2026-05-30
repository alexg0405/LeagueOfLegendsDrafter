import {
  buildPlayerChampionPoolProfile,
  isFreshPlayerChampionPoolProfile,
  normalizeChampionMasteryRows,
  normalizeRiotPlatform,
  parseRiotId,
  riotPlatformToRegion,
  type PlayerChampionPoolProfile,
  type PlayerChampionPoolResponse
} from '../shared/draft/playerChampionPool'

const MAX_TOP_MASTERY = 20
type RiotFetchJsonResult = { ok: true; json: unknown } | Extract<PlayerChampionPoolResponse, { ok: false }>

const cache = new Map<string, PlayerChampionPoolProfile>()

function clampCount(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) {
    return MAX_TOP_MASTERY
  }
  return Math.max(1, Math.min(MAX_TOP_MASTERY, Math.trunc(n)))
}

function cacheKey(riotId: string, platform: string, count: number): string {
  return `${platform}:${riotId.trim().toLowerCase()}:${count}`
}

async function riotFetchJson(url: string, apiKey: string): Promise<RiotFetchJsonResult> {
  let response: Response
  try {
    response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'X-Riot-Token': apiKey
      }
    })
  } catch {
    return { ok: false, code: 'riot-unavailable', error: 'Riot is unreachable right now. Try again in a minute.' }
  }

  if (response.status === 429) {
    const retryAfter = Number(response.headers.get('Retry-After') ?? '')
    return {
      ok: false,
      code: 'rate-limited',
      error: 'Riot rate limit hit. Try again shortly.',
      retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined
    }
  }
  if (response.status === 404) {
    return { ok: false, code: 'not-found', error: 'No Riot account was found for that Riot ID and region.' }
  }
  if (response.status === 400) {
    return { ok: false, code: 'bad-request', error: 'Use Riot ID format: GameName#TagLine.' }
  }
  if (response.status === 401 || response.status === 403) {
    return { ok: false, code: 'missing-key', error: 'Riot API key is missing or rejected.' }
  }
  if (!response.ok) {
    return { ok: false, code: 'riot-unavailable', error: 'Riot returned an error. Try again shortly.' }
  }

  try {
    return { ok: true, json: await response.json() }
  } catch {
    return { ok: false, code: 'riot-unavailable', error: 'Riot returned unreadable data. Try again shortly.' }
  }
}

export async function getPlayerChampionPool(raw: unknown): Promise<PlayerChampionPoolResponse> {
  const body = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const parsed = parseRiotId(String(body.riotId ?? ''))
  const platform = normalizeRiotPlatform(String(body.platform ?? 'na1'))
  const count = clampCount(body.count)

  if (!parsed || !platform) {
    return { ok: false, code: 'bad-request', error: 'Use Riot ID format GameName#TagLine and a valid platform.' }
  }

  const key = process.env['RIOT_API_KEY']?.trim()
  if (!key) {
    return { ok: false, code: 'missing-key', error: 'Add RIOT_API_KEY to your .env file, then restart Nexus Draft.' }
  }

  const riotId = `${parsed.gameName}#${parsed.tagLine}`
  const ck = cacheKey(riotId, platform, count)
  const cached = cache.get(ck) ?? null
  if (cached && isFreshPlayerChampionPoolProfile(cached)) {
    return { ok: true, profile: cached }
  }

  const region = riotPlatformToRegion(platform)
  const accountPath = `${encodeURIComponent(parsed.gameName)}/${encodeURIComponent(parsed.tagLine)}`
  const accountUrl = `https://${region}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${accountPath}`
  const account = await riotFetchJson(accountUrl, key)
  if (!account.ok) {
    return account
  }
  const puuid = (account.json as { puuid?: unknown })?.puuid
  if (typeof puuid !== 'string' || !puuid) {
    return { ok: false, code: 'not-found', error: 'Riot found the account, but no League profile was available.' }
  }

  const masteryUrl = `https://${platform}.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/${encodeURIComponent(
    puuid
  )}/top?count=${count}`
  const mastery = await riotFetchJson(masteryUrl, key)
  if (!mastery.ok) {
    return mastery
  }

  const entries = normalizeChampionMasteryRows(mastery.json, count)
  const profile = buildPlayerChampionPoolProfile({
    riotId: parsed,
    platform,
    entries
  })
  cache.set(ck, profile)
  return { ok: true, profile }
}
