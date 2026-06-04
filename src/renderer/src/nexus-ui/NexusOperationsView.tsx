import { motion } from 'framer-motion'
import { useEffect, useState, type DragEvent as ReactDragEvent, type ReactNode } from 'react'
import { ddragonChampionImageUrl, type ChampionLite } from '@shared/dataDragon'
import type { OverlayShortcutStatusResult } from '@shared/desktopInterop'
import {
  RIOT_PLATFORMS,
  formatRuneTipNote,
  type DraftDeltaListMode,
  type DraftIntel,
  type DraftRole,
  type DraftSource,
  type ChampionPoolPreference,
  type PickSuggestion,
  type PlayerChampionPoolProfile,
  type RecommendationPoolMode,
  type RiotPlatform
} from '@shared/draft'
import { copyDraftSource } from './nexusCopy'
import { DraftItemMatrixView } from './DraftItemMatrixView'
import { DraftItemPlanBlock as ItemPlanBlock } from './DraftItemPlanBlock'
import { NexusCollapsible } from './NexusCollapsible'
import { MicroLabel } from './NexusTick'
import { EASING, useNexusMotion } from './nexusMotion'

const ROLES: DraftRole[] = ['top', 'jungle', 'middle', 'bottom', 'support']
const CHAMPION_POOL_PREFERENCES: { value: ChampionPoolPreference; label: string }[] = [
  { value: 'main', label: 'Main' },
  { value: 'comfortable', label: 'Comfort' },
  { value: 'learning', label: 'Learning' },
  { value: 'never', label: 'Avoid' }
]
const POOL_DRAG_MIME = 'application/x-nexus-pool-champion-id'
const DESKTOP_PLAYER_POOL_IMPORT_ENABLED = false
const DESKTOP_PLAYER_POOL_IMPORT_WIP_MESSAGE =
  'Riot mastery import is temporarily WIP. Manual champion pool weights still work.'

const inField =
  'nexus-focus w-full min-w-0 max-w-md bg-nexus-bg border border-nexus-line text-nexus-text font-mono text-sm py-2 px-3 focus:border-nexus-lime/50 focus:outline-none disabled:opacity-45'
const btnPrimary =
  'nexus-focus inline-flex items-center justify-center font-display text-xs sm:text-sm tracking-[0.16em] uppercase px-5 py-2.5 border border-nexus-lime bg-nexus-lime text-nexus-bg border-nexus-lime/90 hover:brightness-110 active:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed'
const textMuted = 'text-nexus-muted'
const textBody = 'font-mono text-sm text-nexus-text/90'
const errText = 'font-mono text-sm text-nexus-red'

function parseChampionSelectValue(value: string): number | null {
  if (!value) {
    return null
  }
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
}

