import { ddragonItemImageUrl, type CatalogItem } from '@shared/dataDragon'
import { itemCost, itemName } from './buildLabels'

export type BuildItemState = 'owned' | 'building' | 'next' | 'planned' | 'plain'

const FRAME: Record<BuildItemState, string> = {
  owned: 'border-nexus-lime/80 bg-nexus-lime/10',
  building: 'border-sky-300/80 bg-sky-400/10',
  next: 'border-nexus-yellow bg-nexus-yellow/15 shadow-[0_0_12px_color-mix(in_srgb,var(--nexus-yellow)_35%,transparent)]',
  planned: 'border-nexus-line/70 bg-nexus-bg/40 opacity-80',
  plain: 'border-nexus-line/70 bg-nexus-bg/40'
}

/** Square item icon with an optional state frame, corner badge and caption. */
export function BuildItemIcon({
  itemId,
  version,
  catalog,
  size = 28,
  state = 'plain',
  badge,
  caption,
  title,
  swapped = false,
  isNew = false
}: {
  itemId: number
  version: string
  catalog?: ReadonlyMap<number, CatalogItem> | null
  size?: number
  state?: BuildItemState
  /** Tiny corner text: "x2", "✓". */
  badge?: string
  /** Line under the icon: "55%". */
  caption?: string
  title?: string
  /** Swapped in for the enemy comp. */
  swapped?: boolean
  /** Bought in the last minute or so (enemy purchase feed). */
  isNew?: boolean
}) {
  const name = itemName(catalog, itemId)
  const cost = itemCost(catalog, itemId)
  const label = title ?? `${name}${cost != null ? ` (${cost}g)` : ''}`
  return (
    <span className="inline-flex shrink-0 flex-col items-center gap-0.5" title={label}>
      <span
        className={[
          'relative inline-flex items-center justify-center border p-[2px]',
          isNew ? 'border-nexus-yellow bg-nexus-yellow/20 shadow-[0_0_8px_color-mix(in_srgb,var(--nexus-yellow)_55%,transparent)]' : FRAME[state]
        ].join(' ')}
        style={{ width: size + 6, height: size + 6 }}
      >
        <img
          className={['object-cover', state === 'planned' ? 'grayscale-[35%]' : ''].join(' ')}
          src={ddragonItemImageUrl(version, itemId)}
          alt={name}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
        />
        {badge ? (
          <span className="absolute -bottom-1 -right-1 border border-nexus-line bg-nexus-bg px-[3px] font-mono text-[9px] leading-[12px] text-nexus-text">
            {badge}
          </span>
        ) : null}
        {isNew ? (
          <span className="absolute -right-[3px] -top-[3px] h-[7px] w-[7px] rounded-full bg-nexus-yellow" aria-label="Just bought" />
        ) : null}
        {swapped ? (
          <span
            className="absolute -left-1 -top-1 border border-nexus-yellow/80 bg-nexus-bg px-[2px] font-mono text-[9px] leading-[11px] text-nexus-yellow"
            aria-label="Swapped for this game"
          >
            ⇄
          </span>
        ) : null}
      </span>
      {caption ? <span className="font-mono text-[9px] leading-none tabular-nums text-nexus-muted">{caption}</span> : null}
    </span>
  )
}
