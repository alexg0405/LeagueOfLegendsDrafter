import { useEffect, useMemo, useState } from 'react'
import { ddragonChampionImageUrl, getLatestDDragonVersion, loadChampionMaps, type ChampionLite } from '@shared/dataDragon'
import {
  ENGINE_V1_LABEL,
  draftBoardSignature,
  resolveChampionName,
  suggestPicks,
  type DraftDeltaListMode,
  type DraftRole,
  type DraftSnapshot,
  type PickSuggestion
} from '@shared/draft'
import { MicroLabel, NexusPanel, NexusPlus } from './nexus-ui'

const ROLES: Exclude<DraftRole, 'unknown'>[] = ['top', 'jungle', 'middle', 'bottom', 'support']
const DEFAULT_WEB_ROLLOUTS = 40
const MAX_WEB_ROLLOUTS = 200
const EXE_DOWNLOAD_URL = 'https://drive.google.com/file/d/18GEeVNACW8BYMhElANbsVbFWLC4dsp-3/view?usp=drive_link'
const VIRUSTOTAL_SCAN_URL =
  'https://www.virustotal.com/gui/file/29e021c773e315e67bfdcbcf753dff204227de7d7c4f257bfd4274686a976afa/detection'
const GITHUB_PROFILE_URL = 'https://github.com/alexg0405'
const LINKEDIN_PROFILE_URL = 'https://www.linkedin.com/in/alexanderguodev'
const VISITOR_COUNTER_URL = 'https://visitor.6developer.com/visit'

const inputClass =
  'nexus-focus w-full bg-nexus-bg border border-nexus-line text-nexus-text font-mono text-sm py-2 px-3 focus:border-nexus-lime/50 focus:outline-none disabled:opacity-45'
const buttonClass =
  'nexus-focus inline-flex items-center justify-center font-display text-xs sm:text-sm tracking-[0.16em] uppercase px-5 py-2.5 border border-nexus-lime bg-nexus-lime text-nexus-bg border-nexus-lime/90 hover:brightness-110 active:brightness-95 disabled:opacity-40'

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

