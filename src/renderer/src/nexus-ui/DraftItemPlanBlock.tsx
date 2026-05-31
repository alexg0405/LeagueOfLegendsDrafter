import { useMemo, useState } from 'react'
import { ddragonItemImageUrl } from '@shared/dataDragon'
import type { DraftIntel, DraftItemRef } from '@shared/draft'

type DraftItemPlan = DraftIntel['matchupPlans'][number]['itemPlan']

type DraftItemPlanBlockProps = {
  itemPlan?: DraftItemPlan | null
  limit?: number
  ddragonVersion?: string | null
  compact?: boolean
  showMatrix?: boolean
  className?: string
  labelClassName?: string
  noteClassName?: string
  separator?: string
  onOpenMatrix?: () => void
}

function ItemIcon({
  item,
  ddragonVersion,
  onOpenMatrix,
  iconOnly = false
}: {
  item: DraftItemRef
  ddragonVersion?: string | null
  onOpenMatrix?: () => void
  iconOnly?: boolean
}) {
  const src = ddragonVersion && ddragonVersion[0] !== '(' ? ddragonItemImageUrl(ddragonVersion, item.itemId) : null
  const reason = item.reason.replace(/U\.GG default build path(?:\s*\([^)]*\))?/gi, 'Default build path')
  const title = `${item.name} (${item.cost}g): ${reason}`
  const inner = (
    <>
      {src ? (
        <img className="h-7 w-7 shrink-0 border border-nexus-line/70 object-cover" src={src} alt={iconOnly ? item.name : ''} width={28} height={28} loading="lazy" decoding="async" />
      ) : (
        <span className="h-7 w-7 shrink-0 border border-nexus-line/70 bg-nexus-surface-2" aria-hidden />
      )}
      {iconOnly ? null : <span className="min-w-0 truncate text-[10px] text-nexus-text/85">{item.name}</span>}
    </>
  )
  const className = iconOnly
    ? 'nexus-focus inline-flex h-9 w-9 shrink-0 items-center justify-center border border-nexus-line/70 bg-nexus-bg/45 p-0.5 hover:border-nexus-lime/50 hover:bg-nexus-lime/10'
    : 'nexus-focus inline-flex min-w-0 items-center gap-1.5 border border-nexus-line/70 bg-nexus-bg/45 px-1.5 py-1 text-left hover:border-nexus-lime/50 hover:bg-nexus-lime/10'
  if (onOpenMatrix) {
    return (
      <button
        type="button"
        className={className}
        title={`${title}. Open item matrix.`}
        onClick={onOpenMatrix}
      >
        {inner}
      </button>
    )
  }
  return (
    <span className={className.replace('nexus-focus ', '')} title={title}>
      {inner}
    </span>
  )
}

function dedupeItems(rows: (DraftItemRef | null | undefined)[], limit: number): DraftItemRef[] {
  const seen = new Set<number>()
  const out: DraftItemRef[] = []
  for (const row of rows) {
    if (!row || seen.has(row.itemId)) {
      continue
    }
    seen.add(row.itemId)
    out.push(row)
    if (out.length >= limit) {
      break
    }
  }
  return out
}

