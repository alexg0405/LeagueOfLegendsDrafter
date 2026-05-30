import {
  applyPublicMetaStatsSeed,
  comparePublicMetaPatchLabels,
  getPublicMetaStatsInfo,
  type PublicMetaStatsInfo
} from './metaStats'
import { applyPublicSynergyStatsSeed, getPublicSynergyStatsInfo, type PublicSynergyStatsInfo } from './synergyData'
import { clearEnemyRoleInferenceCaches } from './roleInference'

export type LivePublicDataPayload = {
  manifest?: unknown
  metaSeed: unknown
  synergySeed?: unknown
  source?: string
}

export type LivePublicDataApplyResult = {
  ok: boolean
  applied: boolean
  reason?: string
  meta: PublicMetaStatsInfo
  synergy: PublicSynergyStatsInfo
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

function stringField(raw: unknown): string | null {
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null
}

function payloadPatch(payload: LivePublicDataPayload): string | null {
  if (!isRecord(payload.metaSeed)) {
    return null
  }
  return stringField(payload.metaSeed.patch)
}

function sameMetaInfo(a: PublicMetaStatsInfo, b: PublicMetaStatsInfo): boolean {
  return (
    a.patch === b.patch &&
    a.updatedAt === b.updatedAt &&
    a.source === b.source &&
    a.roleBaseCount === b.roleBaseCount &&
    a.counterCount === b.counterCount
  )
}

export function applyLivePublicDataPayload(payload: LivePublicDataPayload): LivePublicDataApplyResult {
  const currentMeta = getPublicMetaStatsInfo()
  const currentSynergy = getPublicSynergyStatsInfo()
  const patch = payloadPatch(payload)
  if (!patch) {
    return {
      ok: false,
      applied: false,
      reason: 'Live meta payload is missing a patch label.',
      meta: currentMeta,
      synergy: currentSynergy
    }
  }
  if (comparePublicMetaPatchLabels(patch, currentMeta.patch) < 0) {
    return {
      ok: true,
      applied: false,
      reason: `Live meta patch ${patch} is older than bundled patch ${currentMeta.patch}.`,
      meta: currentMeta,
      synergy: currentSynergy
    }
  }

  const source = payload.source ?? 'live'
  const nextMeta = applyPublicMetaStatsSeed(payload.metaSeed, source)
  if (!nextMeta) {
    return {
      ok: false,
      applied: false,
      reason: 'Live meta payload did not contain usable role rows.',
      meta: currentMeta,
      synergy: currentSynergy
    }
  }

  let nextSynergy = currentSynergy
  if (payload.synergySeed != null) {
    const synergy = isRecord(payload.synergySeed) ? payload.synergySeed : null
    const synergyPatch = synergy ? stringField(synergy.patch) : null
    if (synergyPatch === nextMeta.patch) {
      nextSynergy = applyPublicSynergyStatsSeed(payload.synergySeed, source) ?? getPublicSynergyStatsInfo()
    } else {
      nextSynergy = applyPublicSynergyStatsSeed(payload.synergySeed, source) ?? getPublicSynergyStatsInfo()
    }
  }

  clearEnemyRoleInferenceCaches()
  return {
    ok: true,
    applied: !sameMetaInfo(currentMeta, nextMeta),
    meta: nextMeta,
    synergy: nextSynergy
  }
}
