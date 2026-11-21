import {
  applyLivePublicDataPayload,
  buildSeedInfo,
  getPublicMetaStatsInfo,
  isNewerBuildSeed,
  getPublicSynergyStatsInfo,
  type LivePublicDataApplyResult,
  type LivePublicDataPayload
} from '@shared/draft'

type LivePublicDataManifest = {
  patch?: unknown
  updatedAt?: unknown
  metaUrl?: unknown
  synergyUrl?: unknown
  buildsUrl?: unknown
  buildsPatch?: unknown
  buildsUpdatedAt?: unknown
}

export type LivePublicDataRefreshStatus = LivePublicDataApplyResult & {
  checkedAt: string
}

const WEB_MANIFEST_URL = '/data/meta-manifest.json'

function stringField(raw: unknown): string | null {
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null
}

function resolveManifestUrl(path: string, manifestUrl: string): string {
  return new URL(path, new URL(manifestUrl, window.location.origin)).toString()
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while loading ${url}`)
  }
  return response.json()
}

async function fetchWebPayload(): Promise<LivePublicDataPayload> {
  const manifest = (await fetchJson(WEB_MANIFEST_URL)) as LivePublicDataManifest
  const metaUrl = stringField(manifest.metaUrl) ?? 'publicMetaStatsSeed.json'
  const synergyUrl = stringField(manifest.synergyUrl) ?? 'publicSynergyStatsSeed.json'
  const held = buildSeedInfo()
  const buildsUrl = isNewerBuildSeed({ patch: manifest.buildsPatch, updatedAt: manifest.buildsUpdatedAt }, held)
    ? stringField(manifest.buildsUrl)
    : null
  const [metaSeed, synergySeed, buildSeed] = await Promise.all([
    fetchJson(resolveManifestUrl(metaUrl, WEB_MANIFEST_URL)),
    fetchJson(resolveManifestUrl(synergyUrl, WEB_MANIFEST_URL)),
    buildsUrl ? fetchJson(resolveManifestUrl(buildsUrl, WEB_MANIFEST_URL)).catch(() => undefined) : Promise.resolve(undefined)
  ])
  return { manifest, metaSeed, synergySeed, buildSeed, source: 'web-live' }
}

async function fetchDesktopPayload(): Promise<LivePublicDataPayload | null> {
  const bridge = (window as Window & { drafter?: Window['drafter'] }).drafter
  if (!bridge?.getLivePublicData) {
    return null
  }
  const held = buildSeedInfo()
  const payload = await bridge.getLivePublicData({ buildsPatch: held.statsPatch, buildsUpdatedAt: held.updatedAt })
  if (!payload.ok) {
    throw new Error(payload.error)
  }
  return {
    manifest: payload.manifest,
    metaSeed: payload.metaSeed,
    synergySeed: payload.synergySeed,
    buildSeed: payload.buildSeed,
    source: 'desktop-live'
  }
}

export async function refreshLivePublicData(): Promise<LivePublicDataRefreshStatus> {
  const checkedAt = new Date().toISOString()
  try {
    const payload = (await fetchDesktopPayload()) ?? (await fetchWebPayload())
    const result = applyLivePublicDataPayload(payload)
    return { ...result, checkedAt }
  } catch (error) {
    return {
      ok: false,
      applied: false,
      reason: error instanceof Error ? error.message : 'Unable to refresh live public meta.',
      meta: getPublicMetaStatsInfo(),
      synergy: getPublicSynergyStatsInfo(),
      builds: buildSeedInfo(),
      checkedAt
    }
  }
}

export function livePublicDataStatusLine(status: LivePublicDataRefreshStatus | null): string {
  const meta = status?.meta ?? getPublicMetaStatsInfo()
  if (!status) {
    return `Meta patch ${meta.patch}`
  }
  if (!status.ok) {
    return `Meta patch ${meta.patch}; live refresh pending`
  }
  return `Meta patch ${meta.patch}; ${status.applied ? 'refreshed' : 'current'}`
}
