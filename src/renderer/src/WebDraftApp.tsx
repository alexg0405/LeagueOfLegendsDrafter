import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyEvent
} from 'react'
import {
  ddragonChampionImageUrl,
  getLatestDDragonVersion,
  loadChampionMaps,
  loadItemMaps,
  type ChampionLite,
  type ItemLite
} from '@shared/dataDragon'
import {
  bestAllySlotsForSuggestion,
  bestEnemySlotsForSuggestion,
  championPoolPreferenceToComfort,
  ENGINE_V1_LABEL,
  focusedContextSlots,
  formatRuneTipNote,
  importedProfileToPreferences,
  inferEnemyRoleAssignments,
  mergeChampionPoolPreferences,
  MEANINGFUL_TEAM_SYNERGY_DELTA,
  RIOT_PLATFORMS,
  resolveChampionName,
  validatePlayerChampionPoolProfile,
  type DraftDeltaListMode,
  type DraftIntel,
  type DraftRole,
  type DraftSnapshot,
  type EnemyRoleInference,
  type ChampionPoolPreference,
  type PlayerChampionPoolProfile,
  type PlayerChampionPoolResponse,
  type PickSuggestion,
  type RecommendationPoolMode,
  type RiotPlatform,
  type SuggestionContextSlot
} from '@shared/draft'
import { DraftItemMatrixView, DraftItemPlanBlock as ItemPlanBlock, MicroLabel, NexusPanel, NexusPlus } from './nexus-ui'
import { idbGetChampions, idbGetItems, idbSetChampions, idbSetItems } from './web/ddragonIndexedDbCache'
import {
  clearPersistedWebDraft,
  loadPersistedWebDraft,
  savePersistedWebDraft
} from './web/persistedWebDraft'
import { WebDraftLabPage } from './web/WebDraftLabPage'
import { WebSuggestionsPage } from './web/WebSuggestionsPage'
import { nexusWebTrack } from './web/webAnalytics'
import {
  outlineGlitchCtaClass,
  readWebRoute,
  solidGlitchCtaClass,
  VisitorCounter,
  webFieldClass,
  webFieldClassCompact,
  type WebRoute
} from './web/webUi'
import {
  livePublicDataStatusLine,
  refreshLivePublicData,
  type LivePublicDataRefreshStatus
} from './livePublicDataClient'
import { buildDraftIntelAsync } from './draftIntel/draftIntelClient'
import { emitNexusEffect } from './effects'
import { buildDraftItemMatrixPlansAsync, type ItemMatrixRequestOptions } from './itemMatrix/itemMatrixClient'
import { ParticleWordMark } from './ParticleWordLoader'
import { suggestPicksAsync } from './recommend/recommendClient'

const ROLES: Exclude<DraftRole, 'unknown'>[] = ['top', 'jungle', 'middle', 'bottom', 'support']
const DEFAULT_WEB_ROLLOUTS = 40
const MAX_WEB_ROLLOUTS = 200
const LS_WEB_CHAMPION_POOL_PREFS = 'nexusdraft.web.v1.championPoolPrefs'
const LS_WEB_PLAYER_POOL_PROFILE = 'nexusdraft.web.v1.playerChampionPoolProfile'
const LS_WEB_RECOMMENDATION_POOL_MODE = 'nexusdraft.web.v1.recommendationPoolMode'
const EXE_DOWNLOAD_FILE = 'Nexus-Draft-Portable-4.0.0.exe'
const EXE_DOWNLOAD_URL = `/downloads/${EXE_DOWNLOAD_FILE}`
const GITHUB_PROFILE_URL = 'https://github.com/alexg0405'
const LIVE_META_REFRESH_MS = 30 * 60 * 1000
const WEB_PLAYER_POOL_IMPORT_ENABLED = false
const WEB_VISION_SCREENSHOT_ENABLED = false
const WEB_PLAYER_POOL_IMPORT_WIP_MESSAGE =
  'Riot mastery import is temporarily WIP. Manual My Champs weights still work below.'
const WEB_VISION_SCREENSHOT_WIP_MESSAGE =
  'Screenshot autofill is temporarily WIP. Type champions manually for now.'

function scheduleIdleWork(work: () => void): () => void {
  const idleWindow = window as Window & {
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
    cancelIdleCallback?: (handle: number) => void
  }
  if (typeof idleWindow.requestIdleCallback === 'function') {
    const handle = idleWindow.requestIdleCallback(work, { timeout: 1200 })
    return () => idleWindow.cancelIdleCallback?.(handle)
  }
  const handle = window.setTimeout(work, 80)
  return () => window.clearTimeout(handle)
}

function mergeItemMatrixPlans(
  current: DraftIntel['itemMatrixPlans'] | null,
  incoming: DraftIntel['itemMatrixPlans']
): DraftIntel['itemMatrixPlans'] {
  const byChampion = new Map<number, NonNullable<DraftIntel['itemMatrixPlans']>[number]>()
  for (const plan of current ?? []) {
    byChampion.set(plan.championId, plan)
  }
  for (const plan of incoming ?? []) {
    byChampion.set(plan.championId, plan)
  }
  return Array.from(byChampion.values())
}

type ManualBoard = {
  ally: Record<Exclude<DraftRole, 'unknown'>, number | null>
  enemy: Record<Exclude<DraftRole, 'unknown'>, number | null>
}

type ManualInputBoard = {
  ally: Record<Exclude<DraftRole, 'unknown'>, string>
  enemy: Record<Exclude<DraftRole, 'unknown'>, string>
}

type ActiveChampionInput = {
  side: 'ally' | 'enemy'
  role: Exclude<DraftRole, 'unknown'>
} | null

type VisionPick = {
  role?: string
  championName?: string
}

type VisionResponse = {
  allyPicks?: VisionPick[]
  enemyPicks?: VisionPick[]
  allies?: VisionPick[]
  enemies?: VisionPick[]
  opponentPicks?: VisionPick[]
  theirTeam?: VisionPick[]
  myTeam?: VisionPick[]
  myRole?: string
  confidence?: string
  error?: string
}

type ChampionPoolPrefs = Record<string, ChampionPoolPreference>
type ChampionSearchRow = {
  champion: ChampionLite
  normalizedName: string
}

type PoolUndoState = {
  championId: number
  championName: string
  previousManualPreference: ChampionPoolPreference | null
}

const POOL_DRAG_MIME = 'application/x-nexus-pool-champion-id'
const LEGACY_AATROX_PLACEHOLDER_PREFS: ChampionPoolPrefs = { '266': 'main' }

function stripLegacyChampionPoolPlaceholder(prefs: ChampionPoolPrefs): ChampionPoolPrefs {
  const keys = Object.keys(prefs)
  if (
    keys.length === 1 &&
    prefs[Object.keys(LEGACY_AATROX_PLACEHOLDER_PREFS)[0]] === LEGACY_AATROX_PLACEHOLDER_PREFS['266']
  ) {
    return {}
  }
  return prefs
}

function parsePoolDragChampionId(event: ReactDragEvent<HTMLElement>): number | null {
  const raw = event.dataTransfer.getData(POOL_DRAG_MIME) || event.dataTransfer.getData('text/plain')
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null
}

const CHAMPION_POOL_PREFERENCES: { value: ChampionPoolPreference; label: string }[] = [
  { value: 'main', label: 'Main' },
  { value: 'comfortable', label: 'Comfort' },
  { value: 'learning', label: 'Learning' },
  { value: 'never', label: 'Avoid' }
]

function emptyBoard(): ManualBoard {
  const row = ROLES.reduce(
    (acc, role) => {
      acc[role] = null
      return acc
    },
    {} as Record<Exclude<DraftRole, 'unknown'>, number | null>
  )
  return { ally: { ...row }, enemy: { ...row } }
}

function emptyInputBoard(): ManualInputBoard {
  const row = ROLES.reduce(
    (acc, role) => {
      acc[role] = ''
      return acc
    },
    {} as Record<Exclude<DraftRole, 'unknown'>, string>
  )
  return { ally: { ...row }, enemy: { ...row } }
}

function cloneBoard(b: ManualBoard): ManualBoard {
  return { ally: { ...b.ally }, enemy: { ...b.enemy } }
}

function cloneInputs(b: ManualInputBoard): ManualInputBoard {
  return { ally: { ...b.ally }, enemy: { ...b.enemy } }
}

function readChampionPoolPrefs(): ChampionPoolPrefs {
  try {
    const raw = localStorage.getItem(LS_WEB_CHAMPION_POOL_PREFS)
    if (!raw) {
      return {}
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: ChampionPoolPrefs = {}
    for (const [id, pref] of Object.entries(parsed)) {
      if (!/^\d+$/.test(id)) {
        continue
      }
      if (pref === 'main' || pref === 'comfortable' || pref === 'learning' || pref === 'never') {
        out[id] = pref
      }
    }
    return stripLegacyChampionPoolPlaceholder(out)
  } catch {
    return {}
  }
}

function readPlayerChampionPoolProfile(): PlayerChampionPoolProfile | null {
  try {
    const raw = localStorage.getItem(LS_WEB_PLAYER_POOL_PROFILE)
    if (!raw) {
      return null
    }
    return validatePlayerChampionPoolProfile(JSON.parse(raw))
  } catch {
    return null
  }
}

function readRecommendationPoolMode(): RecommendationPoolMode {
  try {
    const raw = localStorage.getItem(LS_WEB_RECOMMENDATION_POOL_MODE)
    if (raw === 'my-champs' || raw === 'all-champs') {
      return raw
    }
  } catch {
    /* ignore */
  }
  return 'all-champs'
}

function parseChampionId(value: string): number | null {
  const id = Number(value)
  return Number.isFinite(id) && id > 0 ? id : null
}

function roleLabel(role: DraftRole): string {
  if (role === 'bottom') {
    return 'adc'
  }
  if (role === 'middle') {
    return 'mid'
  }
  return role
}

function normalizeChampionQuery(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

function normalizeRole(value: string | undefined): Exclude<DraftRole, 'unknown'> | null {
  const v = value?.trim().toLowerCase()
  if (v === 'top' || v === 'jungle' || v === 'middle' || v === 'support') {
    return v
  }
  if (v === 'mid') {
    return 'middle'
  }
  if (v === 'bottom' || v === 'bot' || v === 'adc') {
    return 'bottom'
  }
  if (v === 'utility' || v === 'sup') {
    return 'support'
  }
  if (v === 'jg' || v === 'jgl') {
    return 'jungle'
  }
  return null
}

function fileToImageDataUrl(file: File, maxSide = 1400): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read image file.'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Could not decode image file.'))
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
        const width = Math.max(1, Math.round(img.width * scale))
        const height = Math.max(1, Math.round(img.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Could not prepare image for upload.'))
          return
        }
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.82))
      }
      img.src = String(reader.result ?? '')
    }
    reader.readAsDataURL(file)
  })
}

