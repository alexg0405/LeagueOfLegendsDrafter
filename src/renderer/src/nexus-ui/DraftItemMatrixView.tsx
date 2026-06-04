import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type UIEvent } from 'react'
import { canonicalItemName, ddragonItemImageUrl } from '@shared/dataDragon'
import type { DraftIntel, DraftItemMatrixRow, DraftItemRef } from '@shared/draft'
import { NexusEffectsLayer, emitNexusEffect } from '../effects'

export type MatchupPlan = DraftIntel['matchupPlans'][number]
type DraftItemPlan = NonNullable<MatchupPlan['itemPlan']>

type ItemMatrixRow = DraftItemMatrixRow & {
  buildStatus: 'Default Build' | 'Adaptive Default' | 'Situational'
  buildDefault: boolean
}

type DraftItemMatrixViewProps = {
  plans?: MatchupPlan[]
  selectedChampionId?: number | null
  itemPlan?: DraftItemPlan | null
  championName?: string | null
  championId?: number | null
  championImageUrl?: (championId: number) => string | null
  ddragonVersion?: string | null
  onClose?: () => void
  maxRows?: number
  className?: string
  isPreparing?: boolean
  error?: string | null
}

const MATRIX_ROW_HEIGHT = 58
const MATRIX_ROW_OVERSCAN = 4
const MATRIX_VIEWPORT_FALLBACK = 560
const COUNTER_TARGET_LIMIT = 5
const TARGET_SOURCE_WEIGHT: Record<NonNullable<DraftItemMatrixRow['enemyTargets']>[number]['source'], number> = {
  defaultBuild: 0,
  teamThreat: 1,
  kit: 2
}

function itemIds(rows: (DraftItemRef | null | undefined)[] | undefined): number[] {
  return (rows ?? []).flatMap((row) => (row?.itemId ? [row.itemId] : []))
}

function defaultIdsFor(itemPlan: DraftItemPlan): Set<number> {
  return new Set([
    ...(itemPlan.defaultItemIds ?? []),
    ...itemIds(itemPlan.starting),
    ...itemIds(itemPlan.bootAlternatives),
    ...itemIds([itemPlan.bootChoice]),
    ...itemIds(itemPlan.coreBuild),
    ...itemIds(itemPlan.finalBuild)
  ])
}

function buildStatusFor(row: DraftItemMatrixRow, itemPlan: DraftItemPlan, defaultIds: ReadonlySet<number>): { label: ItemMatrixRow['buildStatus']; isDefault: boolean } {
  if (defaultIds.has(row.itemId)) {
    return {
      label: itemPlan.defaultBuildSource === 'ugg' ? 'Default Build' : 'Adaptive Default',
      isDefault: true
    }
  }
  return { label: 'Situational', isDefault: false }
}

function matrixRows(itemPlan: DraftItemPlan | null | undefined): ItemMatrixRow[] {
  if (!itemPlan) return []
  const seen = new Set<number>()
  const seenNames = new Set<string>()
  const defaultIds = defaultIdsFor(itemPlan)
  return (itemPlan.matrixRows ?? [])
    .filter((row) => {
      const nameKey = canonicalItemName(row.name)
      if (seen.has(row.itemId) || (nameKey && seenNames.has(nameKey))) return false
      seen.add(row.itemId)
      if (nameKey) seenNames.add(nameKey)
      return true
    })
    .map((row) => {
      const status = buildStatusFor(row, itemPlan, defaultIds)
      return {
        ...row,
        buildStatus: status.label,
        buildDefault: status.isDefault
      }
    })
    .sort((a, b) => Number(b.buildDefault) - Number(a.buildDefault) || b.score - a.score || a.name.localeCompare(b.name))
}

