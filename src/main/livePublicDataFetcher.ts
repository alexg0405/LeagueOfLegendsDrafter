const DEFAULT_PUBLIC_DATA_BASE_URL = 'https://nexusdraft.lol/data/'
const REQUEST_TIMEOUT_MS = 15000

type LivePublicDataManifest = {
  patch?: unknown
  updatedAt?: unknown
  metaUrl?: unknown
  synergyUrl?: unknown
}

export type MainLivePublicDataPayload =
  | {
      ok: true
      manifest: unknown
      metaSeed: unknown
      synergySeed: unknown
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

export async function fetchLivePublicDataPayload(): Promise<MainLivePublicDataPayload> {
  try {
    const base = publicDataBaseUrl()
    const manifestUrl = resolvePublicDataUrl('meta-manifest.json', base)
    const manifest = (await fetchJson(manifestUrl)) as LivePublicDataManifest
    const metaUrl = resolvePublicDataUrl(stringField(manifest.metaUrl) ?? 'publicMetaStatsSeed.json', manifestUrl)
    const synergyUrl = resolvePublicDataUrl(stringField(manifest.synergyUrl) ?? 'publicSynergyStatsSeed.json', manifestUrl)
    const [metaSeed, synergySeed] = await Promise.all([fetchJson(metaUrl), fetchJson(synergyUrl)])
    return { ok: true, manifest, metaSeed, synergySeed }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unable to load live public meta data.'
    }
  }
}