function dataUrlToBase64(dataUrl: string): string {
  return dataUrl.includes(',') ? dataUrl.slice(dataUrl.indexOf(',') + 1) : dataUrl
}

async function fetchWebPlayerChampionPool(
  riotId: string,
  platform: RiotPlatform
): Promise<PlayerChampionPoolResponse> {
  const response = await fetch('/api/player-champion-pool', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ riotId, platform, count: 20 })
  })
  const data = (await response.json()) as PlayerChampionPoolResponse
  if (!response.ok && data && data.ok === false) {
    return data
  }
  return data
}

function slotPicksToContextSlots(
  slots: DraftSnapshot['ally'],
  enemyRoleInference?: EnemyRoleInference[] | null
): SuggestionContextSlot[] {
  return slots.map((p, index) => {
    const inferred = enemyRoleInference?.find((row) => row.enemyIndex === index && row.championId === p.championId)
    return {
      role: p.role,
      championName: p.championName,
      championId: p.championId,
      inferredRole: inferred?.inferredRole ?? null,
      roleProbabilities: inferred?.roleProbabilities ?? null
    }
  })
}

function SuggestionRowsSkeleton() {
  return (
    <ul className="list-none m-0 p-0 space-y-2" aria-hidden>
      {Array.from({ length: 8 }, (_, i) => (
        <li key={i} className="h-[5.5rem] animate-pulse rounded-lg bg-nexus-surface-2/50" />
      ))}
    </ul>
  )
}

function buildSnapshot(board: ManualBoard, role: Exclude<DraftRole, 'unknown'>, names: ReadonlyMap<number, string>): DraftSnapshot {
  const localCellId = ROLES.indexOf(role)
  const slot = (side: 'ally' | 'enemy', slotRole: Exclude<DraftRole, 'unknown'>, offset: number) => {
    const id = board[side][slotRole]
    return {
      role: slotRole,
      championId: id,
      championName: id != null ? names.get(id) ?? resolveChampionName(id, names) : null,
      cellId: ROLES.indexOf(slotRole) + offset
    }
  }
  return {
    ally: ROLES.map((r) => slot('ally', r, 0)),
    enemy: ROLES.map((r) => slot('enemy', r, 5)),
    myTeam: null,
    myRole: role,
    localPlayerCellId: localCellId,
    bans: [],
    myPickOrder: null
  }
}

function ChampionIcon({
  championId,
  champions,
  ddragonVersion
}: {
  championId: number | null
  champions: ChampionLite[]
  ddragonVersion: string | null
}) {
  const champion = championId == null ? null : champions.find((c) => c.id === championId)
  const src = champion && ddragonVersion ? ddragonChampionImageUrl(ddragonVersion, champion.key) : null
  if (!src) {
    return <span className="h-8 w-8 shrink-0 border border-nexus-line bg-nexus-bg" aria-hidden />
  }
  return (
    <img
      className="h-8 w-8 shrink-0 border border-nexus-line object-cover"
      src={src}
      alt=""
      width={32}
      height={32}
      loading="lazy"
      decoding="async"
    />
  )
}

function PoolTrashIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M9 6V4h6v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M5 7h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="M8 10v9h8v-9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10.5 11.5v5M13.5 11.5v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function SuggestionContextPortrait({
  slot,
  champions,
  ddragonVersion,
  nameById,
  tone
}: {
  slot: SuggestionContextSlot
  champions: ChampionLite[]
  ddragonVersion: string | null
  nameById: ReadonlyMap<number, string>
  tone: 'ally' | 'enemy'
}) {
  const title =
    slot.championId != null && slot.championId > 0
      ? (slot.championName?.trim() ? slot.championName : resolveChampionName(slot.championId, nameById))
      : '—'
  const champion = slot.championId == null ? null : champions.find((c) => c.id === slot.championId)
  const src = champion && ddragonVersion ? ddragonChampionImageUrl(ddragonVersion, champion.key) : null
  const toneClass =
    tone === 'ally'
      ? 'border-nexus-lime/70 bg-nexus-lime/8 shadow-[0_0_8px_rgba(35,213,176,0.12)]'
      : 'border-nexus-red/70 bg-nexus-red/8 shadow-[0_0_8px_rgba(248,113,113,0.12)]'
  return (
    <span
      className={['inline-flex h-7 w-7 items-center justify-center border p-0.5', toneClass].join(' ')}
      title={title}
    >
      {src ? <img className="h-full w-full object-cover" src={src} alt="" width={28} height={28} loading="lazy" decoding="async" /> : <span className="h-full w-full bg-nexus-bg" aria-hidden />}
    </span>
  )
}

type SuggestionBadge = { label: string; tone: 'lime' | 'red' | 'yellow' | 'muted' }

function suggestionBadges(
  suggestion: PickSuggestion,
  matchupPlan?: DraftIntel['matchupPlans'][number] | null
): SuggestionBadge[] {
  const badges: SuggestionBadge[] = []
  if (suggestion.winRateDelta != null && Math.abs(suggestion.winRateDelta) >= 0.01) {
    badges.push({
      label: `${suggestion.winRateDelta >= 0 ? '+' : ''}${(suggestion.winRateDelta * 100).toFixed(1)} delta`,
      tone: suggestion.winRateDelta >= 0 ? 'lime' : 'red'
    })
  }
  if (suggestion.reasons.includes('team_synergy')) badges.push({ label: 'synergy', tone: 'lime' })
  if (suggestion.reasons.includes('lane_counter')) badges.push({ label: 'lane counter', tone: 'yellow' })
  if (suggestion.reasons.includes('blind_safe')) badges.push({ label: 'blind safe', tone: 'muted' })
  if (matchupPlan?.itemPlan?.matrixRows?.length) badges.push({ label: 'items ready', tone: 'lime' })
  return badges.slice(0, 4)
}

function suggestionBadgeClass(tone: SuggestionBadge['tone']): string {
  switch (tone) {
    case 'lime':
      return 'border-nexus-lime/45 bg-nexus-lime/10 text-nexus-lime/90'
    case 'red':
      return 'border-nexus-red/45 bg-nexus-red/10 text-nexus-red/85'
    case 'yellow':
      return 'border-nexus-yellow/45 bg-nexus-yellow/10 text-nexus-yellow/90'
    default:
      return 'border-nexus-line/70 bg-nexus-bg/45 text-nexus-muted'
  }
}