export function dedupeMatchupPlansForMatrix(plans: MatchupPlan[] | undefined): MatchupPlan[] {
  const byChampionId = new Map<number, MatchupPlan>()
  for (const plan of plans ?? []) {
    const rowCount = plan.itemPlan?.matrixRows?.length ?? 0
    if (rowCount <= 0) {
      continue
    }
    const previous = byChampionId.get(plan.championId)
    const previousRowCount = previous?.itemPlan?.matrixRows?.length ?? 0
    if (!previous || rowCount > previousRowCount) {
      byChampionId.set(plan.championId, plan)
    }
  }
  return Array.from(byChampionId.values())
}

export function dedupeEnemyTargetsForMatrix(
  targets: DraftItemMatrixRow['enemyTargets'] | null | undefined
): NonNullable<DraftItemMatrixRow['enemyTargets']> {
  const byChampionKey = new Map<string, NonNullable<DraftItemMatrixRow['enemyTargets']>[number]>()
  for (const target of targets ?? []) {
    const key = target.championId > 0 ? `id:${target.championId}` : `name:${target.championName.trim().toLowerCase()}`
    const previous = byChampionKey.get(key)
    if (!previous || TARGET_SOURCE_WEIGHT[target.source] < TARGET_SOURCE_WEIGHT[previous.source]) {
      byChampionKey.set(key, target)
    }
  }
  return Array.from(byChampionKey.values())
}

function shortTags(row: DraftItemMatrixRow): string {
  const tags = row.tags.filter((tag) =>
    ['anti-heal', 'anti-shield', 'anti-tank', 'anti-burst', 'anti-cc', 'armor', 'mr', 'ap', 'ad', 'sustain', 'magic-pen', 'armor-pen'].includes(tag)
  )
  return tags.slice(0, 4).join(', ') || row.goodInto.slice(0, 3).join(', ') || '-'
}

function cleanReason(reason: string): string {
  return reason.replace(/U\.GG default build path(?:\s*\([^)]*\))?/gi, 'Default build path')
}

function targetSourceLabel(source: NonNullable<DraftItemMatrixRow['enemyTargets']>[number]['source']): string {
  switch (source) {
    case 'defaultBuild':
      return 'default build path'
    case 'teamThreat':
      return 'team threat'
    case 'kit':
      return 'kit threat'
    default:
      return source
  }
}

function CounterTargets({
  row,
  championImageUrl
}: {
  row: ItemMatrixRow
  championImageUrl?: (championId: number) => string | null
}) {
  const targets = dedupeEnemyTargetsForMatrix(row.enemyTargets)
  if (row.buildDefault) {
    return <span className="text-nexus-muted/90">Default path</span>
  }
  if (targets.length > 0) {
    const visibleTargets = targets.slice(0, COUNTER_TARGET_LIMIT)
    const hiddenCount = targets.length - visibleTargets.length
    return (
      <span className="inline-flex min-w-0 max-w-full items-center gap-1 overflow-hidden whitespace-nowrap">
        {visibleTargets.map((target) => {
          const src = championImageUrl?.(target.championId) ?? null
          const title = `${target.championName}: ${target.reason} (${targetSourceLabel(target.source)})`
          return (
            <span key={`${row.itemId}-${target.championId}`} className="inline-flex shrink-0 items-center text-nexus-muted/95" title={title}>
              {src ? (
                <img className="h-7 w-7 border border-nexus-line/70 object-cover" src={src} alt="" width={28} height={28} loading="lazy" decoding="async" />
              ) : (
                <span className="inline-flex h-7 w-7 items-center justify-center border border-nexus-line/70 bg-nexus-bg text-[10px] text-nexus-muted">
                  {target.championName.slice(0, 2)}
                </span>
              )}
            </span>
          )
        })}
        {hiddenCount > 0 ? (
          <span className="inline-flex h-7 min-w-7 shrink-0 items-center justify-center border border-nexus-line/70 bg-nexus-bg px-1 text-[10px] text-nexus-muted" title={`${hiddenCount} more counter targets`}>
            +{hiddenCount}
          </span>
        ) : null}
      </span>
    )
  }
  return <span className="block truncate text-nexus-muted/90">{row.goodAgainst?.join(', ') || row.goodInto.join(', ') || 'Matchup dependent'}</span>
}

