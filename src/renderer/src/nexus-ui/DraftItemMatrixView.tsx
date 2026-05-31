import { useEffect, useMemo, useState } from 'react'
import { ddragonItemImageUrl } from '@shared/dataDragon'
import type { DraftIntel, DraftItemMatrixRow, DraftItemRef } from '@shared/draft'

type MatchupPlan = DraftIntel['matchupPlans'][number]
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

function buildStatusFor(row: DraftItemMatrixRow, itemPlan: DraftItemPlan): { label: ItemMatrixRow['buildStatus']; isDefault: boolean } {
  if (defaultIdsFor(itemPlan).has(row.itemId)) {
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
  return (itemPlan.matrixRows ?? [])
    .filter((row) => {
      if (seen.has(row.itemId)) return false
      seen.add(row.itemId)
      return true
    })
    .map((row) => {
      const status = buildStatusFor(row, itemPlan)
      return {
        ...row,
        buildStatus: status.label,
        buildDefault: status.isDefault
      }
    })
    .sort((a, b) => Number(b.buildDefault) - Number(a.buildDefault) || b.score - a.score || a.name.localeCompare(b.name))
}

function shortTags(row: DraftItemMatrixRow): string {
  const tags = row.tags.filter((tag) =>
    ['anti-heal', 'anti-shield', 'anti-tank', 'anti-burst', 'anti-cc', 'armor', 'mr', 'ap', 'ad', 'sustain', 'magic-pen', 'armor-pen'].includes(tag)
  )
  return tags.slice(0, 4).join(', ') || row.goodInto.slice(0, 3).join(', ') || '-'
}

function CounterTargets({
  row,
  championImageUrl
}: {
  row: ItemMatrixRow
  championImageUrl?: (championId: number) => string | null
}) {
  const targets = row.enemyTargets ?? []
  if (row.buildDefault) {
    return <span className="text-nexus-muted/90">Default path</span>
  }
  if (targets.length > 0) {
    return (
      <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5">
        {targets.map((target) => {
          const src = championImageUrl?.(target.championId) ?? null
          const title = `${target.championName}: ${target.reason} (${target.source})`
          return (
            <span key={`${row.itemId}-${target.championId}-${target.reason}`} className="inline-flex items-center gap-1 text-nexus-muted/95" title={title}>
              {src ? (
                <img className="h-7 w-7 border border-nexus-line/70 object-cover" src={src} alt="" width={28} height={28} />
              ) : (
                <span className="inline-flex h-7 w-7 items-center justify-center border border-nexus-line/70 bg-nexus-bg text-[10px] text-nexus-muted">
                  {target.championName.slice(0, 2)}
                </span>
              )}
              <span className="text-[10px]">{target.reason}</span>
            </span>
          )
        })}
      </span>
    )
  }
  return <span className="text-nexus-muted/90">{row.goodAgainst?.join(', ') || row.goodInto.join(', ') || 'Matchup dependent'}</span>
}

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
  className = ''
}: DraftItemMatrixViewProps) {
  const selectablePlans = useMemo(() => (plans ?? []).filter((plan) => plan.itemPlan?.matrixRows?.length), [plans])
  const initialChampionId = selectedChampionId ?? championId ?? selectablePlans[0]?.championId ?? null
  const [activeChampionId, setActiveChampionId] = useState<number | null>(initialChampionId)

  useEffect(() => {
    setActiveChampionId(selectedChampionId ?? championId ?? selectablePlans[0]?.championId ?? null)
  }, [championId, selectablePlans, selectedChampionId])

  const activePlan = selectablePlans.find((plan) => plan.championId === activeChampionId) ?? selectablePlans[0] ?? null
  const activeItemPlan = activePlan?.itemPlan ?? itemPlan ?? null
  const activeChampionName = activePlan?.championName ?? championName ?? 'Suggested build'
  const rows = useMemo(() => matrixRows(activeItemPlan).slice(0, maxRows), [activeItemPlan, maxRows])
  const [filter, setFilter] = useState<'all' | 'default' | 'situational'>('all')
  const visibleRows = rows.filter((row) => filter === 'all' || (filter === 'default' ? row.buildDefault : !row.buildDefault))

  return (
    <section className={`border border-nexus-lime/45 bg-nexus-surface/95 shadow-[0_0_42px_rgba(29,212,168,0.18)] ${className}`}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-nexus-lime/35 bg-nexus-surface-2/95 px-3 py-2.5">
        <div className="min-w-0">
          <p className="m-0 font-mono text-[10px] uppercase tracking-[0.22em] text-nexus-lime/75">item matrix</p>
          <h2 className="m-0 truncate font-display text-lg uppercase tracking-[0.12em] text-nexus-text">{activeChampionName}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em]">
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
      {selectablePlans.length > 1 ? (
        <div className="flex gap-1.5 overflow-x-auto border-b border-nexus-line/70 bg-nexus-bg/70 px-3 py-2">
          {selectablePlans.map((plan) => {
            const src = championImageUrl?.(plan.championId) ?? null
            const active = plan.championId === activePlan?.championId
            return (
              <button
                key={`item-matrix-champion-${plan.championId}`}
                type="button"
                className={
                  active
                    ? 'nexus-focus inline-flex shrink-0 items-center gap-1.5 border border-nexus-lime/70 bg-nexus-lime/15 px-2 py-1 text-left font-mono text-[11px] text-nexus-lime'
                    : 'nexus-focus inline-flex shrink-0 items-center gap-1.5 border border-nexus-line/70 px-2 py-1 text-left font-mono text-[11px] text-nexus-muted hover:border-nexus-lime/45 hover:text-nexus-text'
                }
                onClick={() => setActiveChampionId(plan.championId)}
              >
                {src ? <img className="h-6 w-6 border border-nexus-line/60 object-cover" src={src} alt="" width={24} height={24} /> : null}
                <span>{plan.championName}</span>
              </button>
            )
          })}
        </div>
      ) : null}
      <div className="max-h-[72vh] overflow-auto">
        <table className="w-full min-w-[54rem] border-collapse text-left font-mono text-xs">
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
                  No item matrix available for this pick yet.
                </td>
              </tr>
            ) : (
              visibleRows.map((row, idx) => {
                const src = ddragonVersion && ddragonVersion[0] !== '(' ? ddragonItemImageUrl(ddragonVersion, row.itemId) : null
                return (
                  <tr key={`item-matrix-${row.itemId}`} className="odd:bg-nexus-lime/[0.035] hover:bg-nexus-lime/[0.08]">
                    <td className="border-b border-nexus-line/45 px-2 py-2 tabular-nums text-nexus-muted">{idx + 1}</td>
                    <td className="border-b border-nexus-line/45 px-2 py-2">
                      <span className="inline-flex min-w-0 items-center gap-2">
                        {src ? (
                          <img className="h-8 w-8 shrink-0 border border-nexus-line/70 object-cover" src={src} alt="" width={32} height={32} />
                        ) : (
                          <span className="h-8 w-8 shrink-0 border border-nexus-line/70 bg-nexus-bg" aria-hidden />
                        )}
                        <span className="min-w-0">
                          <span className="block truncate text-nexus-text/95">{row.name}</span>
                          <span className="block text-[10px] text-nexus-muted">{row.cost}g - {row.phase}</span>
                        </span>
                      </span>
                    </td>
                    <td className="border-b border-nexus-line/45 px-2 py-2 tabular-nums text-nexus-text/90">{row.score.toFixed(1)}</td>
                    <td className={row.buildDefault ? 'border-b border-nexus-line/45 px-2 py-2 text-nexus-lime/90' : 'border-b border-nexus-line/45 px-2 py-2 text-nexus-yellow/90'}>
                      {row.buildStatus}
                    </td>
                    <td className="border-b border-nexus-line/45 px-2 py-2">
                      <CounterTargets row={row} championImageUrl={championImageUrl} />
                    </td>
                    <td className="border-b border-nexus-line/45 px-2 py-2 text-nexus-text/80">{row.reason}</td>
                    <td className="border-b border-nexus-line/45 px-2 py-2 text-nexus-muted">{shortTags(row)}</td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
