import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type KeyboardEvent as ReactKeyEvent
} from 'react'
import { ddragonChampionImageUrl, getLatestDDragonVersion, loadChampionMaps, type ChampionLite } from '@shared/dataDragon'
import {
  bestAllySlotsForSuggestion,
  bestEnemySlotsForSuggestion,
  ENGINE_V1_LABEL,
  focusedContextSlots,
  formatRuneTipNote,
  resolveChampionName,
  suggestPicks,
  type DraftDeltaListMode,
  type DraftRole,
  type DraftSnapshot,
  type PickSuggestion,
  type SuggestionContextSlot
} from '@shared/draft'
import { MicroLabel, NexusPanel, NexusPlus } from './nexus-ui'
import { idbGetChampions, idbSetChampions } from './web/ddragonIndexedDbCache'
import {
  clearPersistedWebDraft,
  loadPersistedWebDraft,
  savePersistedWebDraft
} from './web/persistedWebDraft'
import { nexusWebTrack } from './web/webAnalytics'

const ROLES: Exclude<DraftRole, 'unknown'>[] = ['top', 'jungle', 'middle', 'bottom', 'support']
const DEFAULT_WEB_ROLLOUTS = 40
const MAX_WEB_ROLLOUTS = 200
const EXE_DOWNLOAD_URL = 'https://drive.google.com/file/d/18GEeVNACW8BYMhElANbsVbFWLC4dsp-3/view?usp=drive_link'
const VIRUSTOTAL_SCAN_URL =
  'https://www.virustotal.com/gui/file/29e021c773e315e67bfdcbcf753dff204227de7d7c4f257bfd4274686a976afa/detection'
const GITHUB_PROFILE_URL = 'https://github.com/alexg0405'
const VISITOR_COUNTER_URL = '/api/visit'

/** Solid dark fill + [color-scheme:dark] so native selects/inputs do not render as light system panels. */
const webFieldClass =
  'nexus-focus w-full rounded-md border border-white/[0.1] bg-[#0b1c16] text-[#e8f3ee] [color-scheme:dark] font-mono text-sm py-2.5 px-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] placeholder:text-nexus-muted/55 focus:border-nexus-lime/40 focus:outline-none focus:ring-1 focus:ring-nexus-lime/15 disabled:opacity-45'
const webFieldClassCompact = `${webFieldClass} py-2 text-xs`
const buttonClass =
  'nexus-focus inline-flex items-center justify-center font-display text-xs sm:text-sm tracking-[0.16em] uppercase px-5 py-2.5 border border-nexus-lime bg-nexus-lime text-nexus-bg border-nexus-lime/90 shadow-[0_0_24px_rgba(35,213,176,0.18)] hover:brightness-110 active:brightness-95 disabled:opacity-40'

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

type OcrUndoState = {
  board: ManualBoard
  championInputs: ManualInputBoard
  role: Exclude<DraftRole, 'unknown'>
}

function parseChampionId(value: string): number | null {
  const id = Number(value)
  return Number.isFinite(id) && id > 0 ? id : null
}