const ChampionSelectorButton = memo(function ChampionSelectorButton({
  plan,
  active,
  src,
  onSelect
}: {
  plan: MatchupPlan
  active: boolean
  src: string | null
  onSelect: (plan: MatchupPlan) => void
}) {
  return (
    <button
      type="button"
      className={
        active
          ? 'nexus-focus inline-flex shrink-0 items-center gap-1.5 border border-nexus-lime/70 bg-nexus-lime/15 px-2 py-1 text-left font-mono text-[11px] text-nexus-lime'
          : 'nexus-focus inline-flex shrink-0 items-center gap-1.5 border border-nexus-line/70 px-2 py-1 text-left font-mono text-[11px] text-nexus-muted hover:border-nexus-lime/45 hover:text-nexus-text'
      }
      onClick={() => onSelect(plan)}
    >
      {src ? <img className="h-6 w-6 border border-nexus-line/60 object-cover" src={src} alt="" width={24} height={24} loading="lazy" decoding="async" /> : null}
      <span>{plan.championName}</span>
    </button>
  )
})

const MatrixBodyRow = memo(function MatrixBodyRow({
  row,
  rowNumber,
  itemImageUrl,
  championImageUrl
}: {
  row: ItemMatrixRow
  rowNumber: number
  itemImageUrl: string | null
  championImageUrl?: (championId: number) => string | null
}) {
  const reason = cleanReason(row.reason)
  const tags = shortTags(row)
  return (
    <tr className="odd:bg-nexus-lime/[0.035] hover:bg-nexus-lime/[0.08]" style={{ height: MATRIX_ROW_HEIGHT }}>
      <td className="border-b border-nexus-line/45 px-2 py-1 tabular-nums text-nexus-muted">{rowNumber}</td>
      <td className="border-b border-nexus-line/45 px-2 py-1">
        <span className="inline-flex min-w-0 items-center gap-2">
          {itemImageUrl ? (
            <img className="h-8 w-8 shrink-0 border border-nexus-line/70 object-cover" src={itemImageUrl} alt="" width={32} height={32} loading="lazy" decoding="async" />
          ) : (
            <span className="h-8 w-8 shrink-0 border border-nexus-line/70 bg-nexus-bg" aria-hidden />
          )}
          <span className="min-w-0">
            <span className="block max-w-[10rem] truncate text-nexus-text/95" title={row.name}>{row.name}</span>
            <span className="block text-[10px] text-nexus-muted">{row.cost}g - {row.phase}</span>
          </span>
        </span>
      </td>
      <td className="border-b border-nexus-line/45 px-2 py-1 tabular-nums text-nexus-text/90">{row.score.toFixed(1)}</td>
      <td className={row.buildDefault ? 'border-b border-nexus-line/45 px-2 py-1 text-nexus-lime/90' : 'border-b border-nexus-line/45 px-2 py-1 text-nexus-yellow/90'}>
        {row.buildStatus}
      </td>
      <td className="border-b border-nexus-line/45 px-2 py-1">
        <CounterTargets row={row} championImageUrl={championImageUrl} />
      </td>
      <td className="border-b border-nexus-line/45 px-2 py-1 text-nexus-text/80">
        <span className="block truncate" title={reason}>{reason}</span>
      </td>
      <td className="border-b border-nexus-line/45 px-2 py-1 text-nexus-muted">
        <span className="block truncate" title={tags}>{tags}</span>
      </td>
    </tr>
  )
})

