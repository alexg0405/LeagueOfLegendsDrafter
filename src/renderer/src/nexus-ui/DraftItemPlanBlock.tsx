import { ddragonItemImageUrl } from '@shared/dataDragon'
import type { DraftIntel, DraftItemRef } from '@shared/draft'

type DraftItemPlan = DraftIntel['matchupPlans'][number]['itemPlan']

type DraftItemPlanBlockProps = {
  itemPlan?: DraftItemPlan | null
  limit?: number
  ddragonVersion?: string | null
  compact?: boolean
  showHeader?: boolean
  onOpenMatrix?: () => void
}

function ItemIcon({
  item,
  ddragonVersion,
  onOpenMatrix
}: {
  item: DraftItemRef
  ddragonVersion?: string | null
  onOpenMatrix?: () => void
}) {
  const src = ddragonVersion && ddragonVersion[0] !== '(' ? ddragonItemImageUrl(ddragonVersion, item.itemId) : null
  const reason = item.reason.replace(/U\.GG default build path(?:\s*\([^)]*\))?/gi, 'Default build path')
  const title = `${item.name} (${item.cost}g): ${reason}`
  const inner = (
    src ? (
      <img className="h-7 w-7 shrink-0 border border-nexus-line/70 object-cover" src={src} alt={item.name} width={28} height={28} loading="lazy" decoding="async" />
    ) : (
      <span className="h-7 w-7 shrink-0 border border-nexus-line/70 bg-nexus-surface-2" aria-hidden />
    )
  )
  const className = 'nexus-focus inline-flex h-9 w-9 shrink-0 items-center justify-center border border-nexus-line/70 bg-nexus-bg/45 p-0.5 hover:border-nexus-lime/50 hover:bg-nexus-lime/10'
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
  showHeader = true,
  onOpenMatrix
}: DraftItemPlanBlockProps) {
  const matrixRows = itemPlan?.matrixRows ?? []
  if (!itemPlan) {
    return null
  }
  const buildRows = dedupeItems([
    itemPlan.starting?.[0],
    itemPlan.bootChoice,
    ...(itemPlan.coreBuild ?? []),
    ...(itemPlan.finalBuild ?? [])
  ], 6)
  if (buildRows.length || matrixRows.length || itemPlan.threatSummary?.length || compact) {
    return (
      <div className={`${showHeader ? 'mt-2' : 'mt-0'} grid gap-1.5 border border-nexus-line/60 bg-nexus-bg/30 p-2 text-nexus-muted/90`}>
        {showHeader ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-[0.14em] text-nexus-lime/80">Build</span>
            {onOpenMatrix ? (
              <button
                type="button"
                className="nexus-focus border border-nexus-line/70 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-nexus-lime/90 hover:border-nexus-lime/50"
                onClick={onOpenMatrix}
              >
                Matrix
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="flex min-w-0 flex-wrap gap-1.5">
          {buildRows.length ? (
            buildRows.map((item) => (
              <ItemIcon key={`build-${item.itemId}`} item={item} ddragonVersion={ddragonVersion} onOpenMatrix={onOpenMatrix} />
            ))
          ) : (
            <span className="text-nexus-muted/80">{itemPlan.core}</span>
          )}
        </div>
      </div>
    )
  }
  const row = (label: string, line: string, key: string) => (
    <div key={key}>
      <span className="text-nexus-lime/80">{label}:</span> {line}
    </div>
  )
  return (
    <div className="mt-1.5 grid gap-0.5 text-nexus-muted/90">
      {row('Core', itemPlan.core, 'core')}
      {row('Boots', itemPlan.boots, 'boots')}
      {row('Defense', itemPlan.defensive, 'defense')}
      {itemPlan.situational.slice(0, limit).map((line, idx) => row('Flex', line, `situational-${idx}`))}
      {itemPlan.notes.slice(0, 1).map((line, idx) => (
        <div key={`note-${idx}`} className="text-nexus-muted/75">
          {line}
        </div>
      ))}
    </div>
  )
}