function shortIntel(text: string | null | undefined, fallback: string): string {
  if (!text) {
    return fallback
  }
  const first = text.split(/[.!?]/)[0]?.trim()
  return first ? first.slice(0, 120) : fallback
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

function SuggestionRow({
  suggestion,
  champions,
  ddragonVersion
}: {
  suggestion: PickSuggestion
  champions: ChampionLite[]
  ddragonVersion: string | null
}) {
  const tip = shortIntel(
    suggestion.runes?.note,
    suggestion.buildProfile?.buildHint ?? 'Use this pick when it fits your lane matchup and team damage profile.'
  )
  return (
    <li className="border border-nexus-line/80 bg-nexus-surface-2/80 px-3 py-2">
      <div className="flex gap-2">
        <ChampionIcon championId={suggestion.championId} champions={champions} ddragonVersion={ddragonVersion} />
        <div className="min-w-0 flex-1">
          <div className="font-mono text-sm font-bold leading-tight">
            <span className="text-nexus-lime/95">{suggestion.championName}</span>
            <span className="text-nexus-muted"> · </span>
            <span className="text-nexus-text/90 tabular-nums">{suggestion.score}</span>
          </div>
          {suggestion.baseWinRate != null && suggestion.contextWinRate != null && suggestion.winRateDelta != null && (
            <div className="mt-1 font-mono text-xs text-nexus-muted tabular-nums">
              {(suggestion.baseWinRate * 100).toFixed(1)}% -&gt; {(suggestion.contextWinRate * 100).toFixed(1)}%
              <span className={suggestion.winRateDelta >= 0 ? 'text-nexus-lime/85' : 'text-nexus-red/80'}>
                {' '}
                ({suggestion.winRateDelta >= 0 ? '+' : ''}
                {(suggestion.winRateDelta * 100).toFixed(1)}%)
              </span>
            </div>
          )}
          {suggestion.buildProfile && (
            <div className="mt-1 font-mono text-[11px] leading-snug text-nexus-muted">
              {suggestion.buildProfile.archetype}
            </div>
          )}
        </div>
      </div>
      <div className="mt-2 grid grid-cols-1 gap-1.5">
        {suggestion.runes && (
          <details className="group border border-nexus-line/65 bg-nexus-bg/25 font-mono text-[11px] leading-snug text-nexus-text/75">
            <summary className="nexus-focus flex cursor-pointer list-none items-center justify-between gap-2 px-2 py-1.5 uppercase tracking-[0.12em] text-nexus-muted marker:hidden">
              <span>Runes</span>
              <span className="text-nexus-lime/80 transition-transform group-open:rotate-45">+</span>
            </summary>
            <div className="border-t border-nexus-line/55 px-2 py-1.5">
              <span className="text-nexus-lime/85">{suggestion.runes.keystone}</span>
              <span className="text-nexus-muted"> / {suggestion.runes.primaryTree}</span>
              <div className="mt-0.5 text-nexus-muted/85">{suggestion.runes.secondary}</div>
            </div>
          </details>
        )}
        <details className="group border border-nexus-line/65 bg-nexus-bg/25 font-mono text-[11px] leading-snug text-nexus-text/75">
          <summary className="nexus-focus flex cursor-pointer list-none items-center justify-between gap-2 px-2 py-1.5 uppercase tracking-[0.12em] text-nexus-muted marker:hidden">
            <span>Tips</span>
            <span className="text-nexus-lime/80 transition-transform group-open:rotate-45">+</span>
          </summary>
          <div className="border-t border-nexus-line/55 px-2 py-1.5">
            <span>{tip}</span>
            {suggestion.buildProfile && (
              <div className="mt-1 text-nexus-muted">
                {suggestion.buildProfile.archetype}
                {suggestion.buildProfile.tagsLine !== '—' && <span> · {suggestion.buildProfile.tagsLine}</span>}
              </div>
            )}
          </div>
        </details>
      </div>
    </li>
  )
}

function VisitorCounter() {
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
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
        <span>Nexus Draft web</span>
        <span className="text-nexus-lime/85" title="Total page visits recorded for this hosted web app.">
          Total visits: {count != null ? count.toLocaleString() : failed ? 'unavailable' : 'loading'}
        </span>
      </div>
    </div>
  )
}