export function DraftItemPlanBlock({
  itemPlan,
  limit = 3,
  ddragonVersion,
  compact = false,
  showMatrix = false,
  className = 'mt-1.5 grid gap-0.5 text-nexus-muted/90',
  labelClassName = 'text-nexus-lime/80',
  noteClassName = 'text-nexus-muted/75',
  separator = ':',
  onOpenMatrix
}: DraftItemPlanBlockProps) {
  const [matrixFilter, setMatrixFilter] = useState('all')
  const matrixRows = itemPlan?.matrixRows ?? []
  const matrixTags = useMemo(() => {
    const tags = new Set<string>()
    for (const row of matrixRows) {
      for (const tag of row.tags) {
        if (['anti-heal', 'anti-shield', 'anti-tank', 'anti-burst', 'anti-cc', 'sustain', 'armor', 'mr', 'ap', 'ad', 'support', 'tank', 'marksman', 'mage'].includes(tag)) {
          tags.add(tag)
        }
      }
    }
    return Array.from(tags).slice(0, 14)
  }, [matrixRows])
  if (!itemPlan) {
    return null
  }
  const buildRows = dedupeItems([
    itemPlan.starting?.[0],
    itemPlan.bootChoice,
    ...(itemPlan.coreBuild ?? []),
    ...(itemPlan.finalBuild ?? [])
  ], 6)
  const visibleRows = matrixFilter === 'all' ? matrixRows : matrixRows.filter((row) => row.tags.includes(matrixFilter))
  if (buildRows.length || matrixRows.length || itemPlan.threatSummary?.length || compact) {
    return (
      <div className="mt-2 grid gap-1.5 border border-nexus-line/60 bg-nexus-bg/30 p-2 text-nexus-muted/90">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[10px] uppercase tracking-[0.14em] text-nexus-lime/80">Build</span>
          {onOpenMatrix && matrixRows.length > 0 ? (
            <button
              type="button"
              className="nexus-focus border border-nexus-line/70 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-nexus-lime/90 hover:border-nexus-lime/50"
              onClick={onOpenMatrix}
            >
              Matrix
            </button>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-wrap gap-1.5">
          {buildRows.length ? (
            buildRows.map((item) => (
              <ItemIcon key={`build-${item.itemId}`} item={item} ddragonVersion={ddragonVersion} onOpenMatrix={onOpenMatrix} iconOnly />
            ))
          ) : (
            <span className="text-nexus-muted/80">{itemPlan.core}</span>
          )}
        </div>
        {showMatrix && matrixRows.length > 0 && (
          <details className="group border-t border-nexus-line/50 pt-2">
            <summary className="nexus-focus flex cursor-pointer list-none items-center justify-between gap-2 text-[10px] uppercase tracking-[0.14em] text-nexus-lime/80 marker:hidden">
              <span>Matrix view</span>
              <span className="text-nexus-lime/70 transition-transform group-open:rotate-45">+</span>
            </summary>
            <div className="mt-2 grid gap-2">
              <div className="flex flex-wrap gap-1">
                {['all', ...matrixTags].map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className={
                      matrixFilter === tag
                        ? 'border border-nexus-lime/70 bg-nexus-lime/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] text-nexus-lime'
                        : 'border border-nexus-line/70 px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] text-nexus-muted hover:border-nexus-lime/40 hover:text-nexus-text'
                    }
                    onClick={() => setMatrixFilter(tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>
              <div className="max-h-64 overflow-auto border border-nexus-line/55">
                <table className="w-full min-w-[42rem] border-collapse text-left text-[11px]">
                  <thead className="sticky top-0 bg-nexus-surface-2 text-nexus-lime/80">
                    <tr>
                      <th className="border-b border-nexus-line/70 px-2 py-1.5">Item</th>
                      <th className="border-b border-nexus-line/70 px-2 py-1.5">Score</th>
                      <th className="border-b border-nexus-line/70 px-2 py-1.5">Phase</th>
                      <th className="border-b border-nexus-line/70 px-2 py-1.5">Good into</th>
                      <th className="border-b border-nexus-line/70 px-2 py-1.5">Avoid when</th>
                      <th className="border-b border-nexus-line/70 px-2 py-1.5">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.slice(0, 30).map((row) => (
                      <tr key={`matrix-${row.itemId}`} className="odd:bg-nexus-lime/[0.035]">
                        <td className="border-b border-nexus-line/35 px-2 py-1.5">
                          <ItemIcon item={row} ddragonVersion={ddragonVersion} />
                        </td>
                        <td className="border-b border-nexus-line/35 px-2 py-1.5 tabular-nums text-nexus-text/90">{row.score.toFixed(1)}</td>
                        <td className="border-b border-nexus-line/35 px-2 py-1.5">{row.phase}</td>
                        <td className="border-b border-nexus-line/35 px-2 py-1.5">{row.goodInto.join(', ') || '-'}</td>
                        <td className="border-b border-nexus-line/35 px-2 py-1.5">{row.avoidWhen.join(', ') || '-'}</td>
                        <td className="border-b border-nexus-line/35 px-2 py-1.5">{row.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </details>
        )}
      </div>
    )
  }
  const row = (label: string, line: string, key: string) => (
    <div key={key}>
      <span className={labelClassName}>{label}{separator}</span> {line}
    </div>
  )
  return (
    <div className={className}>
      {row('Core', itemPlan.core, 'core')}
      {row('Boots', itemPlan.boots, 'boots')}
      {row('Defense', itemPlan.defensive, 'defense')}
      {itemPlan.situational.slice(0, limit).map((line, idx) => row('Flex', line, `situational-${idx}`))}
      {itemPlan.notes.slice(0, 1).map((line, idx) => (
        <div key={`note-${idx}`} className={noteClassName}>
          {line}
        </div>
      ))}
    </div>
  )
}
