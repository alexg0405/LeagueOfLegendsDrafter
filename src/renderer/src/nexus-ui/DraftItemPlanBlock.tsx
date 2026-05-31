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
  ddragonVersion
}: {
  item: DraftItemRef
  ddragonVersion?: string | null
}) {
  const src = ddragonVersion && ddragonVersion[0] !== '(' ? ddragonItemImageUrl(ddragonVersion, item.itemId) : null
  const title = `${item.name} (${item.cost}g): ${item.reason}`
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 border border-nexus-line/70 bg-nexus-bg/45 px-1.5 py-1" title={title}>
      {src ? (
        <img className="h-7 w-7 shrink-0 border border-nexus-line/70 object-cover" src={src} alt="" width={28} height={28} />
      ) : (
        <span className="h-7 w-7 shrink-0 border border-nexus-line/70 bg-nexus-surface-2" aria-hidden />
      )}
      <span className="min-w-0 truncate text-[10px] text-nexus-text/85">{item.name}</span>
    </span>
  )
}

function ItemRow({
  label,
  items,
  ddragonVersion,
  empty
}: {
  label: string
  items: DraftItemRef[] | undefined
  ddragonVersion?: string | null
  empty?: string
}) {
  return (
    <div className="grid gap-1">
      <span className="text-[10px] uppercase tracking-[0.12em] text-nexus-lime/75">{label}</span>
      <div className="flex min-w-0 flex-wrap gap-1.5">
        {items?.length ? items.map((item) => <ItemIcon key={`${label}-${item.itemId}`} item={item} ddragonVersion={ddragonVersion} />) : <span className="text-nexus-muted/80">{empty ?? 'pending'}</span>}
      </div>
    </div>
  )
}

function threatToneClass(tone: 'info' | 'warning' | 'danger'): string {
  if (tone === 'danger') return 'border-nexus-red/50 bg-nexus-red/10 text-nexus-red/90'
  if (tone === 'warning') return 'border-nexus-yellow/45 bg-nexus-yellow/10 text-nexus-yellow/90'
  return 'border-nexus-lime/40 bg-nexus-lime/10 text-nexus-lime/85'
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
  const buildRows = itemPlan.finalBuild?.length ? itemPlan.finalBuild : [...(itemPlan.bootChoice ? [itemPlan.bootChoice] : []), ...(itemPlan.coreBuild ?? [])]
  const visibleRows = matrixFilter === 'all' ? matrixRows : matrixRows.filter((row) => row.tags.includes(matrixFilter))
  if (compact && (buildRows.length || itemPlan.situationalItems?.length || itemPlan.threatSummary?.length)) {
    return (
      <div className="mt-1.5 grid gap-1.5 text-nexus-muted/90">
        {itemPlan.threatSummary?.length ? (
          <div className="flex flex-wrap gap-1">
            {itemPlan.threatSummary.slice(0, 4).map((threat) => (
              <span key={threat.label} className={`border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.1em] ${threatToneClass(threat.tone)}`} title={threat.reason}>
                {threat.label}
              </span>
            ))}
          </div>
        ) : null}
        <ItemRow label="Build" items={buildRows.slice(0, 6)} ddragonVersion={ddragonVersion} empty={itemPlan.core} />
        {itemPlan.situationalItems?.length ? (
          <ItemRow label="Swaps" items={itemPlan.situationalItems.slice(0, limit)} ddragonVersion={ddragonVersion} />
        ) : null}
      </div>
    )
  }
  if (buildRows.length || matrixRows.length || itemPlan.threatSummary?.length) {
    return (
      <div className="mt-2 grid gap-2 rounded-md border border-nexus-line/60 bg-nexus-bg/30 p-2 text-nexus-muted/90">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[10px] uppercase tracking-[0.14em] text-nexus-lime/80">Suggested build</span>
          <span className="flex flex-wrap items-center gap-1">
            {itemPlan.threatSummary?.length
              ? itemPlan.threatSummary.slice(0, 6).map((threat) => (
                <span key={threat.label} className={`border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.1em] ${threatToneClass(threat.tone)}`} title={threat.reason}>
                  {threat.label}
                </span>
              ))
              : null}
            {onOpenMatrix && matrixRows.length > 0 ? (
              <button
                type="button"
                className="nexus-focus border border-nexus-line/70 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-nexus-lime/90 hover:border-nexus-lime/50"
                onClick={onOpenMatrix}
              >
                Matrix
              </button>
            ) : null}
          </span>
        </div>
        <div className="grid gap-2">
          <ItemRow label="Start" items={itemPlan.starting} ddragonVersion={ddragonVersion} empty={itemPlan.core} />
          <ItemRow label="Recall" items={itemPlan.firstRecall} ddragonVersion={ddragonVersion} empty={itemPlan.defensive} />
          <ItemRow label="Boots" items={[itemPlan.bootChoice, ...(itemPlan.bootAlternatives ?? [])].filter((item): item is DraftItemRef => item != null)} ddragonVersion={ddragonVersion} empty={itemPlan.boots} />
          <ItemRow label="Core" items={itemPlan.coreBuild} ddragonVersion={ddragonVersion} empty={itemPlan.core} />
          <ItemRow label="Final" items={buildRows.slice(0, 6)} ddragonVersion={ddragonVersion} empty={itemPlan.core} />
          {itemPlan.situationalItems?.length ? (
            <ItemRow label="Swaps" items={itemPlan.situationalItems.slice(0, limit)} ddragonVersion={ddragonVersion} />
          ) : null}
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
