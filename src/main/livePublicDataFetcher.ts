const DEFAULT_PUBLIC_DATA_BASE_URL = 'https://nexusdraft.lol/data/'
const REQUEST_TIMEOUT_MS = 15000

type LivePublicDataManifest = {
  patch?: unknown
  updatedAt?: unknown
  metaUrl?: unknown
  synergyUrl?: unknown
  buildsUrl?: unknown
  buildsPatch?: unknown
  buildsUpdatedAt?: unknown
}

export type MainLivePublicDataPayload =
  | {
      ok: true
      manifest: unknown
      metaSeed: unknown
      synergySeed: unknown
      /** Champion build paths; optional so a missing file never blocks the meta refresh. */
      buildSeed?: unknown
    }
  | {
      ok: false
      error: string
    }

function publicDataBaseUrl(): string {
  const configured = process.env['NEXUS_PUBLIC_DATA_URL']?.trim()
  const value = configured || DEFAULT_PUBLIC_DATA_BASE_URL
  return value.endsWith('/') ? value : `${value}/`
}

function stringField(raw: unknown): string | null {
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null
}

function resolvePublicDataUrl(path: string, base: string): string {
  return new URL(path, base).toString()
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'user-agent': 'NexusDraft/2.0 live-public-data'
      }
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  } finally {
    clearTimeout(timer)
  }
}

/** Same rule as `isNewerBuildSeed` in shared/draft; kept local so main never bundles the seeds. */
function publishedBuildsAreNewer(manifest: LivePublicDataManifest, have: BuildsHeld): boolean {
  const patch = stringField(manifest.buildsPatch)
  if (!patch || !have.buildsPatch) {
    return true
  }
  const pa = patch.split('.').map(Number)
  const pb = have.buildsPatch.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const da = Number.isFinite(pa[i]) ? pa[i]! : 0
    const db = Number.isFinite(pb[i]) ? pb[i]! : 0
    if (da !== db) {
      return da > db
    }
  }
  return (stringField(manifest.buildsUpdatedAt) ?? '') > (have.buildsUpdatedAt ?? '')
}

export type BuildsHeld = { buildsPatch: string | null; buildsUpdatedAt: string | null }

export async function fetchLivePublicDataPayload(
  have: BuildsHeld = { buildsPatch: null, buildsUpdatedAt: null }
): Promise<MainLivePublicDataPayload> {
  try {
    const base = publicDataBaseUrl()
    const manifestUrl = resolvePublicDataUrl('meta-manifest.json', base)
    const manifest = (await fetchJson(manifestUrl)) as LivePublicDataManifest
    const metaUrl = resolvePublicDataUrl(stringField(manifest.metaUrl) ?? 'publicMetaStatsSeed.json', manifestUrl)
    const synergyUrl = resolvePublicDataUrl(stringField(manifest.synergyUrl) ?? 'publicSynergyStatsSeed.json', manifestUrl)
    const buildsPath = publishedBuildsAreNewer(manifest, have) ? stringField(manifest.buildsUrl) : null
    const buildsUrl = buildsPath ? resolvePublicDataUrl(buildsPath, manifestUrl) : null
    const [metaSeed, synergySeed, buildSeed] = await Promise.all([
      fetchJson(metaUrl),
      fetchJson(synergyUrl),
      buildsUrl ? fetchJson(buildsUrl).catch(() => undefined) : Promise.resolve(undefined)
    ])
    return { ok: true, manifest, metaSeed, synergySeed, ...(buildSeed !== undefined ? { buildSeed } : {}) }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unable to load live public meta data.'
    }
  }
}