function roleLabel(role: DraftRole): string {
  if (role === 'bottom') {
    return 'adc'
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

function slotPicksToContextSlots(slots: DraftSnapshot['ally']): SuggestionContextSlot[] {
  return slots.map((p) => ({
    role: p.role,
    championName: p.championName,
    championId: p.championId
  }))
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
    />
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
      {src ? <img className="h-full w-full object-cover" src={src} alt="" width={28} height={28} /> : <span className="h-full w-full bg-nexus-bg" aria-hidden />}
    </span>
  )
}

function SuggestionRow({
  suggestion,
  champions,
  ddragonVersion,
  snapshot,
  myRole,
  nameById
}: {
  suggestion: PickSuggestion
  champions: ChampionLite[]
  ddragonVersion: string | null
  snapshot: DraftSnapshot
  myRole: Exclude<DraftRole, 'unknown'>
  nameById: ReadonlyMap<number, string>
}) {
  const poolRole: DraftRole = myRole
  const allyCtx = useMemo(() => slotPicksToContextSlots(snapshot.ally), [snapshot.ally])
  const enemyCtx = useMemo(() => slotPicksToContextSlots(snapshot.enemy), [snapshot.enemy])
  const { synergySlots, goodVsSlots } = useMemo(() => {
    const rankedAllies = bestAllySlotsForSuggestion(suggestion.championId, poolRole, allyCtx, null, 2)
    const rankedEnemies = bestEnemySlotsForSuggestion(suggestion.championId, poolRole, enemyCtx, 2)
    const allyFallback = focusedContextSlots(allyCtx, poolRole, 'ally')
    const enemyFallback = focusedContextSlots(enemyCtx, poolRole, 'enemy')
    return {
      synergySlots: rankedAllies.length ? rankedAllies : allyFallback,
      goodVsSlots: rankedEnemies.length ? rankedEnemies : enemyFallback
    }
  }, [suggestion.championId, poolRole, allyCtx, enemyCtx])
  const tip = formatRuneTipNote(
    suggestion.runes?.note,
    suggestion.buildProfile?.buildHint ?? 'Use this pick when it fits your lane matchup and team damage profile.'
  )
  return (
    <li className="rounded-lg border border-white/[0.07] bg-gradient-to-br from-nexus-surface-2/90 to-nexus-bg/85 px-3 py-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.2)] transition-colors hover:border-nexus-lime/25">
      <div className="flex gap-2.5">
        <ChampionIcon championId={suggestion.championId} champions={champions} ddragonVersion={ddragonVersion} />
        <div className="min-w-0 flex-1">
          <div className="font-mono text-sm font-bold leading-tight">
            <span className="text-nexus-lime/95">{suggestion.championName}</span>
            <span className="text-nexus-muted"> · </span>
            <span className="text-nexus-text/90 tabular-nums">{suggestion.score}</span>
          </div>
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
          aria-label="Team synergy and good-versus lobby context for this pick"
        >
          <p className="m-0 mb-2 flex items-baseline justify-between gap-2 font-mono text-[0.7rem] uppercase tracking-[0.1em] text-nexus-text/80">
            <span>
              <span className="text-nexus-lime/90">Team synergy</span>
              <span className="text-nexus-line"> / </span>
              <span className="text-nexus-red/85">Good vs</span>
            </span>
          </p>
          <div
            className="grid grid-cols-2 gap-2 rounded-md border border-white/[0.12] bg-nexus-bg/40 p-2 sm:gap-1.5"
            aria-label="Champion faces for best ally synergy and good-versus enemies"
          >
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
        <details className="group">
          <summary className="nexus-focus flex cursor-pointer list-none items-center justify-between gap-2 py-2 uppercase tracking-[0.1em] text-nexus-muted marker:hidden hover:text-nexus-text/90">
            <span>Tips</span>
            <span className="text-nexus-lime/70 transition-transform group-open:rotate-45">+</span>
          </summary>
          <div className="pb-2 text-nexus-text/80">
            <span>{tip}</span>
            {suggestion.buildProfile && suggestion.buildProfile.tagsLine !== '—' && (
              <p className="m-0 mt-1.5 text-nexus-muted/85">{suggestion.buildProfile.tagsLine}</p>
            )}
          </div>
        </details>
      </div>
    </li>
  )
}

function VisitorCounter({ dataLine, legalLine }: { dataLine?: string | null; legalLine?: string }) {
  const [count, setCount] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const domain = typeof window === 'undefined' ? 'nexus-draft' : window.location.hostname || 'nexus-draft'
    const body = {
      domain,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      page_path: typeof window === 'undefined' ? '/' : window.location.pathname,
      page_title: typeof document === 'undefined' ? 'Nexus Draft' : document.title,
      referrer: typeof document === 'undefined' ? '' : document.referrer
    }
    void fetch(VISITOR_COUNTER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`visitor counter ${res.status}`)
        }
        return res.json() as Promise<{ totalCount?: number; todayCount?: number }>
      })
      .then((data) => {
        setCount(typeof data.totalCount === 'number' ? data.totalCount : null)
      })
      .catch(() => {
        setFailed(true)
      })
  }, [])

  return (
    <div className="border-t border-nexus-line bg-nexus-surface-2/90 px-4 py-3 font-mono text-xs text-nexus-muted">
      <div className="mx-auto max-w-6xl">
        {dataLine ? (
          <p className="m-0 mb-2 text-[11px] leading-relaxed text-nexus-muted/95" title="Riot client patch (Data Dragon) and recommendation engine label.">
            {dataLine}
          </p>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <span>Nexus Draft web</span>
          <span className="text-nexus-lime/85" title="Total page visits recorded for this hosted web app.">
            Total visits: {count != null ? count.toLocaleString() : failed ? 'unavailable' : 'loading'}
          </span>
        </div>
        {legalLine ? <p className="m-0 mt-2 max-w-3xl text-[10px] leading-relaxed text-nexus-muted/80">{legalLine}</p> : null}
      </div>
    </div>
  )
}

export function WebDraftApp() {
  const [ddragonVersion, setDdragonVersion] = useState<string | null>(null)
  const [champions, setChampions] = useState<ChampionLite[]>([])
  const [nameById, setNameById] = useState(() => new Map<number, string>())
  const [loadError, setLoadError] = useState<string | null>(null)
  const [board, setBoard] = useState<ManualBoard>(() => {
    const p = loadPersistedWebDraft()
    return p ? cloneBoard(p.board as ManualBoard) : emptyBoard()
  })
  const [championInputs, setChampionInputs] = useState<ManualInputBoard>(() => {
    const p = loadPersistedWebDraft()
    return p ? cloneInputs(p.championInputs) : emptyInputBoard()
  })
  const [role, setRole] = useState<Exclude<DraftRole, 'unknown'>>(() => loadPersistedWebDraft()?.role ?? 'middle')
  const [rollouts, setRollouts] = useState(() => loadPersistedWebDraft()?.rollouts ?? DEFAULT_WEB_ROLLOUTS)
  const [deltaMode, setDeltaMode] = useState<DraftDeltaListMode>(() => loadPersistedWebDraft()?.deltaMode ?? 'best')
  const [visionStatus, setVisionStatus] = useState<string>('Upload a champion select screenshot to autofill the board.')
  const [visionBusy, setVisionBusy] = useState(false)
  const [activeChampionInput, setActiveChampionInput] = useState<ActiveChampionInput>(null)
  const [listCursor, setListCursor] = useState(0)
  const [ocrUndoSnapshot, setOcrUndoSnapshot] = useState<OcrUndoState | null>(null)
  const [ocrResult, setOcrResult] = useState<{
    ally: number
    enemy: number
    roleChanged: boolean
  } | null>(null)
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null)
  const firstChampInputRef = useRef<HTMLInputElement | null>(null)
  const listboxId = useId()

  const handleScreenshotPaste = (event: ClipboardEvent | ReactClipboardEvent<HTMLElement>) => {
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
        if (cached && cached.length > 0) {
          setDdragonVersion(version)
          setChampions(cached)
          setNameById(new Map(cached.map((c) => [c.id, c.name] as const)))
          return
        }
        const maps = await loadChampionMaps(version)
        if (cancelled) {
          return
        }
        setDdragonVersion(version)
        setChampions(maps.champions)
        setNameById(new Map(maps.champions.map((c) => [c.id, c.name] as const)))
        void idbSetChampions(version, maps.champions)
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
  const championByNormalizedName = useMemo(() => {
    return new Map(sortedChampions.map((champion) => [normalizeChampionQuery(champion.name), champion] as const))
  }, [sortedChampions])
  const championMetaById = useMemo(() => {
    return new Map(champions.map((c) => [c.id, { tags: c.tags, partype: c.partype }]))
  }, [champions])
  const snapshot = useMemo(() => buildSnapshot(board, role, nameById), [board, role, nameById])
  const { suggestions, patchLabel } = useMemo(() => {
    if (champions.length === 0) {
      return { suggestions: [], patchLabel: ENGINE_V1_LABEL }
    }
    return suggestPicks({
      myRole: role,
      snapshot,
      idToName: nameById,
      maxResults: 12,
      dataDragonVersion: ddragonVersion,
      monteCarloSamples: rollouts,
      rngSeed: 0x4d_44_57_45,
      championMetaById,
      trainedEffects: null,
      sortBy: 'delta',
      deltaListMode: deltaMode
    })
  }, [champions.length, role, snapshot, nameById, ddragonVersion, rollouts, championMetaById, deltaMode])

  const liveDataNote = useMemo(() => {
    if (loadError) {
      return null
    }
    if (!ddragonVersion) {
      return 'Loading League patch and champion data (Riot Data Dragon)…'
    }
    return `League patch ${ddragonVersion} — Riot Data Dragon (icons & champion metadata). Recommendations: ${patchLabel} · ${rollouts} rollouts.`
  }, [loadError, ddragonVersion, patchLabel, rollouts])

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
    return sortedChampions
      .filter((champion) => normalizeChampionQuery(champion.name).includes(normalized))
      .slice(0, 5)
  }

  const activeMatches = useMemo(() => {
    if (!activeChampionInput) {
      return [] as ChampionLite[]
    }
    return championMatches(championInputs[activeChampionInput.side][activeChampionInput.role])
  }, [activeChampionInput, championInputs, sortedChampions])

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

  const undoOcr = useCallback(() => {
    if (!ocrUndoSnapshot) {
      return
    }
    setBoard(cloneBoard(ocrUndoSnapshot.board))
    setChampionInputs(cloneInputs(ocrUndoSnapshot.championInputs))
    setRole(ocrUndoSnapshot.role)
    setOcrUndoSnapshot(null)
    setOcrResult(null)
    nexusWebTrack('ocr_undo')
  }, [ocrUndoSnapshot])

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
    const exact = championByNormalizedName.get(normalized)
    const candidates = sortedChampions.filter((champion) => normalizeChampionQuery(champion.name).startsWith(normalized))
    const picked = exact ?? (candidates.length === 1 ? candidates[0] : null)
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
    setOcrUndoSnapshot(null)
    setOcrResult(null)
  }

  const setChampionSlotByName = (side: 'ally' | 'enemy', slotRole: Exclude<DraftRole, 'unknown'>, championName: string) => {
    const normalized = normalizeChampionQuery(championName)
    const exact = championByNormalizedName.get(normalized)
    const candidates = sortedChampions.filter((champion) => normalizeChampionQuery(champion.name).startsWith(normalized))
    const picked = exact ?? (candidates.length === 1 ? candidates[0] : null)
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
    if (!file) {
      return
    }
    if (champions.length === 0) {
      setVisionStatus('Wait for champion data to load before autofill.')
      return
    }
    const roleAtStart = role
    setOcrUndoSnapshot({
      board: cloneBoard(board),
      championInputs: cloneInputs(championInputs),
      role: roleAtStart
    })
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
      setOcrResult({
        ally: allyN,
        enemy: enemyN,
        roleChanged: Boolean(detectedRole && detectedRole !== roleAtStart)
      })
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

  return (
    <div className="min-h-screen overflow-hidden [color-scheme:dark] bg-[radial-gradient(circle_at_20%_0%,rgba(35,213,176,0.14),transparent_32%),radial-gradient(circle_at_80%_10%,rgba(83,166,255,0.1),transparent_28%),linear-gradient(180deg,var(--nexus-bg),#03100c)] text-nexus-text font-body antialiased flex flex-col">
      <div className="nexus-noise fixed inset-0 pointer-events-none opacity-60" aria-hidden />
      <div className="pointer-events-none fixed inset-x-0 top-0 h-px bg-nexus-lime/70 shadow-[0_0_24px_rgba(35,213,176,0.7)]" aria-hidden />
      <a
        href="#nexus-web-main"
        className="nexus-focus absolute -left-[9999px] z-[200] h-px w-px overflow-hidden focus:fixed focus:left-4 focus:top-4 focus:h-auto focus:w-auto focus:overflow-visible focus:rounded focus:border focus:border-nexus-lime/60 focus:bg-nexus-bg focus:px-3 focus:py-2 focus:font-mono focus:text-sm focus:text-nexus-lime"
      >
        Skip to main
      </a>
      <main id="nexus-web-main" className="relative mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:px-6 lg:px-8">
        <section className="relative mb-5 overflow-hidden border border-nexus-line bg-nexus-surface-2/90 p-5 shadow-[0_20px_80px_rgba(0,0,0,0.28)]">
          <div className="absolute inset-0 bg-[linear-gradient(110deg,rgba(35,213,176,0.12),transparent_35%,rgba(83,166,255,0.08))]" aria-hidden />
          <div className="relative">
          <MicroLabel className="text-nexus-lime/80">web app // manual draft lab</MicroLabel>
          <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="font-display text-6xl sm:text-8xl leading-none tracking-[0.06em] text-nexus-text drop-shadow-[0_0_18px_rgba(231,255,245,0.10)]">
                NEXUS <span className="text-nexus-lime">DRAFT</span>
              </h1>
              <p className="mt-3 max-w-2xl font-mono text-sm text-nexus-muted leading-relaxed">
                Browser draft assistant with manual board entry.
              </p>
              {loadError ? (
                <p className="mt-2 m-0 max-w-2xl font-mono text-xs text-nexus-red/80 leading-relaxed">{loadError}</p>
              ) : (
                <p className="mt-2 m-0 max-w-2xl font-mono text-xs leading-relaxed text-nexus-text/80">
                  <span className="text-nexus-lime/80">Live data</span>
                  <span className="text-nexus-muted"> — </span>
                  {liveDataNote}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <a className={buttonClass} href={EXE_DOWNLOAD_URL} target="_blank" rel="noreferrer">
                Download EXE
              </a>
              <a
                className="nexus-focus inline-flex items-center justify-center border border-nexus-line px-5 py-2.5 font-display text-xs sm:text-sm tracking-[0.16em] uppercase text-nexus-lime/90 hover:border-nexus-lime/60 hover:bg-nexus-lime/10"
                href={VIRUSTOTAL_SCAN_URL}
                target="_blank"
                rel="noreferrer"
              >
                VirusTotal Scan
              </a>
              <button type="button" className={buttonClass} onClick={resetBoard}>
                Reset Board
              </button>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-nexus-line/60 pt-3 font-mono text-xs uppercase tracking-[0.12em]">
            <a className="text-nexus-lime/85 hover:text-nexus-lime" href={GITHUB_PROFILE_URL} target="_blank" rel="noreferrer">
              GitHub
            </a>
          </div>
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_390px]">
          <div className="min-w-0">
            <NexusPanel kicker="manual" title="Draft board" accent>
              <div className="mb-5 border border-nexus-lime/25 bg-gradient-to-br from-nexus-bg/55 to-nexus-surface-2/60 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="m-0 font-display text-base tracking-[0.14em] uppercase text-nexus-lime/90">
                      Screenshot autofill
                    </p>
                    <p className="m-0 mt-1 font-mono text-xs leading-relaxed text-nexus-muted">
                      Upload or paste a League champion select screenshot. Vision reads visible ally/enemy champions and fills the board.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <label className="nexus-focus inline-flex cursor-pointer items-center justify-center border border-nexus-line px-4 py-2 font-display text-xs tracking-[0.16em] uppercase text-nexus-lime/90 hover:border-nexus-lime/60 hover:bg-nexus-lime/10">
                      {visionBusy ? 'Reading...' : 'Upload Screenshot'}
                      <input
                        className="sr-only"
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        disabled={visionBusy}
                        onChange={(event) => {
                          const file = event.target.files?.[0] ?? null
                          void parseDraftScreenshot(file)
                          event.currentTarget.value = ''
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="nexus-focus inline-flex items-center justify-center border border-nexus-line px-4 py-2 font-display text-xs tracking-[0.16em] uppercase text-nexus-lime/90 hover:border-nexus-lime/60 hover:bg-nexus-lime/10"
                      onClick={() => setVisionStatus('Copy a screenshot, then press Ctrl+V anywhere on this page.')}
                    >
                      Paste Screenshot
                    </button>
                  </div>
                </div>
                <div
                  className="mt-3 border border-dashed border-nexus-lime/40 bg-nexus-bg/30 px-3 py-2 font-mono text-xs text-nexus-muted transition-colors hover:border-nexus-lime/70 hover:text-nexus-text"
                  tabIndex={0}
                  role="button"
                  onPaste={handleScreenshotPaste}
                  onClick={() => setVisionStatus('Copy a screenshot, then press Ctrl+V anywhere on this page.')}
                >
                  Paste target: click here, then press Ctrl+V with a copied screenshot.
                </div>
                <p
                  className={visionStatus.toLowerCase().includes('failed') || visionStatus.toLowerCase().includes('key') ? 'm-0 mt-2 font-mono text-xs text-nexus-red/80' : 'm-0 mt-2 font-mono text-xs text-nexus-muted'}
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {visionStatus}
                </p>
                {ocrUndoSnapshot ? (
                  <div className="mt-2 space-y-2 rounded border border-nexus-lime/20 bg-nexus-bg/50 px-3 py-2">
                    {ocrResult ? (
                      <p className="m-0 font-mono text-xs text-nexus-text/90">
                        Autofill: <span className="text-nexus-lime/85">{ocrResult.ally}</span> ally name(s),{' '}
                        <span className="text-nexus-lime/85">{ocrResult.enemy}</span> enemy name(s) from the image.
                      </p>
                    ) : (
                      <p className="m-0 font-mono text-xs text-nexus-muted">
                        Autofill did not complete; you can restore the board from before the attempt.
                      </p>
                    )}
                    {ocrResult?.roleChanged ? (
                      <p className="m-0 font-mono text-xs text-nexus-muted">Your role was updated from vision (check &quot;Your role&quot; above).</p>
                    ) : null}
                    <button
                      type="button"
                      className="nexus-focus font-mono text-xs uppercase tracking-wide text-nexus-lime/90 hover:underline"
                      onClick={undoOcr}
                    >
                      Undo autofill
                    </button>
                  </div>
                ) : null}
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
                  <section key={side} className="rounded-md border border-white/[0.07] bg-nexus-bg/30 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                    <h3 className="font-display text-base tracking-[0.14em] uppercase text-nexus-lime/90 mb-3">
                      {side === 'ally' ? 'Allies' : 'Enemies'}
                    </h3>
                    <div className="space-y-2">
                      {ROLES.map((slotRole) => {
                        const matches = championMatches(championInputs[side][slotRole])
                        const isActive = activeChampionInput?.side === side && activeChampionInput.role === slotRole
                        const isFirstSlot = side === 'ally' && slotRole === 'top'
                        return (
                          <label key={`${side}-${slotRole}`} className="grid grid-cols-[4.5rem_2rem_minmax(0,1fr)] gap-2 items-center border-b border-white/[0.05] pb-2 last:border-0 last:pb-0">
                            <span className={slotRole === role && side === 'ally' ? 'font-mono text-xs uppercase text-nexus-blue' : 'font-mono text-xs uppercase text-nexus-muted'}>
                              {roleLabel(slotRole)}
                            </span>
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
            </NexusPanel>
          </div>

          <aside className="min-w-0" aria-label="Recommendations and desktop download">
            <NexusPanel kicker="recommendations" title={`Picks for ${roleLabel(role)}`} accent>
              <div className="mb-3 border-b border-nexus-line/60 bg-nexus-bg/25 px-2 py-2 font-mono text-xs">
                {loadError ? (
                  <p className="m-0 text-nexus-red/80" role="status">
                    {loadError}
                  </p>
                ) : (
                  <p className="m-0 leading-relaxed text-nexus-text/85">
                    <span className="text-nexus-lime/80">Live data</span>
                    <span className="text-nexus-muted"> — </span>
                    {liveDataNote}
                  </p>
                )}
              </div>
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
              <a className={buttonClass + ' mt-3'} href={EXE_DOWNLOAD_URL} target="_blank" rel="noreferrer">
                Download EXE
              </a>
              <a
                className="nexus-focus mt-2 inline-flex items-center justify-center border border-nexus-line px-5 py-2.5 font-display text-xs tracking-[0.16em] uppercase text-nexus-lime/90 hover:border-nexus-lime/60 hover:bg-nexus-lime/10"
                href={VIRUSTOTAL_SCAN_URL}
                target="_blank"
                rel="noreferrer"
              >
                View Safety Scan
              </a>
              <div className="mt-4 flex items-center gap-2 border-t border-nexus-line/50 pt-3 text-nexus-muted">
                <NexusPlus className="text-[10px]" />
                <span className="font-mono text-xs">Web build v0.4.0</span>
              </div>
            </NexusPanel>
          </aside>
        </div>
      </main>
      <VisitorCounter
        dataLine={
          loadError
            ? 'League data failed to load — recommendations may be unavailable.'
            : ddragonVersion
              ? `League patch ${ddragonVersion} (Data Dragon) · model ${patchLabel}.`
              : 'Loading current League patch from Riot…'
        }
        legalLine="Nexus Draft is a fan project and is not affiliated with or endorsed by Riot Games, Inc. League of Legends and Riot Games are trademarks of Riot Games, Inc. Game data: Riot Data Dragon."
      />
    </div>
  )
}