export function DraftItemMatrixView({
  plans,
  selectedChampionId,
  itemPlan,
  championName,
  championId,
  championImageUrl,
  ddragonVersion,
  onClose,
  maxRows = 40,
  className = '',
  isPreparing = false,
  error = null
}: DraftItemMatrixViewProps) {
  const selectablePlans = useMemo(() => dedupeMatchupPlansForMatrix(plans), [plans])
  const initialChampionId = selectedChampionId ?? championId ?? selectablePlans[0]?.championId ?? null
  const [activeChampionId, setActiveChampionId] = useState<number | null>(initialChampionId)
  const [championQuery, setChampionQuery] = useState('')
  const deferredChampionQuery = useDeferredValue(championQuery)
  const panelRef = useRef<HTMLElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const scrollIdleRef = useRef<number | null>(null)
  const [scrollState, setScrollState] = useState({ top: 0, height: MATRIX_VIEWPORT_FALLBACK })
  const [isScrolling, setIsScrolling] = useState(false)

  useEffect(() => {
    setActiveChampionId(selectedChampionId ?? championId ?? selectablePlans[0]?.championId ?? null)
  }, [championId, selectablePlans, selectedChampionId])

  const planByChampionId = useMemo(() => new Map(selectablePlans.map((plan) => [plan.championId, plan] as const)), [selectablePlans])
  const activePlan = activeChampionId != null ? planByChampionId.get(activeChampionId) ?? selectablePlans[0] ?? null : selectablePlans[0] ?? null
  const activeItemPlan = activePlan?.itemPlan ?? itemPlan ?? null
  const activeChampionName = activePlan?.championName ?? championName ?? 'Suggested build'
  const rows = useMemo(() => matrixRows(activeItemPlan).slice(0, maxRows), [activeItemPlan, maxRows])
  const [filter, setFilter] = useState<'all' | 'default' | 'situational'>('all')
  const visibleRows = useMemo(
    () => rows.filter((row) => filter === 'all' || (filter === 'default' ? row.buildDefault : !row.buildDefault)),
    [filter, rows]
  )
  const normalizedChampionQuery = deferredChampionQuery.trim().toLowerCase()
  const championMatches = useMemo(() => {
    if (!normalizedChampionQuery) {
      return selectablePlans
    }
    return selectablePlans.filter((plan) => plan.championName.toLowerCase().includes(normalizedChampionQuery))
  }, [normalizedChampionQuery, selectablePlans])
  const visibleChampionMatches = useMemo(() => {
    if (normalizedChampionQuery) {
      return championMatches.slice(0, 14)
    }
    const active = activePlan ? [activePlan] : []
    return [...active, ...selectablePlans.filter((plan) => plan.championId !== activePlan?.championId)].slice(0, 10)
  }, [activePlan, championMatches, normalizedChampionQuery, selectablePlans])
  const selectPlan = useCallback((plan: MatchupPlan) => {
    setActiveChampionId(plan.championId)
    setChampionQuery('')
  }, [])
  const handleMatrixScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const nextTop = event.currentTarget.scrollTop
    const nextHeight = event.currentTarget.clientHeight || MATRIX_VIEWPORT_FALLBACK
    setScrollState((prev) => (prev.top === nextTop && prev.height === nextHeight ? prev : { top: nextTop, height: nextHeight }))
    if (!isScrolling) {
      emitNexusEffect('matrix:scroll-start')
    }
    setIsScrolling(true)
    if (scrollIdleRef.current != null) {
      window.clearTimeout(scrollIdleRef.current)
    }
    scrollIdleRef.current = window.setTimeout(() => {
      setIsScrolling(false)
      emitNexusEffect('matrix:scroll-end')
    }, 140)
  }, [isScrolling])
  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true })
  }, [])
  useEffect(() => {
    if (!onClose) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])
  useEffect(() => {
    return () => {
      if (scrollIdleRef.current != null) {
        window.clearTimeout(scrollIdleRef.current)
      }
    }
  }, [])
  useEffect(() => {
    const element = scrollRef.current
    if (!element) {
      return
    }
    setScrollState({ top: element.scrollTop, height: element.clientHeight || MATRIX_VIEWPORT_FALLBACK })
    if (typeof ResizeObserver === 'undefined') {
      return
    }
    const observer = new ResizeObserver(() => {
      setScrollState((prev) => {
        const nextHeight = element.clientHeight || MATRIX_VIEWPORT_FALLBACK
        return prev.height === nextHeight ? prev : { ...prev, height: nextHeight }
      })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
    setScrollState((prev) => ({ ...prev, top: 0 }))
  }, [activePlan?.championId, filter])
  useEffect(() => {
    emitNexusEffect('matrix:open', { championId: activePlan?.championId ?? activeChampionId })
  }, [activeChampionId, activePlan?.championId])
  const virtualRows = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollState.top / MATRIX_ROW_HEIGHT) - MATRIX_ROW_OVERSCAN)
    const count = Math.ceil(scrollState.height / MATRIX_ROW_HEIGHT) + MATRIX_ROW_OVERSCAN * 2
    const end = Math.min(visibleRows.length, start + count)
    return {
      start,
      rows: visibleRows.slice(start, end),
      topPad: start * MATRIX_ROW_HEIGHT,
      bottomPad: Math.max(0, (visibleRows.length - end) * MATRIX_ROW_HEIGHT)
    }
  }, [scrollState.height, scrollState.top, visibleRows])
  const itemImageUrls = useMemo(() => {
    const urls = new Map<number, string | null>()
    for (const row of virtualRows.rows) {
      urls.set(row.itemId, ddragonVersion && ddragonVersion[0] !== '(' ? ddragonItemImageUrl(ddragonVersion, row.itemId) : null)
    }
    return urls
  }, [ddragonVersion, virtualRows.rows])

  return (
    <section
      ref={panelRef}
      tabIndex={-1}
      className={`relative isolate flex min-h-0 flex-col overflow-hidden border border-nexus-lime/45 bg-nexus-surface shadow-[0_0_42px_rgba(29,212,168,0.18)] focus:outline-none ${isScrolling ? 'nexus-matrix-scrolling' : ''} ${className}`}
    >
      <NexusEffectsLayer surface="matrix" quality="high" className="z-0 opacity-35" />
      <header className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-nexus-lime/35 bg-nexus-surface-2 px-3 py-2.5">
        <div className="min-w-0 cursor-move select-none nexus-overlay-drag nexus-window-drag" data-tauri-drag-region>
          <p className="m-0 font-mono text-[10px] uppercase tracking-[0.22em] text-nexus-lime/75">item matrix</p>
          <h2 className="m-0 truncate font-display text-lg uppercase tracking-[0.12em] text-nexus-text">{activeChampionName}</h2>
        </div>
        <div className="nexus-window-nodrag flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em]">
          {(['all', 'default', 'situational'] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={
                filter === value
                  ? 'nexus-focus border border-nexus-lime/70 bg-nexus-lime/15 px-2 py-1 text-nexus-lime'
                  : 'nexus-focus border border-nexus-line/70 px-2 py-1 text-nexus-muted hover:border-nexus-lime/45 hover:text-nexus-text'
              }
              onClick={() => setFilter(value)}
            >
              {value}
            </button>
          ))}
          {onClose && (
            <button
              type="button"
              className="nexus-focus border border-nexus-lime/55 px-3 py-1.5 text-nexus-lime/90 hover:bg-nexus-lime/10"
              onClick={onClose}
            >
              Close
            </button>
          )}
        </div>
      </header>
      {(isPreparing || error) ? (
        <div className={`relative z-10 border-b border-nexus-line/70 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] ${error ? 'bg-[#1a0d0c] text-nexus-red/85' : 'bg-nexus-bg text-nexus-muted'}`}>
          {error ? `Item matrix unavailable: ${error}` : 'Preparing items...'}
        </div>
      ) : null}
      {selectablePlans.length > 1 ? (
        <div className="nexus-window-nodrag relative z-10 grid gap-2 border-b border-nexus-line/70 bg-nexus-bg px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <label className="min-w-0 flex-1">
              <span className="sr-only">Champion lookup</span>
              <input
                className="nexus-focus w-full min-w-[12rem] border border-nexus-line/70 bg-nexus-bg px-2.5 py-1.5 font-mono text-xs text-nexus-text placeholder:text-nexus-muted/70"
                value={championQuery}
                onChange={(event) => setChampionQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') {
                    return
                  }
                  const first = championMatches[0]
                  if (!first) {
                    return
                  }
                  event.preventDefault()
                  selectPlan(first)
                }}
                placeholder="Lookup champion..."
              />
            </label>
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-nexus-muted">
              {selectablePlans.length} builds
            </span>
          </div>
          <div className="nexus-matrix-scroll flex gap-1.5 overflow-x-auto pb-1">
            {visibleChampionMatches.map((plan) => {
              const src = championImageUrl?.(plan.championId) ?? null
              const active = plan.championId === activePlan?.championId
              return (
                <ChampionSelectorButton
                  key={`item-matrix-champion-${plan.championId}`}
                  plan={plan}
                  active={active}
                  src={src}
                  onSelect={selectPlan}
                />
              )
            })}
            {visibleChampionMatches.length === 0 ? (
              <span className="px-1 py-1.5 font-mono text-xs text-nexus-muted">No matching suggested champion.</span>
            ) : null}
          </div>
        </div>
      ) : null}
      <div ref={scrollRef} className="nexus-matrix-scroll relative z-10 min-h-0 flex-1 overflow-auto bg-nexus-bg" onScroll={handleMatrixScroll}>
        <table className="w-full min-w-[54rem] table-fixed border-collapse text-left font-mono text-xs">
          <colgroup>
            <col className="w-8" />
            <col className="w-56" />
            <col className="w-16" />
            <col className="w-28" />
            <col className="w-44" />
            <col className="w-72" />
            <col className="w-40" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-nexus-surface-2 text-nexus-lime/85">
            <tr className="uppercase tracking-[0.14em]">
              <th className="border-b border-nexus-line/80 px-2 py-2">#</th>
              <th className="border-b border-nexus-line/80 px-2 py-2">Item</th>
              <th className="border-b border-nexus-line/80 px-2 py-2">Score</th>
              <th className="border-b border-nexus-line/80 px-2 py-2">Build role</th>
              <th className="border-b border-nexus-line/80 px-2 py-2">Counters</th>
              <th className="border-b border-nexus-line/80 px-2 py-2">Reason</th>
              <th className="border-b border-nexus-line/80 px-2 py-2">Tags</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td className="px-3 py-5 text-nexus-muted" colSpan={7}>
                  {isPreparing
                    ? 'Preparing item matrix for this pick...'
                    : error
                      ? 'The item matrix could not be prepared. Try changing the draft or reopening the matrix.'
                      : 'No item matrix available for this pick yet.'}
                </td>
              </tr>
            ) : (
              <>
                {virtualRows.topPad > 0 ? (
                  <tr aria-hidden style={{ height: virtualRows.topPad }}>
                    <td colSpan={7} className="p-0" />
                  </tr>
                ) : null}
                {virtualRows.rows.map((row, idx) => (
                  <MatrixBodyRow
                    key={`item-matrix-${row.itemId}`}
                    row={row}
                    rowNumber={virtualRows.start + idx + 1}
                    itemImageUrl={itemImageUrls.get(row.itemId) ?? null}
                    championImageUrl={championImageUrl}
                  />
                ))}
                {virtualRows.bottomPad > 0 ? (
                  <tr aria-hidden style={{ height: virtualRows.bottomPad }}>
                    <td colSpan={7} className="p-0" />
                  </tr>
                ) : null}
              </>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