function parsePoolDragChampionId(event: ReactDragEvent<HTMLElement>): number | null {
  const raw = event.dataTransfer.getData(POOL_DRAG_MIME) || event.dataTransfer.getData('text/plain')
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null
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

type PoolUndoState = {
  championId: number
  championName: string
  previousManualPreference: ChampionPoolPreference | null
}

type OpsSectionProps = {
  id: string
  kicker: string
  title: string
  children: ReactNode
  open: boolean
  onToggle: () => void
  accent?: boolean
}

function CollapsibleOpsSection({ id, kicker, title, children, open, onToggle, accent = false }: OpsSectionProps) {
  const { reduce } = useNexusMotion()
  const contentId = `${id}-body`
  return (
    <motion.section
      id={id}
      className={[
        'relative border border-nexus-line bg-nexus-surface-2/90 mb-3 overflow-hidden',
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
        accent ? 'border-nexus-lime/25' : ''
      ]
        .filter(Boolean)
        .join(' ')}
      transition={reduce ? { duration: 0 } : { duration: 0.18, ease: EASING.out }}
    >
      <button
        type="button"
        className="nexus-focus w-full px-4 py-3 text-left flex items-center justify-between gap-3 font-mono text-sm"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={contentId}
      >
        <span className="text-nexus-muted">{title}</span>
        <motion.span
          className="text-lg leading-none text-nexus-lime/90"
          animate={reduce ? undefined : { rotate: open ? 45 : 0, scale: open ? 1.08 : 1 }}
          transition={{ duration: 0.14, ease: EASING.sharp }}
          aria-hidden
        >
          +
        </motion.span>
      </button>
      <NexusCollapsible
        id={contentId}
        open={open}
        reduce={reduce}
        className={open ? 'border-t border-nexus-line' : 'border-t border-transparent'}
      >
        <div className="px-4 py-4 sm:px-5 sm:py-5 text-sm sm:text-base leading-relaxed">
          <MicroLabel className="block mb-2 text-nexus-lime/75">{kicker}</MicroLabel>
          <h2 className="font-display text-base sm:text-lg tracking-[0.14em] uppercase text-nexus-lime/95 mb-3 sm:mb-4">
            {title}
          </h2>
          {children}
        </div>
      </NexusCollapsible>
    </motion.section>
  )
}

type NexusOperationsViewProps = {
  lcuStatusLine: string
  lcuError: string | null
  draftSource: DraftSource
  useManual: boolean
  onUseManual: (v: boolean) => void
  effectiveMyRole: DraftRole
  suggestionRoleLine: string
  manual: { ally: Record<DraftRole, number | null>; enemy: Record<DraftRole, number | null> }
  onManualAlly: (role: DraftRole, id: number | null) => void
  onManualEnemy: (role: DraftRole, id: number | null) => void
  champions: ChampionLite[]
  /** Full explainer for the v1 / Monte Carlo model */
  modelDescription: string
  /** 0 = V1 only; non-zero = per-candidate MC rollouts (capped in MainShell). */
  suggestMcRollouts: number
  maxSuggestMcRollouts: number
  onSuggestMcRollouts: (n: number) => void
  suggestDeltaListMode: DraftDeltaListMode
  onSuggestDeltaListMode: (v: DraftDeltaListMode) => void
  suggestions: PickSuggestion[]
  ddragonVersion: string | null
  draftIntel?: DraftIntel | null
  onPrepareItemMatrixPlans?: (championId?: number | null) => void
  itemMatrixStatus?: 'idle' | 'preparing' | 'ready' | 'error'
  itemMatrixError?: string | null
  appUpdateStatusLine: string
  appUpdateBusy: boolean
  appUpdateAvailable: boolean
  appUpdateReady: boolean
  onCheckAppUpdate: () => void
  onDownloadAppUpdate: () => void
  onInstallAppUpdate: () => void
  playerPoolProfile: PlayerChampionPoolProfile | null
  playerPoolStatus: string | null
  overlayStatusLine?: string | null
  overlayError?: string | null
  overlayShortcutStatus?: OverlayShortcutStatusResult | null
  playerPoolBusy: boolean
  recommendationPoolMode: RecommendationPoolMode
  onRecommendationPoolMode: (mode: RecommendationPoolMode) => void
  onImportPlayerChampionPool: (riotId: string, platform: RiotPlatform) => void
  championPoolPreferences: Record<string, ChampionPoolPreference>
  onChampionPoolPreference: (championId: number, pref: ChampionPoolPreference | null) => void
  onToggleOverlay: () => void
}

export function NexusOperationsView({
  lcuStatusLine,
  lcuError,
  draftSource,
  useManual,
  onUseManual,
  effectiveMyRole,
  suggestionRoleLine,
  manual,
  onManualAlly,
  onManualEnemy,
  champions,
  modelDescription,
  suggestMcRollouts,
  maxSuggestMcRollouts,
  onSuggestMcRollouts,
  suggestDeltaListMode,
  onSuggestDeltaListMode,
  suggestions,
  ddragonVersion,
  draftIntel,
  onPrepareItemMatrixPlans,
  itemMatrixStatus = 'idle',
  itemMatrixError = null,
  appUpdateStatusLine,
  appUpdateBusy,
  appUpdateAvailable,
  appUpdateReady,
  onCheckAppUpdate,
  onDownloadAppUpdate,
  onInstallAppUpdate,
  playerPoolProfile,
  playerPoolStatus,
  overlayStatusLine,
  overlayError,
  overlayShortcutStatus,
  playerPoolBusy,
  recommendationPoolMode,
  onRecommendationPoolMode,
  onImportPlayerChampionPool,
  championPoolPreferences,
  onChampionPoolPreference,
  onToggleOverlay
}: NexusOperationsViewProps) {
  const sorted = champions.slice().sort((a, b) => a.name.localeCompare(b.name))
  const championKeyById = new Map(champions.map((c) => [c.id, c.key] as const))
  const championNameById = new Map(champions.map((c) => [c.id, c.name] as const))
  const [openSectionIds, setOpenSectionIds] = useState<ReadonlySet<string>>(() => new Set())
  const [poolChampionId, setPoolChampionId] = useState<number | null>(null)
  const [poolPreference, setPoolPreference] = useState<ChampionPoolPreference>('comfortable')
  const [riotIdInput, setRiotIdInput] = useState(() => playerPoolProfile?.riotId ?? '')
  const [riotPlatform, setRiotPlatform] = useState<RiotPlatform>(() => playerPoolProfile?.platform ?? 'na1')
  const [poolUndoStack, setPoolUndoStack] = useState<PoolUndoState[]>([])
  const [poolTrashActive, setPoolTrashActive] = useState(false)
  const [poolActionStatus, setPoolActionStatus] = useState<string | null>(null)
  const [itemMatrixOpen, setItemMatrixOpen] = useState(false)
  const [itemMatrixPlan, setItemMatrixPlan] = useState<DraftIntel['matchupPlans'][number] | null>(null)
  useEffect(() => {
    if (!playerPoolProfile) {
      return
    }
    setRiotIdInput(playerPoolProfile.riotId)
    setRiotPlatform(playerPoolProfile.platform)
  }, [playerPoolProfile])
  const toggleSection = (id: string) => {
    setOpenSectionIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }
  const topPlan = draftIntel?.matchupPlans[0] ?? null
  const itemMatrixPlans = (draftIntel?.itemMatrixPlans?.length ? draftIntel.itemMatrixPlans : draftIntel?.matchupPlans ?? [])
    .filter((plan) => plan.itemPlan?.matrixRows?.length)
  const activeItemMatrixPlan = itemMatrixPlan
    ? itemMatrixPlans.find((plan) => plan.championId === itemMatrixPlan.championId) ?? itemMatrixPlan
    : itemMatrixPlans[0] ?? topPlan
  const matrixChampionImageUrl = (id: number): string | null => {
    const key = championKeyById.get(id)
    return key && ddragonVersion ? ddragonChampionImageUrl(ddragonVersion, key) : null
  }
  const importedPreferenceById = new Map(
    (playerPoolProfile?.entries ?? []).map((entry) => [String(entry.championId), entry.preference] as const)
  )
  const visibleImportedPoolEntries = (playerPoolProfile?.entries ?? []).filter((entry) => {
    return (championPoolPreferences[String(entry.championId)] ?? entry.preference) !== 'never'
  })
  const visibleManualPoolEntries = Object.entries(championPoolPreferences).filter(([id, pref]) => {
    return pref !== 'never' && !importedPreferenceById.has(id)
  })
  const poolStatusLine = poolActionStatus ?? playerPoolStatus ?? (DESKTOP_PLAYER_POOL_IMPORT_ENABLED ? null : DESKTOP_PLAYER_POOL_IMPORT_WIP_MESSAGE)
  const poolUndo = poolUndoStack[poolUndoStack.length - 1] ?? null

  const removeChampionFromPool = (championId: number) => {
    const id = String(championId)
    const importedPreference = importedPreferenceById.get(id) ?? null
    const previousManualPreference = championPoolPreferences[id] ?? null
    const championName = championNameById.get(championId) ?? `Champion ${championId}`
    onChampionPoolPreference(championId, importedPreference ? 'never' : null)
    setPoolUndoStack((prev) => [...prev, { championId, championName, previousManualPreference }].slice(-20))
    setPoolActionStatus(`Removed ${championName} from personal pool.`)
  }

  const undoChampionPoolRemoval = () => {
    if (!poolUndo) {
      return
    }
    onChampionPoolPreference(poolUndo.championId, poolUndo.previousManualPreference)
    setPoolActionStatus(`Restored ${poolUndo.championName}.`)
    setPoolUndoStack((prev) => prev.slice(0, -1))
  }

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

  return (
    <div className="w-full max-w-4xl mx-auto px-3 sm:px-5 lg:px-6 py-2 sm:py-3 pb-10 text-nexus-text nexus-ops-scroll">
      {itemMatrixOpen && activeItemMatrixPlan ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/90 p-4">
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
            plans={itemMatrixPlans}
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
      <CollapsibleOpsSection
        id="CL_01"
        kicker="league // link"
        title="Client link"
        accent
        open={openSectionIds.has('CL_01')}
        onToggle={() => toggleSection('CL_01')}
      >
        <p className={`${textBody} mb-2`}>{lcuStatusLine}</p>
        {lcuError && <p className={`${errText} mb-2`}>{lcuError}</p>}
        <p className={`${textMuted} font-mono text-sm mb-4`}>
          Picks from: <span className="text-nexus-text/85">{copyDraftSource(draftSource)}</span>
        </p>
        <div className="space-y-4 border-t border-nexus-line/60 pt-4">
          <p className="font-display text-sm tracking-widest uppercase text-nexus-lime/90">My role (draft model)</p>
          <p className={`${textBody} text-sm`}>
            <span className="text-nexus-lime/95 font-medium">{String(effectiveMyRole)}</span>
            <span className="text-nexus-line"> · </span>
            {suggestionRoleLine}
          </p>
          <label className={`${textBody} flex items-center gap-2 cursor-pointer`}>
            <input
              type="checkbox"
              className="accent-nexus-lime h-3.5 w-3.5"
              checked={useManual}
              onChange={(e) => onUseManual(e.target.checked)}
            />
            Use manual board (ignores the League client for the 10 slots)
          </label>
        </div>
      </CollapsibleOpsSection>

      <CollapsibleOpsSection
        id="UP_01"
        kicker="release"
        title="App updates"
        open={openSectionIds.has('UP_01')}
        onToggle={() => toggleSection('UP_01')}
      >
        <p className={`${textBody} mb-4`} role="status">{appUpdateStatusLine}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnPrimary} disabled={appUpdateBusy} onClick={onCheckAppUpdate}>
            {appUpdateBusy ? 'Checking' : 'Check'}
          </button>
          <button
            type="button"
            className={btnPrimary}
            disabled={appUpdateBusy || !appUpdateAvailable}
            onClick={onDownloadAppUpdate}
          >
            Download
          </button>
          <button type="button" className={btnPrimary} disabled={!appUpdateReady} onClick={onInstallAppUpdate}>
            Install
          </button>
        </div>
      </CollapsibleOpsSection>

      {useManual && (
        <CollapsibleOpsSection
          id="BD_01"
          kicker="board"
          title="Manual draft (10 slots)"
          open={openSectionIds.has('BD_01')}
          onToggle={() => toggleSection('BD_01')}
        >
          <div className="mt-1 grid grid-cols-[5.5rem_1fr_1fr] gap-x-2 gap-y-1.5 text-xs sm:text-sm max-h-[22rem] overflow-y-auto nexus-ops-scroll pr-1 items-center">
            <div />
            <div className="text-center font-mono text-nexus-lime/85 uppercase text-[10px] tracking-widest">Ally</div>
            <div className="text-center font-mono text-nexus-lime/85 uppercase text-[10px] tracking-widest">Enemy</div>
            {ROLES.map((role) => (
              <div className="contents" key={role}>
                <span className="font-mono text-nexus-muted text-[10px] sm:text-xs uppercase tracking-wide">{role}</span>
                <select
                  className={inField + ' max-w-none w-full text-xs'}
                  value={manual.ally[role] ?? ''}
                  onChange={(e) => {
                    onManualAlly(role, parseChampionSelectValue(e.target.value))
                  }}
                >
                  <option value="">—</option>
                  {sorted.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <select
                  className={inField + ' max-w-none w-full text-xs'}
                  value={manual.enemy[role] ?? ''}
                  onChange={(e) => {
                    onManualEnemy(role, parseChampionSelectValue(e.target.value))
                  }}
                >
                  <option value="">—</option>
                  {sorted.map((c) => (
                    <option key={`e-${c.id}`} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </CollapsibleOpsSection>
      )}

      <CollapsibleOpsSection
        id="DI_01"
        kicker="coach"
        title="Draft intel"
        accent
        open={openSectionIds.has('DI_01')}
        onToggle={() => toggleSection('DI_01')}
      >
        {!draftIntel ? (
          <p className={`${textMuted} font-mono text-sm`}>Lock picks or use manual board to generate matchup plans, bans, and warnings.</p>
        ) : (
          <div className="space-y-4 font-mono text-sm">
            <div className="border-l-2 border-nexus-lime/70 bg-nexus-bg/25 px-3 py-2">
              <p className="m-0 text-nexus-lime/90 uppercase tracking-[0.12em] text-xs">Win condition</p>
              <p className="m-0 mt-1 text-nexus-text/90 leading-relaxed">{draftIntel.compIdentity.winCondition}</p>
            </div>
            <div className="grid gap-3">
              <div>
                <p className="m-0 mb-1 text-nexus-lime/85 uppercase tracking-[0.12em] text-xs">Loading brief</p>
                <ul className="m-0 list-disc pl-4 space-y-1 text-nexus-muted">
                  {draftIntel.loadingBrief.map((line, idx) => (
                    <li key={`brief-${idx}`}>{line}</li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="text-nexus-muted">
                <p className="m-0 mb-1 text-nexus-lime/85 uppercase tracking-[0.12em] text-xs">Identity</p>
                <p className="m-0">Ally: {draftIntel.compIdentity.ally.join(', ') || 'pending'}</p>
                <p className="m-0">Enemy: {draftIntel.compIdentity.enemy.join(', ') || 'pending'}</p>
                {draftIntel.compIdentity.missing.length > 0 && (
                  <p className="m-0 text-nexus-yellow/90">Missing: {draftIntel.compIdentity.missing.join(', ')}</p>
                )}
              </div>
              <div className="text-nexus-muted">
                <p className="m-0 mb-1 text-nexus-lime/85 uppercase tracking-[0.12em] text-xs">Warnings</p>
                <ul className="m-0 list-disc pl-4 space-y-1">
                  {draftIntel.compIdentity.warnings.slice(0, 4).map((line, idx) => (
                    <li key={`warn-${idx}`}>{line}</li>
                  ))}
                  {draftIntel.compIdentity.warnings.length === 0 && <li className="list-none -ml-4">No major warning yet.</li>}
                </ul>
              </div>
            </div>
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <p className="m-0 text-nexus-lime/85 uppercase tracking-[0.12em] text-xs">Top matchup plan</p>
                <button
                  type="button"
                  className={btnPrimary + ' px-3 py-1.5 text-[10px]'}
                  disabled={!topPlan}
                  onClick={() => {
                    if (topPlan) {
                      onPrepareItemMatrixPlans?.(topPlan.championId)
                      setItemMatrixPlan(topPlan)
                      setItemMatrixOpen(true)
                    }
                  }}
                >
                  Item matrix
                </button>
              </div>
              {topPlan ? (
                <div className="border border-nexus-line/60 bg-nexus-bg/25 px-3 py-2 text-nexus-muted leading-relaxed">
                  <p className="m-0 text-nexus-text/90">
                    {topPlan.championName}{topPlan.laneOpponentName ? ` vs ${topPlan.laneOpponentName}` : ''} - {topPlan.summonerSpells}
                  </p>
                  <p className="m-0 mt-1">Start: {topPlan.startingItem}</p>
                  <p className="m-0">Recall: {topPlan.firstRecall}</p>
                  <p className="m-0">Plan: {topPlan.gamePlan}</p>
                  {topPlan.itemPlan ? (
                    <details className="group mt-2">
                      <summary className="nexus-focus flex cursor-pointer list-none items-center justify-between gap-2 py-1.5 uppercase tracking-[0.12em] text-nexus-muted marker:hidden hover:text-nexus-text/90">
                        <span>Build</span>
                        <span className="text-nexus-lime/70 transition-transform group-open:rotate-45">+</span>
                      </summary>
                      <div className="pb-1">
                        <ItemPlanBlock
                          itemPlan={topPlan.itemPlan}
                          ddragonVersion={ddragonVersion}
                          limit={4}
                          showHeader={false}
                          onOpenMatrix={() => {
                            onPrepareItemMatrixPlans?.(topPlan.championId)
                            setItemMatrixPlan(topPlan)
                            setItemMatrixOpen(true)
                          }}
                        />
                      </div>
                    </details>
                  ) : null}
                  {!topPlan.itemPlan && itemMatrixStatus === 'preparing' ? (
                    <p className="m-0 mt-2 text-nexus-muted">Preparing items...</p>
                  ) : null}
                  {!topPlan.itemPlan && itemMatrixStatus === 'error' ? (
                    <p className="m-0 mt-2 text-nexus-red/80">{itemMatrixError ?? 'Item matrix could not be prepared.'}</p>
                  ) : null}
                </div>
              ) : (
                <p className="m-0 text-nexus-muted">No pick plan yet.</p>
              )}
            </div>
            <details className="border border-nexus-line/60 bg-nexus-bg/25 px-3 py-2">
              <summary className="nexus-focus cursor-pointer text-nexus-muted uppercase tracking-[0.12em] text-xs">Confidence</summary>
              <div className="mt-2 grid gap-3">
                <ul className="m-0 list-disc pl-4 space-y-1 text-nexus-muted">
                  {draftIntel.confidenceNotes.map((line, idx) => (
                    <li key={`conf-${idx}`}>{line}</li>
                  ))}
                </ul>
              </div>
            </details>
          </div>
        )}
      </CollapsibleOpsSection>

      <CollapsibleOpsSection
        id="MD_01"
        kicker="model"
        title="Draft model"
        open={openSectionIds.has('MD_01')}
        onToggle={() => toggleSection('MD_01')}
      >
        <div className="mb-4 grid min-w-0 gap-3 border-b border-nexus-line/50 pb-4">
          <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(8rem,10rem)_minmax(12rem,15rem)] lg:items-end xl:grid-cols-[minmax(8rem,10rem)_minmax(12rem,15rem)_minmax(0,1fr)]">
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="font-mono text-[10px] sm:text-xs text-nexus-lime/85 uppercase tracking-[0.12em]">
                Rollouts
              </span>
              <input
                type="number"
                min={0}
                max={maxSuggestMcRollouts}
                step={1}
                className={inField + ' max-w-none tabular-nums'}
                value={suggestMcRollouts}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  if (Number.isFinite(v)) {
                    onSuggestMcRollouts(v)
                  }
                }}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="font-mono text-[10px] sm:text-xs text-nexus-lime/85 uppercase tracking-[0.12em]">
                Delta sort
              </span>
              <select
                className={inField + ' max-w-none'}
                value={suggestDeltaListMode}
                onChange={(e) => onSuggestDeltaListMode(e.target.value === 'worst' ? 'worst' : 'best')}
              >
                <option value="best">Best in context first</option>
                <option value="worst">Worst in context first</option>
              </select>
            </label>
            <div className="min-w-0 border border-nexus-line/60 bg-nexus-bg/35 px-3 py-2 font-mono text-xs leading-relaxed text-nexus-muted lg:col-span-2 xl:col-span-1">
              <span className="block uppercase tracking-[0.12em] text-nexus-lime/80">
                {suggestMcRollouts > 0 ? `V1 + ${suggestMcRollouts} rollout(s)` : 'Fast V1'}
              </span>
              <span className="block whitespace-normal break-words" title={`Max ${maxSuggestMcRollouts} rollouts. Higher values react more as picks lock.`}>
                Max {maxSuggestMcRollouts}. Higher values react more as picks lock.
              </span>
            </div>
          </div>
          <p className={`${textMuted} m-0 max-w-3xl font-mono text-xs sm:text-sm leading-relaxed`}>
            {modelDescription}
          </p>
        </div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="m-0 font-mono text-xs uppercase tracking-[0.12em] text-nexus-lime/80">
            {suggestDeltaListMode === 'worst' ? 'Lowest lobby delta first' : 'Highest lobby delta first'}
          </p>
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-nexus-muted">
            {suggestions.length ? `${suggestions.length} picks` : 'No picks yet'}
          </span>
        </div>
        <ol className="list-decimal pl-4 sm:pl-5 space-y-3 font-mono text-sm text-nexus-text/90 max-w-3xl">
          {suggestions.length === 0 && (
            <li className="list-none -ml-4 sm:-ml-5 text-nexus-muted pl-0">
              No ideas yet — set role, load League champ select, or use manual picks.
            </li>
          )}
          {suggestions.map((s) => {
            const championKey = championKeyById.get(s.championId)
            const imageUrl = ddragonVersion && championKey ? ddragonChampionImageUrl(ddragonVersion, championKey) : null
            const matchupPlan = draftIntel?.matchupPlans.find((plan) => plan.championId === s.championId) ?? null
            return (
            <li key={s.championId} className="border-b border-nexus-line/40 pb-3 last:border-0 last:pb-0">
              <div className="flex gap-2">
                {imageUrl && (
                  <img
                    className="mt-0.5 h-9 w-9 shrink-0 border border-nexus-line bg-nexus-bg object-cover"
                    src={imageUrl}
                    alt=""
                    width={36}
                    height={36}
                  />
                )}
                <div className="min-w-0">
                  <span className="text-nexus-lime/95 font-medium">{s.championName}</span>
                  {s.isLockedPick && (
                    <span className="ml-2 border border-nexus-lime/60 px-1 py-0.5 text-[10px] uppercase tracking-[0.12em] text-nexus-lime/85">
                      Picked
                    </span>
                  )}
                  <span className="text-nexus-line"> </span>
                  <span className="text-nexus-lime/70">({s.score})</span>
                  {s.estWin != null && (
                    <span className="text-nexus-muted text-xs"> ~{(s.estWin * 100).toFixed(1)}% est</span>
                  )}{' '}
                  <span className="text-nexus-text/80">{s.reasons.join(', ')}</span>
              {s.baseWinRate != null && s.contextWinRate != null && s.winRateDelta != null && (
                <div className="text-nexus-muted text-xs mt-1">
                  WR {(s.baseWinRate * 100).toFixed(1)}% → {(s.contextWinRate * 100).toFixed(1)}%
                  <span className={s.winRateDelta >= 0 ? 'text-nexus-lime/80' : 'text-nexus-red/80'}>
                    {' '}
                    ({s.winRateDelta >= 0 ? '+' : ''}
                    {(s.winRateDelta * 100).toFixed(1)}%)
                  </span>
                </div>
              )}
              {s.detail && <div className="text-nexus-muted text-xs mt-1">{s.detail}</div>}
              {s.runes && (
                <div className="text-nexus-muted text-xs mt-1.5">
                  {s.runes.primaryTree} · {s.runes.keystone} · {s.runes.secondary}
                  {s.runes.note && <span> — {formatRuneTipNote(s.runes.note, '')}</span>}
                </div>
              )}
              {s.buildProfile && (
                <div className="text-nexus-muted text-xs mt-1.5 leading-relaxed">
                  <span className="text-nexus-lime/80 uppercase font-medium">{s.buildProfile.damage}</span>
                  <span className="text-nexus-line"> · </span>
                  <span>{s.buildProfile.archetype}</span>
                  {s.buildProfile.tagsLine !== '—' && (
                    <span className="text-nexus-line/80"> — {s.buildProfile.tagsLine}</span>
                  )}
                  <div className="text-nexus-text/80 mt-0.5">{s.buildProfile.buildHint}</div>
                  {s.buildProfile.itemHint && (
                    <div className="text-nexus-muted mt-0.5">
                      <span className="text-nexus-lime/75 uppercase">Items</span> · {s.buildProfile.itemHint}
                    </div>
                  )}
                </div>
              )}
              {matchupPlan?.itemPlan && (
                <details className="group mt-1.5">
                  <summary className="nexus-focus flex cursor-pointer list-none items-center justify-between gap-2 py-1.5 uppercase tracking-[0.12em] text-nexus-muted marker:hidden hover:text-nexus-text/90">
                    <span>Build</span>
                    <span className="text-nexus-lime/70 transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <div className="pb-1">
                    <ItemPlanBlock
                      itemPlan={matchupPlan.itemPlan}
                      ddragonVersion={ddragonVersion}
                      limit={3}
                      showHeader={false}
                      onOpenMatrix={() => {
                        onPrepareItemMatrixPlans?.(matchupPlan.championId)
                        setItemMatrixPlan(matchupPlan)
                        setItemMatrixOpen(true)
                      }}
                    />
                  </div>
                </details>
              )}
                </div>
              </div>
            </li>
            )
          })}
        </ol>
      </CollapsibleOpsSection>

      <CollapsibleOpsSection
        id="OV_01"
        kicker="hud"
        title="Overlay"
        open={openSectionIds.has('OV_01')}
        onToggle={() => toggleSection('OV_01')}
      >
        <p className={`${textMuted} text-sm mb-3`}>
          {overlayShortcutStatus?.registered.length ? (
            <>
              {overlayShortcutStatus.registered.map((shortcut, idx) => (
                <span key={`overlay-shortcut-${shortcut}`}>
                  {idx > 0 ? (idx === overlayShortcutStatus.registered.length - 1 ? ' or ' : ', ') : null}
                  <kbd className="px-1 border border-nexus-line/70 bg-nexus-bg text-nexus-text/90">{shortcut}</kbd>
                </span>
              ))}{' '}
              - show or hide the small window.
            </>
          ) : (
            <>Use the button below to show or hide the small window.</>
          )}{' '}
          Full-screen or borderless League works best.
        </p>
        {overlayShortcutStatus?.failed.length ? (
          <p className={`${textMuted} text-xs mb-3`}>
            Shortcuts unavailable: {overlayShortcutStatus.failed.join(', ')}.
          </p>
        ) : null}
        {overlayStatusLine ? <p className={`${textBody} mb-2`}>{overlayStatusLine}</p> : null}
        {overlayError ? <p className={`${errText} mb-2`}>{overlayError}</p> : null}
        <button type="button" className={btnPrimary} onClick={onToggleOverlay}>
          Toggle overlay
        </button>
      </CollapsibleOpsSection>
    </div>
  )
}