function SuggestionRow({
  suggestion,
  champions,
  ddragonVersion,
  snapshot,
  myRole,
  nameById,
  enemyRoleInference,
  matchupPlan,
  onOpenItemMatrix
}: {
  suggestion: PickSuggestion
  champions: ChampionLite[]
  ddragonVersion: string | null
  snapshot: DraftSnapshot
  myRole: Exclude<DraftRole, 'unknown'>
  nameById: ReadonlyMap<number, string>
  enemyRoleInference?: EnemyRoleInference[] | null
  matchupPlan?: DraftIntel['matchupPlans'][number] | null
  onOpenItemMatrix?: (plan: DraftIntel['matchupPlans'][number]) => void
}) {
  const poolRole: DraftRole = myRole
  const showTeamSynergy =
    suggestion.reasons.includes('team_synergy') &&
    suggestion.winRateDelta != null &&
    Math.abs(suggestion.winRateDelta) >= MEANINGFUL_TEAM_SYNERGY_DELTA
  const allyCtx = useMemo(() => slotPicksToContextSlots(snapshot.ally), [snapshot.ally])
  const enemyCtx = useMemo(() => slotPicksToContextSlots(snapshot.enemy, enemyRoleInference), [snapshot.enemy, enemyRoleInference])
  const { synergySlots, goodVsSlots } = useMemo(() => {
    const rankedAllies = bestAllySlotsForSuggestion(suggestion.championId, poolRole, allyCtx, null, 2)
    const rankedEnemies = bestEnemySlotsForSuggestion(suggestion.championId, poolRole, enemyCtx, 2)
    const allyFallback = focusedContextSlots(allyCtx, poolRole, 'ally')
    const enemyFallback = focusedContextSlots(enemyCtx, poolRole, 'enemy')
    return {
      synergySlots: showTeamSynergy ? (rankedAllies.length ? rankedAllies : allyFallback) : [],
      goodVsSlots: rankedEnemies.length ? rankedEnemies : enemyFallback
    }
  }, [suggestion.championId, showTeamSynergy, poolRole, allyCtx, enemyCtx])
  const tip = formatRuneTipNote(
    suggestion.runes?.note,
    suggestion.buildProfile?.buildHint ?? 'Use this pick when it fits your lane matchup and team damage profile.'
  )
  const badges = useMemo(() => suggestionBadges(suggestion, matchupPlan), [matchupPlan, suggestion])
  return (
    <li className="relative overflow-hidden rounded-lg border border-white/[0.07] border-l-2 border-l-nexus-lime/45 bg-gradient-to-br from-nexus-surface-2/95 to-nexus-bg/90 px-3 py-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.2)] transition-colors hover:border-nexus-lime/30">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-nexus-lime/55 via-transparent to-transparent" aria-hidden />
      <div className="flex gap-2.5">
        <ChampionIcon championId={suggestion.championId} champions={champions} ddragonVersion={ddragonVersion} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-2 font-mono text-sm font-bold leading-tight">
            <div className="min-w-0">
              <span className="text-nexus-lime/95">{suggestion.championName}</span>
            <span className="text-nexus-muted"> · </span>
              <span className="text-nexus-text/90 tabular-nums">{suggestion.score}</span>
            </div>
            {suggestion.isLockedPick && (
              <span className="shrink-0 rounded-sm border border-nexus-lime/60 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-nexus-lime/85">
                Picked
              </span>
            )}
          </div>
          {badges.length > 0 ? (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {badges.map((badge) => (
                <span
                  key={`${suggestion.championId}-${badge.label}`}
                  className={`inline-flex border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] ${suggestionBadgeClass(badge.tone)}`}
                >
                  {badge.label}
                </span>
              ))}
            </div>
          ) : null}
          {suggestion.buildProfile && (
            <p className="m-0 mt-1.5 text-[11px] font-mono uppercase tracking-[0.16em] text-nexus-muted/75">
              {suggestion.buildProfile.archetype}
            </p>
          )}
          {suggestion.baseWinRate != null && suggestion.contextWinRate != null && suggestion.winRateDelta != null && (
            <div className="mt-1.5 font-mono text-xs text-nexus-muted tabular-nums">
              {(suggestion.baseWinRate * 100).toFixed(1)}% → {(suggestion.contextWinRate * 100).toFixed(1)}%
              <span className={suggestion.winRateDelta >= 0 ? ' text-nexus-lime/80' : ' text-nexus-red/75'}>
                {' '}
                ({suggestion.winRateDelta >= 0 ? '+' : ''}
                {(suggestion.winRateDelta * 100).toFixed(1)}%)
              </span>
            </div>
          )}
        </div>
      </div>
      <div className="mt-2.5 divide-y divide-white/[0.07] border-t border-white/[0.07] font-mono text-[11px] leading-snug text-nexus-text/85">
        <div
          className="py-2.5"
          role="group"
          aria-label={showTeamSynergy ? 'Team synergy and good-versus lobby context for this pick' : 'Good-versus lobby context for this pick'}
        >
          <div
            className={[
              'grid gap-2 rounded-md border border-white/[0.12] bg-nexus-bg/40 p-2 sm:gap-1.5',
              showTeamSynergy ? 'grid-cols-2' : 'grid-cols-1'
            ].join(' ')}
            aria-label={showTeamSynergy ? 'Champion faces for best ally synergy and good-versus enemies' : 'Champion faces for good-versus enemies'}
          >
            {showTeamSynergy && (
              <div className="min-w-0 border-l-4 border-nexus-lime bg-nexus-surface-2/40 py-1 pl-2 pr-1">
                <div className="text-[0.65rem] uppercase tracking-[0.1em] text-nexus-lime/90">Team synergy</div>
                <div className="mt-1 inline-flex min-h-7 max-w-full flex-wrap items-center gap-1 text-nexus-text/90">
                  {synergySlots.length
                    ? synergySlots.map((slot) => (
                        <SuggestionContextPortrait
                          key={`syn-${suggestion.championId}-${slot.role}-${slot.championId}`}
                          slot={slot}
                          champions={champions}
                          ddragonVersion={ddragonVersion}
                          nameById={nameById}
                          tone="ally"
                        />
                      ))
                    : 'pending'}
                </div>
              </div>
            )}
            <div className="min-w-0 border-l-4 border-nexus-red bg-nexus-surface-2/40 py-1 pl-2 pr-1">
              <div className="text-[0.65rem] uppercase tracking-[0.1em] text-nexus-red/85">Good vs</div>
              <div className="mt-1 inline-flex min-h-7 max-w-full flex-wrap items-center gap-1 text-nexus-text/90">
                {goodVsSlots.length
                  ? goodVsSlots.map((slot) => (
                      <SuggestionContextPortrait
                        key={`vs-${suggestion.championId}-${slot.role}-${slot.championId}`}
                        slot={slot}
                        champions={champions}
                        ddragonVersion={ddragonVersion}
                        nameById={nameById}
                        tone="enemy"
                      />
                    ))
                  : 'pending'}
              </div>
            </div>
          </div>
        </div>
        {suggestion.runes && (
          <details className="group open:pb-0">
            <summary className="nexus-focus flex cursor-pointer list-none items-center justify-between gap-2 py-2 uppercase tracking-[0.1em] text-nexus-muted marker:hidden hover:text-nexus-text/90">
              <span>Runes</span>
              <span className="text-nexus-lime/70 transition-transform group-open:rotate-45">+</span>
            </summary>
            <div className="pb-2 pt-0.5 pl-0">
              <span className="text-nexus-lime/80">{suggestion.runes.keystone}</span>
              <span className="text-nexus-muted/90"> / {suggestion.runes.primaryTree}</span>
              <div className="mt-0.5 text-nexus-muted/80">{suggestion.runes.secondary}</div>
            </div>
          </details>
        )}
        {matchupPlan?.itemPlan && (
          <details className="group open:pb-0">
            <summary className="nexus-focus flex cursor-pointer list-none items-center justify-between gap-2 py-2 uppercase tracking-[0.1em] text-nexus-muted marker:hidden hover:text-nexus-text/90">
              <span>Build</span>
              <span className="text-nexus-lime/70 transition-transform group-open:rotate-45">+</span>
            </summary>
            <div className="pb-2 pt-0.5">
            <ItemPlanBlock
              itemPlan={matchupPlan.itemPlan}
              ddragonVersion={ddragonVersion}
              limit={4}
              showHeader={false}
              onOpenMatrix={() => onOpenItemMatrix?.(matchupPlan)}
            />
            </div>
          </details>
        )}
        <details className="group">
          <summary className="nexus-focus flex cursor-pointer list-none items-center justify-between gap-2 py-2 uppercase tracking-[0.1em] text-nexus-muted marker:hidden hover:text-nexus-text/90">
            <span>Tips</span>
            <span className="text-nexus-lime/70 transition-transform group-open:rotate-45">+</span>
          </summary>
          <div className="pb-2 text-nexus-text/80">
            <span>{tip}</span>
            {suggestion.buildProfile?.itemHint && (
              <p className="m-0 mt-1.5 text-nexus-muted/90">
                <span className="text-nexus-lime/80">Items:</span> {suggestion.buildProfile.itemHint}
              </p>
            )}
            {matchupPlan && (
              <p className="m-0 mt-1.5 text-nexus-muted/90">
                <span className="text-nexus-lime/80">Plan:</span> {matchupPlan.summonerSpells}; {matchupPlan.startingItem}
              </p>
            )}
            {suggestion.buildProfile && suggestion.buildProfile.tagsLine !== '—' && (
              <p className="m-0 mt-1.5 text-nexus-muted/85">{suggestion.buildProfile.tagsLine}</p>
            )}
          </div>
        </details>
      </div>
    </li>
  )
}

