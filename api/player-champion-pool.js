const MAX_TOP_MASTERY = 20
const PROFILE_MAX_AGE_MS = 6 * 60 * 60 * 1000

const PLATFORM_TO_REGION = {
  na1: 'americas',
  br1: 'americas',
  la1: 'americas',
  la2: 'americas',
  euw1: 'europe',
  eun1: 'europe',
  tr1: 'europe',
  ru: 'europe',
  kr: 'asia',
  jp1: 'asia',
  oc1: 'sea',
  ph2: 'sea',
  sg2: 'sea',
  th2: 'sea',
  tw2: 'sea',
  vn2: 'sea'
}

const cache = new Map()

function parseRiotId(value) {
  const trimmed = String(value || '').trim()
  const hash = trimmed.lastIndexOf('#')
  if (hash <= 0 || hash === trimmed.length - 1) {
    return null
  }
  const gameName = trimmed.slice(0, hash).trim()
  const tagLine = trimmed.slice(hash + 1).trim()
  return gameName && tagLine ? { gameName, tagLine } : null
}

function normalizePlatform(value) {
  const platform = String(value || 'na1').trim().toLowerCase()
  if (platform === 'oce1') {
    return 'oc1'
  }
  return PLATFORM_TO_REGION[platform] ? platform : null
}

function clampCount(value) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(1, Math.min(MAX_TOP_MASTERY, Math.trunc(n))) : MAX_TOP_MASTERY
}

function preferenceForRank(rank) {
  if (rank <= 5) {
    return 'main'
  }
  if (rank <= 15) {
    return 'comfortable'
  }
  return 'learning'
}

function normalizeMasteryRows(rows, count) {
  if (!Array.isArray(rows)) {
    return []
  }
  const entries = []
  for (const row of rows) {
    const championId = Number(row?.championId)
    if (!Number.isFinite(championId) || championId <= 0) {
      continue
    }
    const rank = entries.length + 1
    entries.push({
      championId: Math.trunc(championId),
      championLevel: Math.max(0, Math.trunc(Number(row?.championLevel) || 0)),
      championPoints: Math.max(0, Math.trunc(Number(row?.championPoints) || 0)),
      rank,
      preference: preferenceForRank(rank)
    })
    if (entries.length >= count) {
      break
    }
  }
  return entries
}

function isFresh(profile) {
  const fetchedAt = Date.parse(profile?.fetchedAt || '')
  return Number.isFinite(fetchedAt) && Date.now() - fetchedAt >= 0 && Date.now() - fetchedAt < PROFILE_MAX_AGE_MS
}

function cacheKey(riotId, platform, count) {
  return `${platform}:${riotId.trim().toLowerCase()}:${count}`
}

async function riotFetchJson(url, apiKey) {
  let response
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
    const retryAfter = Number(response.headers.get('Retry-After') || '')
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ ok: false, code: 'bad-request', error: 'POST only' })
    return
  }

  const apiKey = (process.env.RIOT_API_KEY || '').trim()
  if (!apiKey) {
    res.status(501).json({
      ok: false,
      code: 'missing-key',
      error: 'Riot import is not configured yet. Add RIOT_API_KEY in Vercel project environment variables.'
    })
    return
  }

  let body
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
  } catch {
    res.status(400).json({
      ok: false,
      code: 'bad-request',
      error: 'Request body must be valid JSON.'
    })
    return
  }
  const parsed = parseRiotId(body.riotId)
  const platform = normalizePlatform(body.platform)
  const count = clampCount(body.count)
  if (!parsed || !platform) {
    res.status(400).json({
      ok: false,
      code: 'bad-request',
      error: 'Use Riot ID format GameName#TagLine and a valid platform.'
    })
    return
  }

  const riotId = `${parsed.gameName}#${parsed.tagLine}`
  const ck = cacheKey(riotId, platform, count)
  const cached = cache.get(ck)
  if (isFresh(cached)) {
    res.setHeader('Cache-Control', 'private, max-age=300')
    res.status(200).json({ ok: true, profile: cached })
    return
  }

  const region = PLATFORM_TO_REGION[platform]
  const accountPath = `${encodeURIComponent(parsed.gameName)}/${encodeURIComponent(parsed.tagLine)}`
  const account = await riotFetchJson(
    `https://${region}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${accountPath}`,
    apiKey
  )
  if (!account.ok) {
    res.status(account.code === 'rate-limited' ? 429 : account.code === 'not-found' ? 404 : 502).json(account)
    return
  }
  const puuid = account.json?.puuid
  if (typeof puuid !== 'string' || !puuid) {
    res.status(404).json({
      ok: false,
      code: 'not-found',
      error: 'Riot found the account, but no League profile was available.'
    })
    return
  }

  const mastery = await riotFetchJson(
    `https://${platform}.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/${encodeURIComponent(
      puuid
    )}/top?count=${count}`,
    apiKey
  )
  if (!mastery.ok) {
    res.status(mastery.code === 'rate-limited' ? 429 : mastery.code === 'not-found' ? 404 : 502).json(mastery)
    return
  }

  const profile = {
    riotId,
    gameName: parsed.gameName,
    tagLine: parsed.tagLine,
    platform,
    region,
    fetchedAt: new Date().toISOString(),
    source: 'riot-mastery',
    entries: normalizeMasteryRows(mastery.json, count)
  }
  cache.set(ck, profile)
  res.setHeader('Cache-Control', 'private, max-age=300')
  res.status(200).json({ ok: true, profile })
}