export function WebDraftApp() {
  const [ddragonVersion, setDdragonVersion] = useState<string | null>(null)
  const [champions, setChampions] = useState<ChampionLite[]>([])
  const [nameById, setNameById] = useState(() => new Map<number, string>())
  const [loadError, setLoadError] = useState<string | null>(null)
  const [role, setRole] = useState<Exclude<DraftRole, 'unknown'>>('middle')
  const [board, setBoard] = useState<ManualBoard>(emptyBoard)
  const [championInputs, setChampionInputs] = useState<ManualInputBoard>(emptyInputBoard)
  const [rollouts, setRollouts] = useState(DEFAULT_WEB_ROLLOUTS)
  const [deltaMode, setDeltaMode] = useState<DraftDeltaListMode>('best')
  const [visionStatus, setVisionStatus] = useState<string>('Upload a champion select screenshot to autofill the board.')
  const [visionBusy, setVisionBusy] = useState(false)
  const [activeChampionInput, setActiveChampionInput] = useState<ActiveChampionInput>(null)

  useEffect(() => {
    let cancelled = false
    void getLatestDDragonVersion()
      .then(async (version) => {
        const maps = await loadChampionMaps(version)
        if (cancelled) {
          return
        }
        setDdragonVersion(version)
        setChampions(maps.champions)
        setNameById(new Map(maps.champions.map((c) => [c.id, c.name] as const)))
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : String(error))
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const sortedChampions = useMemo(() => champions.slice().sort((a, b) => a.name.localeCompare(b.name)), [champions])
  const championByNormalizedName = useMemo(() => {
    return new Map(sortedChampions.map((champion) => [normalizeChampionQuery(champion.name), champion] as const))
  }, [sortedChampions])
  const championMetaById = useMemo(() => {
    return new Map(champions.map((c) => [c.id, { tags: c.tags, partype: c.partype }]))
  }, [champions])
  const snapshot = useMemo(() => buildSnapshot(board, role, nameById), [board, role, nameById])
  const boardSignature = useMemo(
    () =>
      draftBoardSignature(snapshot, role, {
        mcRollouts: rollouts,
        sortBy: 'delta',
        deltaListMode: deltaMode
      }),
    [snapshot, role, rollouts, deltaMode]
  )
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

  const pickChampionInput = (side: 'ally' | 'enemy', slotRole: Exclude<DraftRole, 'unknown'>, champion: ChampionLite) => {
    setChampionInputs((prev) => ({
      ...prev,
      [side]: {
        ...prev[side],
        [slotRole]: champion.name
      }
    }))
    updateBoard(side, slotRole, champion.id)
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
    setBoard(emptyBoard())
    setChampionInputs(emptyInputBoard())
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
    for (const row of rows ?? []) {
      const slotRole = normalizeRole(row.role)
      if (!slotRole) {
        continue
      }
      const name = row.championName?.trim() ?? ''
      if (!name) {
        continue
      }
      setChampionSlotByName(side, slotRole, name)
    }
  }

  const parseDraftScreenshot = async (file: File | null) => {
    if (!file) {
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
      applyVisionRows('ally', data.allyPicks)
      applyVisionRows('enemy', data.enemyPicks)
      const detectedRole = normalizeRole(data.myRole)
      if (detectedRole) {
        setRole(detectedRole)
      }
      setVisionStatus(`Autofill complete${data.confidence ? ` (${data.confidence} confidence)` : ''}. Check the board for mistakes.`)
    } catch (error) {
      setVisionStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setVisionBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-nexus-bg text-nexus-text font-body antialiased flex flex-col">
      <div className="nexus-noise fixed inset-0 pointer-events-none" aria-hidden />
      <main className="relative mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:px-6 lg:px-8">
        <section className="mb-4 border border-nexus-line bg-nexus-surface-2/90 p-5">
          <MicroLabel className="text-nexus-lime/80">web app</MicroLabel>
          <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="font-display text-5xl sm:text-7xl leading-none tracking-[0.06em] text-nexus-text">
                NEXUS <span className="text-nexus-lime">DRAFT</span>
              </h1>
              <p className="mt-3 max-w-2xl font-mono text-sm text-nexus-muted leading-relaxed">
                Browser draft assistant with manual board entry. The Windows app still provides live LCU and overlay support.
              </p>
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
              GitHub @ alexg0405
            </a>
            <span className="text-nexus-line">/</span>
            <a className="text-nexus-lime/85 hover:text-nexus-lime" href={LINKEDIN_PROFILE_URL} target="_blank" rel="noreferrer">
              LinkedIn @ alexanderguodev
            </a>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0">
            <NexusPanel kicker="manual" title="Draft board" accent>
              <div className="mb-5 border border-nexus-line/80 bg-nexus-bg/25 p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="m-0 font-display text-base tracking-[0.14em] uppercase text-nexus-lime/90">
                      Screenshot autofill
                    </p>
                    <p className="m-0 mt-1 font-mono text-xs leading-relaxed text-nexus-muted">
                      Upload a League champion select screenshot. Vision reads visible ally/enemy champions and fills the board.
                    </p>
                  </div>
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
                </div>
                <p className={visionStatus.toLowerCase().includes('failed') || visionStatus.toLowerCase().includes('key') ? 'm-0 mt-2 font-mono text-xs text-nexus-red/80' : 'm-0 mt-2 font-mono text-xs text-nexus-muted'}>
                  {visionStatus}
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <label className="flex flex-col gap-1.5">
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-nexus-lime/85">Your role</span>
                  <select className={inputClass} value={role} onChange={(e) => setRole(e.target.value as Exclude<DraftRole, 'unknown'>)}>
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
                    className={inputClass}
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
                  <select className={inputClass} value={deltaMode} onChange={(e) => setDeltaMode(e.target.value === 'worst' ? 'worst' : 'best')}>
                    <option value="best">Best first</option>
                    <option value="worst">Worst first</option>
                  </select>
                </label>
              </div>

              <div className="mt-5 grid gap-5 xl:grid-cols-2">
                {(['ally', 'enemy'] as const).map((side) => (
                  <section key={side} className="border border-nexus-line/80 bg-nexus-bg/25 p-3">
                    <h3 className="font-display text-base tracking-[0.14em] uppercase text-nexus-lime/90 mb-3">
                      {side === 'ally' ? 'Allies' : 'Enemies'}
                    </h3>
                    <div className="space-y-2">
                      {ROLES.map((slotRole) => {
                        const matches = championMatches(championInputs[side][slotRole])
                        const isActive = activeChampionInput?.side === side && activeChampionInput.role === slotRole
                        return (
                          <label key={`${side}-${slotRole}`} className="grid grid-cols-[4.5rem_2rem_minmax(0,1fr)] gap-2 items-center">
                            <span className={slotRole === role && side === 'ally' ? 'font-mono text-xs uppercase text-nexus-blue' : 'font-mono text-xs uppercase text-nexus-muted'}>
                              {roleLabel(slotRole)}
                            </span>
                            <ChampionIcon championId={board[side][slotRole]} champions={champions} ddragonVersion={ddragonVersion} />
                            <span className="relative min-w-0">
                              <input
                                className={inputClass + ' text-xs'}
                                value={championInputs[side][slotRole]}
                                placeholder="Type champion..."
                                autoComplete="off"
                                onFocus={() => setActiveChampionInput({ side, role: slotRole })}
                                onChange={(e) => {
                                  setActiveChampionInput({ side, role: slotRole })
                                  updateChampionInput(side, slotRole, e.target.value)
                                }}
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
                                <span className="absolute left-0 right-0 top-[calc(100%+2px)] z-30 max-h-44 overflow-y-auto border border-nexus-line bg-nexus-surface-2 shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
                                  {matches.map((champion) => (
                                    <button
                                      key={champion.id}
                                      type="button"
                                      className="nexus-focus flex w-full items-center gap-2 px-2 py-1.5 text-left font-mono text-xs text-nexus-text hover:bg-nexus-lime/10"
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

          <aside className="min-w-0">
            <NexusPanel kicker="recommendations" title={`Picks for ${roleLabel(role)}`} accent>
              <div className="mb-3 space-y-1 border-b border-nexus-line/60 pb-3 font-mono text-xs text-nexus-muted">
                <p className="m-0">
                  Data Dragon: <span className="text-nexus-text/90">{ddragonVersion ?? (loadError ? 'unavailable' : 'loading')}</span>
                </p>
                <p className="m-0">
                  Model: <span className="text-nexus-text/90">{patchLabel}</span>
                </p>
                <p className="m-0 truncate" title={boardSignature}>
                  Board: <span className="text-nexus-text/80">{boardSignature.slice(0, 32)}...</span>
                </p>
                {loadError && <p className="m-0 text-nexus-red/80">{loadError}</p>}
              </div>
              {suggestions.length === 0 ? (
                <p className="font-mono text-sm text-nexus-muted">Loading champion data...</p>
              ) : (
                <ol className="list-none m-0 p-0 space-y-2">
                  {suggestions.slice(0, 8).map((suggestion) => (
                    <SuggestionRow
                      key={suggestion.championId}
                      suggestion={suggestion}
                      champions={champions}
                      ddragonVersion={ddragonVersion}
                    />
                  ))}
                </ol>
              )}
            </NexusPanel>

            <NexusPanel kicker="desktop" title="Need live champ select?">
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
              <div className="mt-4 flex items-center gap-2 text-nexus-muted">
                <NexusPlus className="text-[10px]" />
                <span className="font-mono text-xs">Web build v0.4.0</span>
              </div>
              <div className="mt-3 flex flex-col gap-1 font-mono text-xs">
                <a className="text-nexus-lime/85 hover:text-nexus-lime" href={GITHUB_PROFILE_URL} target="_blank" rel="noreferrer">
                  GitHub profile
                </a>
                <a className="text-nexus-lime/85 hover:text-nexus-lime" href={LINKEDIN_PROFILE_URL} target="_blank" rel="noreferrer">
                  LinkedIn profile
                </a>
              </div>
            </NexusPanel>
          </aside>
        </div>
      </main>
      <VisitorCounter />
    </div>
  )
}