export function WebDraftApp() {
  const initialPersistedDraft = useMemo(() => loadPersistedWebDraft(), [])
  const initialPlayerPoolProfile = useMemo(readPlayerChampionPoolProfile, [])
  const [ddragonVersion, setDdragonVersion] = useState<string | null>(null)
  const [champions, setChampions] = useState<ChampionLite[]>([])
  const [items, setItems] = useState<ItemLite[]>([])
  const [nameById, setNameById] = useState(() => new Map<number, string>())
  const [loadError, setLoadError] = useState<string | null>(null)
  const [liveDataRevision, setLiveDataRevision] = useState(0)
  const [liveDataStatus, setLiveDataStatus] = useState<LivePublicDataRefreshStatus | null>(null)
  const [board, setBoard] = useState<ManualBoard>(() =>
    initialPersistedDraft ? cloneBoard(initialPersistedDraft.board as ManualBoard) : emptyBoard()
  )
  const [championInputs, setChampionInputs] = useState<ManualInputBoard>(() =>
    initialPersistedDraft ? cloneInputs(initialPersistedDraft.championInputs) : emptyInputBoard()
  )
  const [role, setRole] = useState<Exclude<DraftRole, 'unknown'>>(() => initialPersistedDraft?.role ?? 'middle')
  const [rollouts, setRollouts] = useState(() => initialPersistedDraft?.rollouts ?? DEFAULT_WEB_ROLLOUTS)
  const [deltaMode, setDeltaMode] = useState<DraftDeltaListMode>(() => initialPersistedDraft?.deltaMode ?? 'best')
  const [visionStatus, setVisionStatus] = useState<string>(
    WEB_VISION_SCREENSHOT_ENABLED
      ? 'Upload a champion select screenshot to autofill the board.'
      : WEB_VISION_SCREENSHOT_WIP_MESSAGE
  )
  const [visionBusy, setVisionBusy] = useState(false)
  const [activeChampionInput, setActiveChampionInput] = useState<ActiveChampionInput>(null)
  const [listCursor, setListCursor] = useState(0)
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null)
  const [championPoolPrefs, setChampionPoolPrefs] = useState<ChampionPoolPrefs>(readChampionPoolPrefs)
  const [playerPoolProfile, setPlayerPoolProfile] = useState<PlayerChampionPoolProfile | null>(initialPlayerPoolProfile)
  const [recommendationPoolMode, setRecommendationPoolMode] = useState<RecommendationPoolMode>(
    readRecommendationPoolMode
  )
  const [riotIdInput, setRiotIdInput] = useState(() => initialPlayerPoolProfile?.riotId ?? '')
  const [riotPlatform, setRiotPlatform] = useState<RiotPlatform>(() => initialPlayerPoolProfile?.platform ?? 'na1')
  const [playerPoolStatus, setPlayerPoolStatus] = useState<string | null>(
    WEB_PLAYER_POOL_IMPORT_ENABLED ? null : WEB_PLAYER_POOL_IMPORT_WIP_MESSAGE
  )
  const [playerPoolBusy, setPlayerPoolBusy] = useState(false)
  const [poolChampionId, setPoolChampionId] = useState<number | null>(null)
  const [poolPreference, setPoolPreference] = useState<ChampionPoolPreference>('comfortable')
  const [poolUndoStack, setPoolUndoStack] = useState<PoolUndoState[]>([])
  const [poolTrashActive, setPoolTrashActive] = useState(false)
  const [itemMatrixOpen, setItemMatrixOpen] = useState(false)
  const [itemMatrixPlan, setItemMatrixPlan] = useState<DraftIntel['matchupPlans'][number] | null>(null)
  const [itemMatrixPlans, setItemMatrixPlans] = useState<DraftIntel['itemMatrixPlans'] | null>(null)
  const [itemMatrixStatus, setItemMatrixStatus] = useState<'idle' | 'preparing' | 'ready' | 'error'>('idle')
  const [itemMatrixError, setItemMatrixError] = useState<string | null>(null)
  const itemMatrixRequestRef = useRef(0)
  const firstChampInputRef = useRef<HTMLInputElement | null>(null)
  const listboxId = useId()
  const [webRoute, setWebRoute] = useState<WebRoute>(() => readWebRoute())
  const poolUndo = poolUndoStack[poolUndoStack.length - 1] ?? null

  const navigateWebRoute = useCallback((next: WebRoute) => {
    const nextPath = next === 'suggestions' ? '/suggestions' : '/'
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, '', nextPath)
    }
    setWebRoute(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const handleScreenshotPaste = (event: ClipboardEvent | ReactClipboardEvent<HTMLElement>) => {
    if (!WEB_VISION_SCREENSHOT_ENABLED) {
      setVisionStatus(WEB_VISION_SCREENSHOT_WIP_MESSAGE)
      return
    }
    const items = Array.from(event.clipboardData?.items ?? [])
    const imageItem = items.find((item) => item.type.startsWith('image/'))
    const file = imageItem?.getAsFile() ?? null
    if (!file) {
      setVisionStatus('Clipboard did not contain an image. Copy a screenshot, then paste here.')
      return
    }
    event.preventDefault()
    void parseDraftScreenshot(file)
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const version = await getLatestDDragonVersion()
        if (cancelled) {
          return
        }
        const cached = await idbGetChampions(version)
        const cachedItems = await idbGetItems(version)
        if (cached && cached.length > 0) {
          setDdragonVersion(version)
          setChampions(cached)
          setNameById(new Map(cached.map((c) => [c.id, c.name] as const)))
          if (cachedItems?.length) {
            setItems(cachedItems)
            return
          }
          const itemMaps = await loadItemMaps(version)
          if (!cancelled) {
            setItems(itemMaps.items)
            void idbSetItems(version, itemMaps.items)
          }
          return
        }
        const [maps, itemMaps] = await Promise.all([loadChampionMaps(version), loadItemMaps(version)])
        if (cancelled) {
          return
        }
        setDdragonVersion(version)
        setChampions(maps.champions)
        setItems(itemMaps.items)
        setNameById(new Map(maps.champions.map((c) => [c.id, c.name] as const)))
        void idbSetChampions(version, maps.champions)
        void idbSetItems(version, itemMaps.items)
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : String(error))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const refresh = async () => {
      const status = await refreshLivePublicData()
      if (cancelled) {
        return
      }
      setLiveDataStatus(status)
      if (status.ok && status.applied) {
        setLiveDataRevision((revision) => revision + 1)
      }
    }
    void refresh()
    const timer = window.setInterval(() => {
      void refresh()
    }, LIVE_META_REFRESH_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    const onPopState = () => setWebRoute(readWebRoute())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    document.title = webRoute === 'suggestions' ? 'Suggestions | Nexus Draft' : 'Nexus Draft'
  }, [webRoute])

  useEffect(() => {
    if (champions.length === 0) {
      return
    }
    const t = window.setTimeout(() => {
      savePersistedWebDraft({
        v: 1,
        board: cloneBoard(board),
        championInputs: cloneInputs(championInputs),
        role,
        rollouts,
        deltaMode
      })
    }, 500)
    return () => clearTimeout(t)
  }, [board, championInputs, role, rollouts, deltaMode, champions.length])

  useEffect(() => {
    try {
      localStorage.setItem(LS_WEB_CHAMPION_POOL_PREFS, JSON.stringify(championPoolPrefs))
    } catch {
      /* ignore */
    }
  }, [championPoolPrefs])

  useEffect(() => {
    try {
      if (playerPoolProfile) {
        localStorage.setItem(LS_WEB_PLAYER_POOL_PROFILE, JSON.stringify(playerPoolProfile))
      } else {
        localStorage.removeItem(LS_WEB_PLAYER_POOL_PROFILE)
      }
    } catch {
      /* ignore */
    }
  }, [playerPoolProfile])

  useEffect(() => {
    try {
      localStorage.setItem(LS_WEB_RECOMMENDATION_POOL_MODE, recommendationPoolMode)
    } catch {
      /* ignore */
    }
  }, [recommendationPoolMode])

  useEffect(() => {
    if (!WEB_VISION_SCREENSHOT_ENABLED) {
      return
    }
    const onPaste = (event: ClipboardEvent) => {
      if (visionBusy) {
        return
      }
      handleScreenshotPaste(event)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [visionBusy])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/') {
        return
      }
      if (e.ctrlKey || e.metaKey) {
        return
      }
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }
      e.preventDefault()
      firstChampInputRef.current?.focus()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const sortedChampions = useMemo(() => champions.slice().sort((a, b) => a.name.localeCompare(b.name)), [champions])
  const championSearchRows = useMemo<ChampionSearchRow[]>(() => {
    return sortedChampions.map((champion) => ({
      champion,
      normalizedName: normalizeChampionQuery(champion.name)
    }))
  }, [sortedChampions])
  const championByNormalizedName = useMemo(() => {
    return new Map(championSearchRows.map((row) => [row.normalizedName, row.champion] as const))
  }, [championSearchRows])
  const findChampionByInput = useCallback((value: string): ChampionLite | null => {
    const normalized = normalizeChampionQuery(value)
    if (!normalized) {
      return null
    }
    const exact = championByNormalizedName.get(normalized)
    if (exact) {
      return exact
    }
    let match: ChampionLite | null = null
    for (const row of championSearchRows) {
      if (!row.normalizedName.startsWith(normalized)) {
        continue
      }
      if (match) {
        return null
      }
      match = row.champion
    }
    return match
  }, [championByNormalizedName, championSearchRows])
  const championMetaById = useMemo(() => {
    return new Map(champions.map((c) => [c.id, { tags: c.tags, partype: c.partype, passive: c.passive, spells: c.spells }]))
  }, [champions])
  const importedChampionPoolPrefs = useMemo(() => importedProfileToPreferences(playerPoolProfile), [playerPoolProfile])
  const effectiveChampionPoolPrefs = useMemo(
    () => mergeChampionPoolPreferences(importedChampionPoolPrefs, championPoolPrefs),
    [importedChampionPoolPrefs, championPoolPrefs]
  )
  const visibleImportedPoolEntries = useMemo(() => {
    return (playerPoolProfile?.entries ?? []).filter(
      (entry) => effectiveChampionPoolPrefs[String(entry.championId)] !== 'never'
    )
  }, [playerPoolProfile, effectiveChampionPoolPrefs])
  const visibleManualPoolEntries = useMemo(() => {
    return Object.entries(championPoolPrefs).filter(
      ([id, pref]) => pref !== 'never' && importedChampionPoolPrefs[id] == null
    )
  }, [championPoolPrefs, importedChampionPoolPrefs])
  const championPoolPreferenceMap = useMemo((): ReadonlyMap<number, ChampionPoolPreference> => {
    return new Map(Object.entries(effectiveChampionPoolPrefs).map(([id, pref]) => [Number(id), pref] as const))
  }, [effectiveChampionPoolPrefs])
  const comfortByChampionId = useMemo((): ReadonlyMap<number, number> => {
    return new Map(
      Object.entries(effectiveChampionPoolPrefs).map(([id, pref]) => [Number(id), championPoolPreferenceToComfort(pref)] as const)
    )
  }, [effectiveChampionPoolPrefs])
  const candidateChampionIds = null
  const snapshot = useMemo(() => buildSnapshot(board, role, nameById), [board, role, nameById])
  const enemyRoleInference = useMemo(() => inferEnemyRoleAssignments(snapshot), [snapshot, liveDataRevision])
  const suggestionArgs = useMemo(() => {
    if (champions.length === 0) {
      return null
    }
    return {
      myRole: role,
      snapshot,
      idToName: nameById,
      maxResults: 40,
      dataDragonVersion: ddragonVersion,
      monteCarloSamples: rollouts,
      rngSeed: 0x4d_44_57_45,
      championMetaById,
      trainedEffects: null,
      comfortByChampionId,
      candidateChampionIds,
      sortBy: 'delta',
      deltaListMode: deltaMode
    } as const
  }, [
    champions.length,
    role,
    snapshot,
    nameById,
    ddragonVersion,
    rollouts,
    championMetaById,
    comfortByChampionId,
    candidateChampionIds,
    deltaMode,
    liveDataRevision
  ])
  const [suggestionResult, setSuggestionResult] = useState<{ suggestions: PickSuggestion[]; patchLabel: string }>({
    suggestions: [],
    patchLabel: ENGINE_V1_LABEL
  })
  useEffect(() => {
    if (!suggestionArgs) {
      setSuggestionResult({ suggestions: [], patchLabel: ENGINE_V1_LABEL })
      return
    }
    let cancelled = false
    void suggestPicksAsync(suggestionArgs).then((result) => {
      if (!cancelled) {
        setSuggestionResult(result)
      }
    })
    return () => {
      cancelled = true
    }
  }, [suggestionArgs])
  const suggestions = suggestionResult.suggestions
  const patchLabel = suggestionResult.patchLabel

  const draftIntelArgs = useMemo(() => ({
      snapshot,
      myRole: role,
      suggestions,
      idToName: nameById,
      championMetaById,
      enemyRoleInference,
      patchLabel,
      dataDragonVersion: ddragonVersion,
      championPoolPreferences: championPoolPreferenceMap,
      itemCatalog: items,
      includeItemPlans: true
    }),
    [
      snapshot,
      role,
      suggestions,
      nameById,
      championMetaById,
      enemyRoleInference,
      patchLabel,
      ddragonVersion,
      items,
      championPoolPreferenceMap,
      liveDataRevision
    ]
  )
  const [draftIntel, setDraftIntel] = useState<DraftIntel | null>(null)
  useEffect(() => {
    let cancelled = false
    void buildDraftIntelAsync(draftIntelArgs).then((rustIntel) => {
      if (!cancelled) {
        setDraftIntel(rustIntel)
      }
    })
    return () => {
      cancelled = true
    }
  }, [draftIntelArgs])
  const buildItemMatrixPlans = useCallback((options?: ItemMatrixRequestOptions) => buildDraftItemMatrixPlansAsync({
    snapshot,
    myRole: role,
    suggestions,
    idToName: nameById,
    championMetaById,
    enemyRoleInference,
    patchLabel,
    dataDragonVersion: ddragonVersion,
    championPoolPreferences: championPoolPreferenceMap,
    itemCatalog: items
  }, options), [
    snapshot,
    role,
    suggestions,
    nameById,
    championMetaById,
    enemyRoleInference,
    patchLabel,
    ddragonVersion,
    championPoolPreferenceMap,
    items,
    liveDataRevision
  ])

  useEffect(() => {
    if (!draftIntel) {
      itemMatrixRequestRef.current += 1
      setItemMatrixPlans(null)
      setItemMatrixStatus('idle')
      setItemMatrixError(null)
      return
    }
    setItemMatrixStatus((prev) => (prev === 'ready' ? 'ready' : 'idle'))
    setItemMatrixError(null)
    let cancelled = false
    const requestId = ++itemMatrixRequestRef.current
    const cancelIdle = scheduleIdleWork(() => {
      setItemMatrixStatus('preparing')
      void buildItemMatrixPlans().then((result) => {
        if (!cancelled && itemMatrixRequestRef.current === requestId) {
          if (result.status === 'ready') {
            setItemMatrixPlans(result.plans)
            setItemMatrixStatus('ready')
            setItemMatrixError(null)
          } else {
            setItemMatrixStatus('error')
            setItemMatrixError(result.error ?? 'Item matrix could not be prepared.')
          }
        }
      })
    })
    return () => {
      cancelled = true
      cancelIdle()
    }
  }, [draftIntel, buildItemMatrixPlans])

  const ensureItemMatrixPlans = useCallback((focusChampionId?: number | null) => {
    const focusedPlanReady = focusChampionId != null && (itemMatrixPlans ?? []).some((plan) => plan.championId === focusChampionId && plan.itemPlan?.matrixRows?.length)
    if (focusedPlanReady || (focusChampionId == null && itemMatrixStatus === 'ready' && itemMatrixPlans != null)) {
      return
    }
    setItemMatrixStatus('preparing')
    setItemMatrixError(null)
    const requestId = ++itemMatrixRequestRef.current
    void buildItemMatrixPlans(focusChampionId ? { focusChampionId, limit: 1 } : undefined).then((result) => {
      if (itemMatrixRequestRef.current === requestId) {
        if (result.status === 'ready') {
          setItemMatrixPlans((prev) => (focusChampionId ? mergeItemMatrixPlans(prev, result.plans) : result.plans))
          setItemMatrixStatus('ready')
          setItemMatrixError(null)
          if (focusChampionId) {
            window.setTimeout(() => {
              void buildItemMatrixPlans().then((fullResult) => {
                if (fullResult.status === 'ready') {
                  setItemMatrixPlans(fullResult.plans)
                }
              })
            }, 0)
          }
        } else {
          setItemMatrixStatus('error')
          setItemMatrixError(result.error ?? 'Item matrix could not be prepared.')
        }
      }
    })
  }, [buildItemMatrixPlans, itemMatrixPlans, itemMatrixStatus])

  const draftIntelWithMatrix = useMemo(() => {
    if (!draftIntel) {
      return draftIntel
    }
    const itemPlanByChampion = new Map((itemMatrixPlans ?? []).map((plan) => [plan.championId, plan.itemPlan]))
    return {
      ...draftIntel,
      matchupPlans: draftIntel.matchupPlans.map((plan) =>
        itemPlanByChampion.has(plan.championId)
          ? { ...plan, itemPlan: itemPlanByChampion.get(plan.championId) }
          : plan
      ),
      itemMatrixPlans: itemMatrixPlans ?? undefined
    }
  }, [draftIntel, itemMatrixPlans])
  const hasLockedDraftContext = useMemo(() => {
    return [...snapshot.ally, ...snapshot.enemy].some((slot) => slot.championId != null && slot.championId > 0)
  }, [snapshot])

  const updateBoard = (side: 'ally' | 'enemy', slotRole: Exclude<DraftRole, 'unknown'>, id: number | null) => {
    setBoard((prev) => ({
      ...prev,
      [side]: {
        ...prev[side],
        [slotRole]: id
      }
    }))
  }

  const championMatches = (value: string): ChampionLite[] => {
    const normalized = normalizeChampionQuery(value)
    if (!normalized) {
      return []
    }
    const matches: ChampionLite[] = []
    for (const row of championSearchRows) {
      if (row.normalizedName.includes(normalized)) {
        matches.push(row.champion)
        if (matches.length >= 5) {
          break
        }
      }
    }
    return matches
  }

  const activeMatches = useMemo(() => {
    if (!activeChampionInput) {
      return [] as ChampionLite[]
    }
    return championMatches(championInputs[activeChampionInput.side][activeChampionInput.role])
  }, [activeChampionInput, championInputs, championSearchRows])

  useEffect(() => {
    setListCursor(0)
  }, [activeChampionInput, activeMatches.length])

  const suggestionEmptyHelp = useMemo(() => {
    if (champions.length === 0 || loadError) {
      return null
    }
    if (suggestions.length > 0) {
      return null
    }
    return 'The engine has no recommended picks for this exact board state. Try another role, change the board, or reload if champion data is stale.'
  }, [champions.length, loadError, suggestions.length])

  const copyTopSuggestions = useCallback(async () => {
    if (suggestions.length === 0) {
      return
    }
    const top = suggestions.slice(0, 8)
    const lines = top.map((s, i) => {
      const delta = s.winRateDelta != null ? ` · Δ ${(s.winRateDelta * 100).toFixed(1)}%` : ''
      return `${i + 1}. ${s.championName} · ${s.score}${delta}`
    })
    const body = `Nexus Draft — ${roleLabel(role)} (patch ${ddragonVersion ?? '?'})\n${lines.join('\n')}`
    try {
      await navigator.clipboard.writeText(body)
      nexusWebTrack('copy_suggestions', { n: top.length })
      setCopyFeedback('Copied to clipboard')
      window.setTimeout(() => setCopyFeedback(''), 2200)
    } catch {
      setCopyFeedback('Copy failed (permission?)')
    }
  }, [suggestions, role, ddragonVersion])

  const topMatchupPlan = draftIntelWithMatrix?.matchupPlans[0] ?? null
  const itemMatrixPlansForView = (draftIntelWithMatrix?.itemMatrixPlans?.length ? draftIntelWithMatrix.itemMatrixPlans : draftIntelWithMatrix?.matchupPlans ?? [])
    .filter((plan) => plan.itemPlan?.matrixRows?.length)
  const activeItemMatrixPlan = itemMatrixPlan
    ? itemMatrixPlansForView.find((plan) => plan.championId === itemMatrixPlan.championId) ?? itemMatrixPlan
    : itemMatrixPlansForView[0] ?? topMatchupPlan
  const matrixChampionImageUrl = useCallback((id: number): string | null => {
    const champion = champions.find((row) => row.id === id)
    return champion && ddragonVersion ? ddragonChampionImageUrl(ddragonVersion, champion.key) : null
  }, [champions, ddragonVersion])

  const saveChampionPoolPreference = () => {
    if (poolChampionId == null) {
      return
    }
    setChampionPoolPrefs((prev) => ({ ...prev, [String(poolChampionId)]: poolPreference }))
    setPoolUndoStack([])
    nexusWebTrack('champion_pool_pref', { pref: poolPreference })
  }

  const removeChampionFromPool = useCallback(
    (championId: number) => {
      const id = String(championId)
      const importedPreference = importedChampionPoolPrefs[id] ?? null
      const previousManualPreference = championPoolPrefs[id] ?? null
      const championName = nameById.get(championId) ?? resolveChampionName(championId, nameById)
      setChampionPoolPrefs((prev) => {
        const next = { ...prev }
        if (importedPreference) {
          next[id] = 'never'
        } else {
          delete next[id]
        }
        return next
      })
      setPoolUndoStack((prev) => [...prev, { championId, championName, previousManualPreference }].slice(-20))
      setPlayerPoolStatus(`Removed ${championName} from personal pool.`)
      nexusWebTrack('champion_pool_remove', { imported: Boolean(importedPreference) })
    },
    [championPoolPrefs, importedChampionPoolPrefs, nameById]
  )

  const undoChampionPoolRemoval = useCallback(() => {
    if (!poolUndo) {
      return
    }
    const id = String(poolUndo.championId)
    setChampionPoolPrefs((prev) => {
      const next = { ...prev }
      if (poolUndo.previousManualPreference == null) {
        delete next[id]
      } else {
        next[id] = poolUndo.previousManualPreference
      }
      return next
    })
    setPlayerPoolStatus(`Restored ${poolUndo.championName}.`)
    setPoolUndoStack((prev) => prev.slice(0, -1))
    nexusWebTrack('champion_pool_remove_undo')
  }, [poolUndo])

  const handlePoolChipDragStart = (event: ReactDragEvent<HTMLElement>, championId: number) => {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData(POOL_DRAG_MIME, String(championId))
    event.dataTransfer.setData('text/plain', String(championId))
  }

  const handlePoolTrashDrop = (event: ReactDragEvent<HTMLElement>) => {
    event.preventDefault()
    setPoolTrashActive(false)
    const championId = parsePoolDragChampionId(event)
    if (championId != null) {
      removeChampionFromPool(championId)
    }
  }

  const importPlayerChampionPool = useCallback(async () => {
    if (!WEB_PLAYER_POOL_IMPORT_ENABLED) {
      setPlayerPoolStatus(WEB_PLAYER_POOL_IMPORT_WIP_MESSAGE)
      return
    }
    const riotId = riotIdInput.trim()
    if (!riotId) {
      setPlayerPoolStatus('Enter a Riot ID like GameName#TagLine.')
      return
    }
    setPlayerPoolBusy(true)
    setPlayerPoolStatus('Importing Riot mastery...')
    try {
      const result = await fetchWebPlayerChampionPool(riotId, riotPlatform)
      if (!result.ok) {
        setPlayerPoolStatus(result.error)
        return
      }
      setPlayerPoolProfile(result.profile)
      setRiotIdInput(result.profile.riotId)
      setRiotPlatform(result.profile.platform)
      setRecommendationPoolMode('my-champs')
      setPoolUndoStack([])
      setPlayerPoolStatus(`Imported ${result.profile.entries.length} mastery champs.`)
      nexusWebTrack('riot_pool_import', { platform: result.profile.platform, n: result.profile.entries.length })
    } catch (error) {
      setPlayerPoolStatus(error instanceof Error ? error.message : 'Riot import failed. Try again shortly.')
    } finally {
      setPlayerPoolBusy(false)
    }
  }, [riotIdInput, riotPlatform])

  const pickChampionInput = (side: 'ally' | 'enemy', slotRole: Exclude<DraftRole, 'unknown'>, champion: ChampionLite) => {
    setChampionInputs((prev) => ({
      ...prev,
      [side]: {
        ...prev[side],
        [slotRole]: champion.name
      }
    }))
    updateBoard(side, slotRole, champion.id)
    setListCursor(0)
    setActiveChampionInput(null)
  }

  const updateChampionInput = (side: 'ally' | 'enemy', slotRole: Exclude<DraftRole, 'unknown'>, value: string) => {
    setChampionInputs((prev) => ({
      ...prev,
      [side]: {
        ...prev[side],
        [slotRole]: value
      }
    }))
    const normalized = normalizeChampionQuery(value)
    if (!normalized) {
      updateBoard(side, slotRole, null)
      return
    }
    const numericId = parseChampionId(value)
    if (numericId != null && sortedChampions.some((champion) => champion.id === numericId)) {
      updateBoard(side, slotRole, numericId)
      return
    }
    const exact = championByNormalizedName.get(normalized)
    updateBoard(side, slotRole, exact?.id ?? null)
  }

  const settleChampionInput = (side: 'ally' | 'enemy', slotRole: Exclude<DraftRole, 'unknown'>) => {
    const value = championInputs[side][slotRole]
    const normalized = normalizeChampionQuery(value)
    if (!normalized) {
      return
    }
    const picked = findChampionByInput(value)
    if (!picked) {
      return
    }
    updateBoard(side, slotRole, picked.id)
    setChampionInputs((prev) => ({
      ...prev,
      [side]: {
        ...prev[side],
        [slotRole]: picked.name
      }
    }))
  }

  const resetBoard = () => {
    clearPersistedWebDraft()
    setBoard(emptyBoard())
    setChampionInputs(emptyInputBoard())
  }

  const setChampionSlotByName = (side: 'ally' | 'enemy', slotRole: Exclude<DraftRole, 'unknown'>, championName: string) => {
    const picked = findChampionByInput(championName)
    setChampionInputs((prev) => ({
      ...prev,
      [side]: {
        ...prev[side],
        [slotRole]: picked?.name ?? championName
      }
    }))
    updateBoard(side, slotRole, picked?.id ?? null)
  }

  const applyVisionRows = (side: 'ally' | 'enemy', rows: VisionPick[] | undefined) => {
    let fallbackIndex = 0
    for (const row of rows ?? []) {
      const name = row.championName?.trim() ?? ''
      if (!name) {
        continue
      }
      const slotRole = normalizeRole(row.role) ?? ROLES[fallbackIndex]
      fallbackIndex += 1
      if (!slotRole) {
        continue
      }
      setChampionSlotByName(side, slotRole, name)
    }
  }

  const parseDraftScreenshot = async (file: File | null) => {
    if (!WEB_VISION_SCREENSHOT_ENABLED) {
      setVisionStatus(WEB_VISION_SCREENSHOT_WIP_MESSAGE)
      return
    }
    if (!file) {
      return
    }
    if (champions.length === 0) {
      setVisionStatus('Wait for champion data to load before autofill.')
      return
    }
    setVisionBusy(true)
    setVisionStatus('Reading screenshot...')
    try {
      const dataUrl = await fileToImageDataUrl(file)
      const res = await fetch('/api/parse-draft-screenshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: dataUrlToBase64(dataUrl),
          mimeType: 'image/jpeg',
          dataDragonVersion: ddragonVersion
        })
      })
      const data = (await res.json()) as VisionResponse
      if (!res.ok) {
        throw new Error(data.error ?? `Vision request failed (${res.status})`)
      }
      const countNamed = (rows: VisionPick[] | undefined) =>
        (rows ?? []).filter((r) => (r.championName?.trim() ?? '').length > 0).length
      const allyRows = data.allyPicks?.length ? data.allyPicks : data.allies?.length ? data.allies : data.myTeam
      const enemyRows = data.enemyPicks?.length
        ? data.enemyPicks
        : data.enemies?.length
          ? data.enemies
          : data.opponentPicks?.length
            ? data.opponentPicks
            : data.theirTeam
      const allyN = countNamed(allyRows)
      const enemyN = countNamed(enemyRows)
      applyVisionRows('ally', allyRows)
      applyVisionRows('enemy', enemyRows)
      const detectedRole = normalizeRole(data.myRole)
      if (detectedRole) {
        setRole(detectedRole)
      }
      nexusWebTrack('ocr_autofill', { ally: allyN, enemy: enemyN })
      setVisionStatus(`Autofill complete${data.confidence ? ` (${data.confidence} confidence)` : ''}. Check the board for mistakes.`)
    } catch (error) {
      setVisionStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setVisionBusy(false)
    }
  }

  const onChampionKeyDown = (
    e: ReactKeyEvent<HTMLInputElement>,
    side: 'ally' | 'enemy',
    slotRole: Exclude<DraftRole, 'unknown'>
  ) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      setActiveChampionInput(null)
      return
    }
    const isThis = activeChampionInput?.side === side && activeChampionInput?.role === slotRole
    if (!isThis || activeMatches.length === 0) {
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setListCursor((c) => Math.min(c + 1, activeMatches.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setListCursor((c) => Math.max(c - 1, 0))
    } else if (e.key === 'Enter' && listCursor >= 0) {
      const m = activeMatches[listCursor]
      if (m) {
        e.preventDefault()
        pickChampionInput(side, slotRole, m)
      }
    }
  }

  const screenshotAutofillPanel = (
    <div className="mt-5 border border-nexus-lime/25 bg-gradient-to-br from-nexus-bg/55 to-nexus-surface-2/60 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="m-0 font-display text-base tracking-[0.14em] uppercase text-nexus-lime/90">
            Screenshot autofill {!WEB_VISION_SCREENSHOT_ENABLED ? 'WIP' : ''}
          </p>
          <p className="m-0 mt-1 font-mono text-xs leading-relaxed text-nexus-muted">
            {WEB_VISION_SCREENSHOT_ENABLED
              ? 'Upload or paste a League champion select screenshot. Vision reads visible ally/enemy champions and fills the board.'
              : 'This web OCR path is paused while it is being stabilized. Manual champion entry is available above.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label
            className={
              'nexus-focus inline-flex items-center justify-center border border-nexus-line px-4 py-2 font-display text-xs tracking-[0.16em] uppercase text-nexus-lime/90 ' +
              (WEB_VISION_SCREENSHOT_ENABLED
                ? 'cursor-pointer hover:border-nexus-lime/60 hover:bg-nexus-lime/10'
                : 'cursor-not-allowed opacity-45')
            }
            aria-disabled={!WEB_VISION_SCREENSHOT_ENABLED}
          >
            {!WEB_VISION_SCREENSHOT_ENABLED ? 'Upload WIP' : visionBusy ? 'Reading...' : 'Upload Screenshot'}
            <input
              className="sr-only"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={visionBusy || !WEB_VISION_SCREENSHOT_ENABLED}
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null
                void parseDraftScreenshot(file)
                event.currentTarget.value = ''
              }}
            />
          </label>
          <button
            type="button"
            className="nexus-focus inline-flex items-center justify-center border border-nexus-line px-4 py-2 font-display text-xs tracking-[0.16em] uppercase text-nexus-lime/90 hover:border-nexus-lime/60 hover:bg-nexus-lime/10 disabled:cursor-not-allowed disabled:opacity-45"
            disabled={!WEB_VISION_SCREENSHOT_ENABLED}
            onClick={() => setVisionStatus(WEB_VISION_SCREENSHOT_ENABLED ? 'Paste target' : WEB_VISION_SCREENSHOT_WIP_MESSAGE)}
          >
            {WEB_VISION_SCREENSHOT_ENABLED ? 'Paste Screenshot' : 'Paste WIP'}
          </button>
        </div>
      </div>
      <div
        className={
          'mt-3 border border-dashed border-nexus-lime/40 bg-nexus-bg/30 px-3 py-2 font-mono text-xs text-nexus-muted transition-colors ' +
          (WEB_VISION_SCREENSHOT_ENABLED ? 'hover:border-nexus-lime/70 hover:text-nexus-text' : 'opacity-60')
        }
        tabIndex={0}
        role="button"
        aria-disabled={!WEB_VISION_SCREENSHOT_ENABLED}
        onPaste={handleScreenshotPaste}
        onClick={() => setVisionStatus(WEB_VISION_SCREENSHOT_ENABLED ? 'Paste target' : WEB_VISION_SCREENSHOT_WIP_MESSAGE)}
      >
        {WEB_VISION_SCREENSHOT_ENABLED ? 'Paste target' : 'Paste target paused'}
      </div>
      {!WEB_VISION_SCREENSHOT_ENABLED ? (
        <p className="m-0 mt-2 font-mono text-xs text-nexus-muted" aria-live="polite" aria-atomic="true">
          {visionStatus}
        </p>
      ) : visionStatus.toLowerCase().includes('failed') ||
        visionStatus.toLowerCase().includes('key') ||
        visionStatus.toLowerCase().includes('error') ? (
        <p className="m-0 mt-2 font-mono text-xs text-nexus-red/80" aria-live="polite" aria-atomic="true">
          {visionStatus}
        </p>
      ) : (
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {visionStatus}
        </span>
      )}
    </div>
  )

  if (webRoute === 'suggestions') {
    return <WebSuggestionsPage onNavigateDraft={() => navigateWebRoute('draft')} />
  }

  return (
    <WebDraftLabPage>
      {itemMatrixOpen && activeItemMatrixPlan ? (
        <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/90 p-3 sm:p-5">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close item matrix"
            onClick={() => {
              setItemMatrixOpen(false)
              setItemMatrixPlan(null)
            }}
          />
          <DraftItemMatrixView
            className="relative z-10 max-h-[92vh] w-full max-w-6xl overflow-hidden"
            plans={itemMatrixPlansForView}
            selectedChampionId={activeItemMatrixPlan.championId}
            itemPlan={activeItemMatrixPlan.itemPlan ?? null}
            championName={activeItemMatrixPlan.championName}
            championId={activeItemMatrixPlan.championId}
            championImageUrl={matrixChampionImageUrl}
            ddragonVersion={ddragonVersion}
            isPreparing={itemMatrixStatus === 'preparing'}
            error={itemMatrixStatus === 'error' ? itemMatrixError : null}
            onClose={() => {
              setItemMatrixOpen(false)
              setItemMatrixPlan(null)
            }}
          />
        </div>
      ) : null}
      <a
        href="#nexus-web-main"
        className="nexus-focus absolute -left-[9999px] z-[200] h-px w-px overflow-hidden focus:fixed focus:left-4 focus:top-4 focus:h-auto focus:w-auto focus:overflow-visible focus:rounded focus:border focus:border-nexus-lime/60 focus:bg-nexus-bg focus:px-3 focus:py-2 focus:font-mono focus:text-sm focus:text-nexus-lime"
      >
        Skip to main
      </a>
      <main id="nexus-web-main" className="relative mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:px-6 lg:px-8">
        <section className="nexus-command-deck relative mb-5 overflow-hidden border border-nexus-line bg-nexus-surface-2/90 p-5 shadow-[0_20px_80px_rgba(0,0,0,0.28)]">
          <div className="absolute inset-0 bg-[linear-gradient(110deg,rgba(35,213,176,0.12),transparent_35%,rgba(83,166,255,0.08))]" aria-hidden />
          <div className="relative">
          <MicroLabel className="text-nexus-lime/80">web app // manual draft lab</MicroLabel>
          <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="drop-shadow-[0_0_18px_rgba(231,255,245,0.10)]">
                <ParticleWordMark
                  ariaLabel="NexusDraft"
                  target="nexusdraft"
                  className="h-[6.5rem] w-full max-w-[760px] sm:h-[8.5rem] lg:h-[10rem]"
                  maxParticles={1600}
                  fontScale={0.2}
                  minFontSize={48}
                  maxFontSize={160}
                />
              </h1>
              <p className="mt-3 max-w-2xl font-mono text-sm text-nexus-muted leading-relaxed">
                Browser draft assistant with manual board entry.
              </p>
              {loadError ? (
                <p className="mt-2 m-0 max-w-2xl font-mono text-xs text-nexus-red/80 leading-relaxed">{loadError}</p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                className={solidGlitchCtaClass}
                data-glitch-label="Download EXE"
                href={EXE_DOWNLOAD_URL}
                download={EXE_DOWNLOAD_FILE}
                onPointerEnter={(event) => emitNexusEffect('button:hover', { x: event.clientX, y: event.clientY })}
                onPointerDown={(event) => emitNexusEffect('button:press', { x: event.clientX, y: event.clientY })}
              >
                Download EXE
              </a>
              <a
                className={outlineGlitchCtaClass}
                data-glitch-label="Suggestions"
                href="/suggestions"
                onClick={(event) => {
                  event.preventDefault()
                  navigateWebRoute('suggestions')
                }}
              >
                Suggestions
              </a>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-nexus-line/60 pt-3 font-mono text-xs uppercase tracking-[0.12em]">
            <a
              className="text-nexus-lime hover:text-nexus-text"
              href="/suggestions"
              onClick={(event) => {
                event.preventDefault()
                navigateWebRoute('suggestions')
              }}
            >
              Suggestions
            </a>
            <span className="text-nexus-line" aria-hidden>
              /
            </span>
            <a className="text-nexus-lime/85 hover:text-nexus-lime" href={GITHUB_PROFILE_URL} target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
          </div>
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_390px]">
          <div className="min-w-0">
            <NexusPanel kicker="manual" title="Draft board" accent>
              <div className="mb-4 flex flex-col gap-2 border border-nexus-line/70 bg-nexus-bg/35 p-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="m-0 font-mono text-xs leading-relaxed text-nexus-muted">
                  Manual board entry for ally and enemy champion select.
                </p>
                <button
                  type="button"
                  className="nexus-focus nexus-glitch-cta nexus-glitch-cta--outline inline-flex items-center justify-center border border-nexus-line px-4 py-2 font-display text-xs tracking-[0.16em] uppercase text-nexus-lime/90 hover:border-nexus-lime/60 hover:bg-nexus-lime/10"
                  data-glitch-label="Reset Board"
                  onClick={resetBoard}
                >
                  Reset Board
                </button>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <label className="flex flex-col gap-1.5">
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-nexus-lime/85">Your role</span>
                  <select className={webFieldClass} value={role} onChange={(e) => setRole(e.target.value as Exclude<DraftRole, 'unknown'>)}>
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {roleLabel(r)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-nexus-lime/85">Rollouts</span>
                  <input
                    className={webFieldClass}
                    type="number"
                    min={0}
                    max={MAX_WEB_ROLLOUTS}
                    step={1}
                    value={rollouts}
                    onChange={(e) => {
                      const n = Number(e.target.value)
                      if (Number.isFinite(n)) {
                        setRollouts(Math.max(0, Math.min(MAX_WEB_ROLLOUTS, Math.trunc(n))))
                      }
                    }}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-nexus-lime/85">Delta order</span>
                  <select className={webFieldClass} value={deltaMode} onChange={(e) => setDeltaMode(e.target.value === 'worst' ? 'worst' : 'best')}>
                    <option value="best">Best first</option>
                    <option value="worst">Worst first</option>
                  </select>
                </label>
              </div>

              <div className="mt-5 grid gap-5 xl:grid-cols-2">
                {(['ally', 'enemy'] as const).map((side) => (
                  <section
                    key={side}
                    className={
                      side === 'ally'
                        ? 'rounded-md border border-nexus-lime/30 border-l-4 border-l-nexus-lime bg-nexus-lime/[0.06] p-3 shadow-[inset_0_1px_0_rgba(35,213,176,0.12)]'
                        : 'rounded-md border border-nexus-red/30 border-l-4 border-l-nexus-red bg-nexus-red/[0.06] p-3 shadow-[inset_0_1px_0_rgba(248,113,113,0.1)]'
                    }
                  >
                    <h3
                      className={
                        side === 'ally'
                          ? 'font-display text-base tracking-[0.14em] uppercase text-nexus-lime/95 mb-3'
                          : 'font-display text-base tracking-[0.14em] uppercase text-nexus-red/90 mb-3'
                      }
                    >
                      {side === 'ally' ? 'Allies' : 'Enemies'}
                    </h3>
                    <div className="space-y-2">
                      {ROLES.map((slotRole) => {
                        const matches = championMatches(championInputs[side][slotRole])
                        const isActive = activeChampionInput?.side === side && activeChampionInput.role === slotRole
                        const isFirstSlot = side === 'ally' && slotRole === 'top'
                        const isMyRoleRow = slotRole === role && side === 'ally'
                        const isLaneOppRow = slotRole === role && side === 'enemy'
                        const roleClass =
                          side === 'ally'
                            ? isMyRoleRow
                              ? 'font-mono text-xs font-semibold uppercase text-nexus-lime'
                              : 'font-mono text-xs uppercase text-nexus-lime/75'
                            : isLaneOppRow
                              ? 'font-mono text-xs font-semibold uppercase text-nexus-red'
                              : 'font-mono text-xs uppercase text-nexus-red/70'
                        return (
                          <label
                            key={`${side}-${slotRole}`}
                            className={
                              'grid grid-cols-[4.5rem_2rem_minmax(0,1fr)] gap-2 items-center border-b pb-2 last:border-0 last:pb-0 ' +
                              (side === 'ally' ? 'border-nexus-lime/15' : 'border-nexus-red/15')
                            }
                          >
                            <span className={roleClass}>{roleLabel(slotRole)}</span>
                            <ChampionIcon championId={board[side][slotRole]} champions={champions} ddragonVersion={ddragonVersion} />
                            <span className="relative min-w-0">
                              <input
                                ref={isFirstSlot ? firstChampInputRef : undefined}
                                className={webFieldClassCompact}
                                value={championInputs[side][slotRole]}
                                placeholder="Type champion…"
                                autoComplete="off"
                                id={isFirstSlot ? 'nexus-web-first-champ' : undefined}
                                role="combobox"
                                aria-autocomplete="list"
                                aria-expanded={isActive && matches.length > 0}
                                aria-controls={isActive && matches.length > 0 ? listboxId : undefined}
                                onFocus={() => setActiveChampionInput({ side, role: slotRole })}
                                onChange={(e) => {
                                  setActiveChampionInput({ side, role: slotRole })
                                  updateChampionInput(side, slotRole, e.target.value)
                                }}
                                onKeyDown={(e) => onChampionKeyDown(e, side, slotRole)}
                                onBlur={() => {
                                  window.setTimeout(() => {
                                    settleChampionInput(side, slotRole)
                                    setActiveChampionInput((current) =>
                                      current?.side === side && current.role === slotRole ? null : current
                                    )
                                  }, 120)
                                }}
                                disabled={champions.length === 0}
                              />
                              {isActive && matches.length > 0 && (
                                <span
                                  id={listboxId}
                                  role="listbox"
                                  className="absolute left-0 right-0 top-[calc(100%+2px)] z-30 max-h-44 overflow-y-auto rounded-md border border-white/10 bg-[#0b1c16] shadow-[0_12px_28px_rgba(0,0,0,0.5)]"
                                >
                                  {matches.map((champion, optIdx) => (
                                    <button
                                      key={champion.id}
                                      type="button"
                                      role="option"
                                      aria-selected={isActive && listCursor === optIdx}
                                      className={
                                        'nexus-focus flex w-full items-center gap-2 px-2 py-1.5 text-left font-mono text-xs ' +
                                        (isActive && listCursor === optIdx
                                          ? 'bg-nexus-lime/20 text-nexus-text'
                                          : 'text-nexus-text hover:bg-nexus-lime/10')
                                      }
                                      onMouseDown={(event) => {
                                        event.preventDefault()
                                        pickChampionInput(side, slotRole, champion)
                                      }}
                                    >
                                      <ChampionIcon championId={champion.id} champions={champions} ddragonVersion={ddragonVersion} />
                                      <span className="truncate">{champion.name}</span>
                                    </button>
                                  ))}
                                </span>
                              )}
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  </section>
                ))}
              </div>
              {screenshotAutofillPanel}
            </NexusPanel>
          </div>

          <aside className="min-w-0" aria-label="Recommendations and desktop download">
            <NexusPanel kicker="recommendations" title={`Picks for ${roleLabel(role)}`} accent>
              {loadError ? (
                <div className="mb-3 border-b border-nexus-line/60 bg-nexus-bg/25 px-2 py-2 font-mono text-xs">
                  <p className="m-0 text-nexus-red/80" role="status">
                    {loadError}
                  </p>
                </div>
              ) : null}
              <p className="mb-3 mt-0 font-mono text-[11px] uppercase tracking-[0.12em] text-nexus-muted">
                {livePublicDataStatusLine(liveDataStatus)}
              </p>
              {draftIntel && hasLockedDraftContext && (
                <details className="group mb-3 border-b border-nexus-line/60 pb-3 font-mono text-xs">
                  <summary className="nexus-focus flex cursor-pointer list-none items-center justify-between gap-2 rounded-md border border-white/[0.08] bg-nexus-bg/35 px-2 py-2 uppercase tracking-[0.12em] text-nexus-lime/85 marker:hidden hover:border-nexus-lime/35 hover:bg-nexus-lime/[0.06]">
                    <span>Draft intel</span>
                    <span className="text-nexus-lime/75 transition-transform group-open:rotate-45" aria-hidden>
                      +
                    </span>
                  </summary>
                  <div className="mt-2 space-y-2">
                    <div className="rounded-md border border-nexus-lime/25 bg-nexus-lime/[0.06] px-2 py-2">
                      <p className="m-0 uppercase tracking-[0.12em] text-nexus-lime/85">Win condition</p>
                      <p className="m-0 mt-1 leading-relaxed text-nexus-text/85">{draftIntel.compIdentity.winCondition}</p>
                      {draftIntel.compIdentity.warnings[0] ? (
                        <p className="m-0 mt-1 leading-relaxed text-nexus-red/80">{draftIntel.compIdentity.warnings[0]}</p>
                      ) : null}
                    </div>
                  <div className="grid gap-2">
                    <div className="rounded-md border border-white/[0.08] bg-nexus-bg/35 px-2 py-2">
                      <p className="m-0 mb-1 uppercase tracking-[0.12em] text-nexus-lime/75">Loading brief</p>
                      <ul className="m-0 list-disc pl-3.5 space-y-1 text-nexus-muted">
                        {draftIntel.loadingBrief.slice(0, 3).map((line, idx) => (
                          <li key={`web-brief-${idx}`}>{line}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  {topMatchupPlan && (
                    <div className="rounded-md border border-white/[0.08] bg-nexus-bg/35 px-2 py-2 text-nexus-muted">
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                        <p className="m-0 uppercase tracking-[0.12em] text-nexus-lime/75">Top plan</p>
                        <button
                          type="button"
                          className="nexus-focus border border-nexus-line/70 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-nexus-lime/90 hover:border-nexus-lime/50 disabled:opacity-45"
                          disabled={!topMatchupPlan}
                          onClick={() => {
                            ensureItemMatrixPlans(topMatchupPlan.championId)
                            setItemMatrixPlan(topMatchupPlan)
                            setItemMatrixOpen(true)
                          }}
                        >
                          Item matrix
                        </button>
                      </div>
                      <p className="m-0 text-nexus-text/85">
                        {topMatchupPlan.championName}{topMatchupPlan.laneOpponentName ? ` vs ${topMatchupPlan.laneOpponentName}` : ''} - {topMatchupPlan.summonerSpells}
                      </p>
                      <p className="m-0 mt-1">Start: {topMatchupPlan.startingItem}</p>
                      <p className="m-0">Recall: {topMatchupPlan.firstRecall}</p>
                      {topMatchupPlan.itemPlan ? (
                        <details className="group mt-2">
                          <summary className="nexus-focus flex cursor-pointer list-none items-center justify-between gap-2 py-1.5 uppercase tracking-[0.12em] text-nexus-muted marker:hidden hover:text-nexus-text/90">
                            <span>Build</span>
                            <span className="text-nexus-lime/70 transition-transform group-open:rotate-45">+</span>
                          </summary>
                          <div className="pb-1">
                            <ItemPlanBlock
                              itemPlan={topMatchupPlan.itemPlan}
                              ddragonVersion={ddragonVersion}
                              limit={4}
                              showHeader={false}
                              onOpenMatrix={() => {
                                ensureItemMatrixPlans(topMatchupPlan.championId)
                                setItemMatrixPlan(topMatchupPlan)
                                setItemMatrixOpen(true)
                              }}
                            />
                          </div>
                        </details>
                      ) : null}
                      {!topMatchupPlan.itemPlan && itemMatrixStatus === 'preparing' ? (
                        <p className="m-0 mt-2 text-nexus-muted">Preparing items...</p>
                      ) : null}
                      {!topMatchupPlan.itemPlan && itemMatrixStatus === 'error' ? (
                        <p className="m-0 mt-2 text-nexus-red/80">{itemMatrixError ?? 'Item matrix could not be prepared.'}</p>
                      ) : null}
                    </div>
                  )}
                  <details className="rounded-md border border-white/[0.08] bg-nexus-bg/35 px-2 py-2 text-nexus-muted">
                    <summary className="nexus-focus cursor-pointer uppercase tracking-[0.12em] text-nexus-lime/75">Confidence</summary>
                    <ul className="m-0 mt-2 list-disc pl-3.5 space-y-1 text-[11px]">
                      {draftIntel.confidenceNotes.slice(0, 3).map((line, idx) => (
                        <li key={`web-confidence-${idx}`}>{line}</li>
                      ))}
                    </ul>
                  </details>
                  </div>
                </details>
              )}
              {loadError && champions.length === 0 ? (
                <p className="m-0 font-mono text-sm text-nexus-muted" role="status">
                  Load champion data in the main column to see suggestions.
                </p>
              ) : !loadError && champions.length === 0 ? (
                <div>
                  <p className="m-0 mb-2 font-mono text-xs text-nexus-muted" aria-live="polite">
                    Loading League champion data from Riot…
                  </p>
                  <SuggestionRowsSkeleton />
                </div>
              ) : !loadError && champions.length > 0 && suggestions.length === 0 ? (
                <p className="m-0 font-mono text-sm text-nexus-muted leading-relaxed" role="status">
                  {suggestionEmptyHelp}
                </p>
              ) : loadError && champions.length > 0 ? (
                <p className="m-0 font-mono text-sm text-nexus-red/80" role="status">
                  Fix data load errors to refresh suggestions.
                </p>
              ) : (
                <div>
                  <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
                    {copyFeedback ? <span className="text-xs text-nexus-lime/90">{copyFeedback}</span> : null}
                    <button
                      type="button"
                      onClick={() => {
                        if (topMatchupPlan) {
                          ensureItemMatrixPlans(topMatchupPlan.championId)
                          setItemMatrixPlan(topMatchupPlan)
                          setItemMatrixOpen(true)
                        }
                      }}
                      disabled={!topMatchupPlan}
                      className="nexus-focus inline-flex border border-nexus-line/70 px-3 py-1.5 font-mono text-xs uppercase tracking-wide text-nexus-lime/90 hover:border-nexus-lime/50 hover:bg-nexus-lime/10 disabled:opacity-45"
                    >
                      Item matrix
                    </button>
                    <button
                      type="button"
                      onClick={copyTopSuggestions}
                      className="nexus-focus inline-flex border border-nexus-line/70 px-3 py-1.5 font-mono text-xs uppercase tracking-wide text-nexus-lime/90 hover:border-nexus-lime/50 hover:bg-nexus-lime/10"
                    >
                      Copy top picks
                    </button>
                  </div>
                  <ol className="list-none m-0 p-0 space-y-2" aria-label="Ranked pick suggestions">
                    {suggestions.slice(0, 8).map((suggestion) => (
                      <SuggestionRow
                        key={suggestion.championId}
                        suggestion={suggestion}
                        champions={champions}
                        ddragonVersion={ddragonVersion}
                        snapshot={snapshot}
                        myRole={role}
                        nameById={nameById}
                        enemyRoleInference={enemyRoleInference}
                        matchupPlan={
                          hasLockedDraftContext
                            ? draftIntelWithMatrix?.matchupPlans.find((plan) => plan.championId === suggestion.championId) ?? null
                            : null
                        }
                        onOpenItemMatrix={(plan) => {
                          ensureItemMatrixPlans(plan.championId)
                          setItemMatrixPlan(plan)
                          setItemMatrixOpen(true)
                        }}
                      />
                    ))}
                  </ol>
                </div>
              )}
            </NexusPanel>

            <NexusPanel kicker="desktop" title="Need live champ select?" className="bg-gradient-to-br from-nexus-surface-2/95 to-nexus-bg/75">
              <p className="font-mono text-sm text-nexus-muted leading-relaxed">
                Use the Windows desktop app for League Client API detection, automatic role parsing, and the always-on-top overlay.
              </p>
              <a
                className={`${solidGlitchCtaClass} mt-3`}
                data-glitch-label="Download EXE"
                href={EXE_DOWNLOAD_URL}
                download={EXE_DOWNLOAD_FILE}
                onPointerEnter={(event) => emitNexusEffect('button:hover', { x: event.clientX, y: event.clientY })}
                onPointerDown={(event) => emitNexusEffect('button:press', { x: event.clientX, y: event.clientY })}
              >
                Download EXE
              </a>
              <div className="mt-4 flex items-center gap-2 border-t border-nexus-line/50 pt-3 text-nexus-muted">
                <NexusPlus className="text-[10px]" />
                <span className="font-mono text-xs">Web build v4.0.0</span>
              </div>
            </NexusPanel>
          </aside>
        </div>
      </main>
      <VisitorCounter
        dataLine={loadError ? 'League data failed to load. Recommendations may be unavailable.' : null}
        legalLine="Nexus Draft is a fan project and is not affiliated with or endorsed by Riot Games, Inc. League of Legends and Riot Games are trademarks of Riot Games, Inc. Game data: Riot Data Dragon."
      />
    </WebDraftLabPage>
  )
}
