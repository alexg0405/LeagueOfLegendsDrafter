import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState, type DragEvent as ReactDragEvent, type ReactNode } from 'react'
import { ddragonChampionImageUrl, type ChampionLite } from '@shared/dataDragon'
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
import { DraftItemPlanBlock as ItemPlanBlock } from './DraftItemPlanBlock'
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
      layout={!reduce}
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
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={contentId}
            key="ops-section-body"
            className="border-t border-nexus-line px-4 py-4 sm:px-5 sm:py-5 text-sm sm:text-base leading-relaxed"
            initial={reduce ? false : { height: 0, opacity: 0, scale: 0.98, y: -6 }}
            animate={reduce ? undefined : { height: 'auto', opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? undefined : { height: 0, opacity: 0, scale: 0.98, y: -6 }}
            transition={reduce ? { duration: 0 } : { duration: 0.18, ease: EASING.out }}
          >
            <MicroLabel className="block mb-2 text-nexus-lime/75">{kicker}</MicroLabel>
            <h2 className="font-display text-base sm:text-lg tracking-[0.14em] uppercase text-nexus-lime/95 mb-3 sm:mb-4">
              {title}
            </h2>
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  )
}

export type NexusOperationsViewProps = {
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
  appUpdateStatusLine: string
  appUpdateBusy: boolean
  appUpdateAvailable: boolean
  appUpdateReady: boolean
  onCheckAppUpdate: () => void
  onDownloadAppUpdate: () => void
  onInstallAppUpdate: () => void
  playerPoolProfile: PlayerChampionPoolProfile | null
  playerPoolStatus: string | null
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
  appUpdateStatusLine,
  appUpdateBusy,
  appUpdateAvailable,
  appUpdateReady,
  onCheckAppUpdate,
  onDownloadAppUpdate,
  onInstallAppUpdate,
  playerPoolProfile,
  playerPoolStatus,
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
              </div>
              {topPlan ? (
                <div className="border border-nexus-line/60 bg-nexus-bg/25 px-3 py-2 text-nexus-muted leading-relaxed">
                  <p className="m-0 text-nexus-text/90">
                    {topPlan.championName}{topPlan.laneOpponentName ? ` vs ${topPlan.laneOpponentName}` : ''} - {topPlan.summonerSpells}
                  </p>
                  <p className="m-0 mt-1">Start: {topPlan.startingItem}</p>
                  <p className="m-0">Recall: {topPlan.firstRecall}</p>
                  <p className="m-0">Plan: {topPlan.gamePlan}</p>
                  <ItemPlanBlock itemPlan={topPlan.itemPlan} ddragonVersion={ddragonVersion} limit={4} />
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
        id="CP_01"
        kicker="personal"
        title={`Champion pool${DESKTOP_PLAYER_POOL_IMPORT_ENABLED ? '' : ' import WIP'}`}
        open={openSectionIds.has('CP_01')}
        onToggle={() => toggleSection('CP_01')}
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex overflow-hidden border border-nexus-line/70">
            {(['my-champs', 'all-champs'] as const).map((mode) => (
              <button
                key={`pool-mode-${mode}`}
                type="button"
                className={
                  'nexus-focus px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] ' +
                  (recommendationPoolMode === mode
                    ? 'bg-nexus-lime text-nexus-bg'
                    : 'bg-transparent text-nexus-muted hover:text-nexus-text')
                }
                onClick={() => onRecommendationPoolMode(mode)}
              >
                {mode === 'my-champs' ? 'My Champs' : 'All Champs'}
              </button>
            ))}
          </div>
          {playerPoolProfile ? (
            <span className="font-mono text-xs text-nexus-muted">
              {playerPoolProfile.riotId} / {playerPoolProfile.platform.toUpperCase()} / {playerPoolProfile.entries.length} champs
            </span>
          ) : null}
        </div>
        <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_auto] sm:items-end">
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-nexus-lime/85">Riot ID</span>
            <input
              className={inField}
              value={riotIdInput}
              onChange={(e) => setRiotIdInput(e.target.value)}
              placeholder={DESKTOP_PLAYER_POOL_IMPORT_ENABLED ? 'GameName#TagLine' : 'Riot ID import paused'}
              autoComplete="off"
              disabled={!DESKTOP_PLAYER_POOL_IMPORT_ENABLED}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-nexus-lime/85">Platform</span>
            <select
              className={inField}
              value={riotPlatform}
              onChange={(e) => setRiotPlatform(e.target.value as RiotPlatform)}
              disabled={!DESKTOP_PLAYER_POOL_IMPORT_ENABLED}
            >
              {RIOT_PLATFORMS.map((platform) => (
                <option key={`riot-platform-${platform}`} value={platform}>
                  {platform.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={btnPrimary}
            disabled={playerPoolBusy || !DESKTOP_PLAYER_POOL_IMPORT_ENABLED}
            onClick={() => {
              setPoolActionStatus(null)
              setPoolUndoStack([])
              onImportPlayerChampionPool(riotIdInput, riotPlatform)
            }}
          >
            {!DESKTOP_PLAYER_POOL_IMPORT_ENABLED ? 'WIP' : playerPoolBusy ? 'Importing' : 'Import'}
          </button>
        </div>
        {poolStatusLine ? <p className={`${textMuted} mb-4 font-mono text-sm`} role="status">{poolStatusLine}</p> : null}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div
            className={
              'nexus-focus inline-flex h-10 w-10 items-center justify-center border text-nexus-muted transition-colors ' +
              (poolTrashActive
                ? 'border-nexus-red/80 bg-nexus-red/15 text-nexus-red'
                : 'border-nexus-line bg-nexus-bg/40 hover:border-nexus-red/60 hover:text-nexus-red/85')
            }
            role="button"
            tabIndex={0}
            title="Drop a champion chip here to remove it from My Champs"
            aria-label="Drop a champion chip here to remove it from My Champs"
            onDragOver={(event) => {
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
              setPoolTrashActive(true)
            }}
            onDragLeave={() => setPoolTrashActive(false)}
            onDrop={handlePoolTrashDrop}
          >
            <PoolTrashIcon className="h-4 w-4" />
          </div>
          {poolUndo ? (
            <button
              type="button"
              className="nexus-focus border border-nexus-line bg-nexus-bg/40 px-3 py-2 font-mono text-xs uppercase tracking-[0.12em] text-nexus-lime/90 hover:border-nexus-lime/50"
              onClick={undoChampionPoolRemoval}
            >
              Undo{poolUndoStack.length > 1 ? ` (${poolUndoStack.length})` : ''}
            </button>
          ) : null}
        </div>
        {playerPoolProfile && playerPoolProfile.entries.length > 0 ? (
          <div className="mb-4 flex flex-wrap gap-2">
            {visibleImportedPoolEntries.slice(0, 20).map((entry) => (
              <button
                key={`imported-pool-${entry.championId}`}
                type="button"
                draggable
                className="nexus-focus cursor-grab border border-nexus-line bg-nexus-bg/40 px-2 py-1 font-mono text-xs text-nexus-muted hover:border-nexus-red/50 hover:text-nexus-text active:cursor-grabbing"
                title="Click or drag to trash to remove"
                onClick={() => removeChampionFromPool(entry.championId)}
                onDragStart={(event) => handlePoolChipDragStart(event, entry.championId)}
              >
                <span className="text-nexus-text/90">{championNameById.get(entry.championId) ?? `Champion ${entry.championId}`}</span> /{' '}
                {championPoolPreferences[String(entry.championId)] ?? entry.preference}
              </button>
            ))}
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end">
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-nexus-lime/85">Champion</span>
            <select className={inField} value={poolChampionId ?? ''} onChange={(e) => setPoolChampionId(parseChampionSelectValue(e.target.value))}>
              <option value="">Choose champion</option>
              {sorted.map((c) => (
                <option key={`pool-${c.id}`} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-nexus-lime/85">Preference</span>
            <select className={inField} value={poolPreference} onChange={(e) => setPoolPreference(e.target.value as ChampionPoolPreference)}>
              {CHAMPION_POOL_PREFERENCES.map((pref) => (
                <option key={pref.value} value={pref.value}>{pref.label}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={btnPrimary}
            disabled={poolChampionId == null}
            onClick={() => {
              if (poolChampionId != null) {
                onChampionPoolPreference(poolChampionId, poolPreference)
                setPoolUndoStack([])
                setPoolActionStatus(null)
              }
            }}
          >
            Save
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {visibleManualPoolEntries.length === 0 && visibleImportedPoolEntries.length === 0 && (
            <span className="font-mono text-sm text-nexus-muted">No personal pool weights yet. Mark mains to lift them in draft scoring.</span>
          )}
          {visibleManualPoolEntries.map(([id, pref]) => (
            <button
              key={id}
              type="button"
              draggable
              className="nexus-focus cursor-grab border border-nexus-line bg-nexus-bg/40 px-2 py-1 font-mono text-xs text-nexus-muted hover:border-nexus-red/50 hover:text-nexus-text active:cursor-grabbing"
              title="Click or drag to trash to remove"
              onClick={() => removeChampionFromPool(Number(id))}
              onDragStart={(event) => handlePoolChipDragStart(event, Number(id))}
            >
              <span className="text-nexus-text/90">{championNameById.get(Number(id)) ?? `Champion ${id}`}</span> / {pref}
            </button>
          ))}
        </div>
      </CollapsibleOpsSection>

      <CollapsibleOpsSection
        id="MD_01"
        kicker="model"
        title="Draft model"
        open={openSectionIds.has('MD_01')}
        onToggle={() => toggleSection('MD_01')}
      >
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3 mb-4 border-b border-nexus-line/50 pb-4">
          <label className="flex flex-col gap-1.5 min-w-0">
            <span className="font-mono text-[10px] sm:text-xs text-nexus-lime/85 uppercase tracking-[0.12em]">
              Monte Carlo rollouts
            </span>
            <input
              type="number"
              min={0}
              max={maxSuggestMcRollouts}
              step={1}
              className={inField + ' w-[6.5rem] tabular-nums'}
              value={suggestMcRollouts}
              onChange={(e) => {
                const v = Number(e.target.value)
                if (Number.isFinite(v)) {
                  onSuggestMcRollouts(v)
                }
              }}
            />
          </label>
          <label className="flex flex-col gap-1.5 min-w-0">
            <span className="font-mono text-[10px] sm:text-xs text-nexus-lime/85 uppercase tracking-[0.12em]">
              Delta list
            </span>
            <select
              className={inField + ' w-[11rem]'}
              value={suggestDeltaListMode}
              onChange={(e) => onSuggestDeltaListMode(e.target.value === 'worst' ? 'worst' : 'best')}
            >
              <option value="best">Best in context first</option>
              <option value="worst">Worst in context first</option>
            </select>
          </label>
          <p className={`${textMuted} text-xs sm:text-sm max-w-xl m-0 flex-1 min-w-0 leading-relaxed`}>
            0 = fast V1. Higher rollouts react more as picks lock; max {maxSuggestMcRollouts}.
          </p>
        </div>
        <p className={`${textMuted} text-sm sm:text-base leading-relaxed mb-4`}>
          {modelDescription}
        </p>
        <p className="font-mono text-xs text-nexus-lime/80 mb-3">
          {suggestDeltaListMode === 'worst' ? 'Lowest lobby delta first' : 'Highest lobby delta first'}
        </p>
        <ol className="list-decimal pl-4 sm:pl-5 space-y-3 font-mono text-sm text-nexus-text/90 max-w-3xl">
          {suggestions.length === 0 && (
            <li className="list-none -ml-4 sm:-ml-5 text-nexus-muted pl-0">
              No ideas yet — set role, load League champ select, or use manual picks.
            </li>
          )}
          {suggestions.map((s) => {
            const championKey = championKeyById.get(s.championId)
            const imageUrl = ddragonVersion && championKey ? ddragonChampionImageUrl(ddragonVersion, championKey) : null
            const plan = draftIntel?.matchupPlans.find((row) => row.championId === s.championId) ?? null
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
                  <ItemPlanBlock itemPlan={plan?.itemPlan} ddragonVersion={ddragonVersion} limit={4} />
                </div>
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
          <kbd className="px-1 border border-nexus-line/70 bg-nexus-bg text-nexus-text/90">Insert</kbd>,{' '}
          <kbd className="px-1 border border-nexus-line/70 bg-nexus-bg text-nexus-text/90">F9</kbd>, or{' '}
          <kbd className="px-1 border border-nexus-line/70 bg-nexus-bg text-nexus-text/90">F10</kbd> — show or hide
          the small window. Full-screen or borderless League works best.
        </p>
        <button type="button" className={btnPrimary} onClick={onToggleOverlay}>
          Toggle overlay
        </button>
      </CollapsibleOpsSection>
    </div>
  )
}
