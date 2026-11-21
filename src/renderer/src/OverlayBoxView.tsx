import { useEffect, useRef } from 'react'
import { ddragonChampionImageUrl } from '@shared/dataDragon'
import { bundledChampion } from '@shared/draft'
import { LIVE_BLOCK_LABELS, boxLabel, type LiveBlock } from '@shared/overlayLayout'
import { usableDdragonVersion, useBuildSeedRevision, useEnemyPurchases, useItemCatalog, useLiveGame } from './builds/useBuildData'
import { useOverlayLayout } from './builds/useOverlayLayout'
import { LiveBlocks, useLiveView } from './nexus-ui/LiveBuildPanel'

/** Rough in-game heights so an arranged box is about the size it will be in game. */
const PLACEHOLDER_HEIGHT: Record<LiveBlock, number> = { next: 62, build: 30, adapt: 30, enemy: 160 }

/**
 * One floating box (its own always-on-top window): a drag strip, then the sections the
 * player put in it. Reports its height so the window hugs the content.
 */
export function OverlayBoxView({ boxId }: { boxId: string }) {
  const { state } = useOverlayLayout()
  const box = state.layout.boxes.find((b) => b.id === boxId) ?? null
  useBuildSeedRevision()
  const live = useLiveGame(null)
  const catalog = useItemCatalog(null)
  const purchases = useEnemyPurchases(live, catalog)
  const view = useLiveView(live, catalog, purchases)
  const version = usableDdragonVersion(null)
  const iconUrl = (id: number | null | undefined) => {
    const key = id != null ? bundledChampion(id)?.key : undefined
    return key ? ddragonChampionImageUrl(version, key) : null
  }

  const contentRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = contentRef.current
    if (!el || typeof ResizeObserver === 'undefined') {
      return
    }
    let frame = 0
    const report = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        // +2 for the root's 1px top/bottom border.
        window.drafter.fitBox(Math.ceil(el.getBoundingClientRect().height) + 2)
      })
    }
    const observer = new ResizeObserver(report)
    observer.observe(el)
    report()
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [])

  const blocks = box?.blocks ?? []
  const title = box ? `${boxLabel(state.layout, box.id)} · ${blocks.map((b) => LIVE_BLOCK_LABELS[b]).join(' · ')}` : 'Box'

  return (
    <div className="nexus-overlay-root fixed inset-0 overflow-hidden font-body font-medium text-nexus-text text-sm">
      <div ref={contentRef}>
        <div
          className="nexus-overlay-drag flex cursor-move items-center gap-1.5 border-b border-nexus-line bg-nexus-surface-2 px-2 py-[2px]"
          title="Drag to move. Change it in ☰ Menu → Setup."
        >
          <span className="font-mono text-[10px] leading-none text-nexus-muted" aria-hidden>
            ⋮⋮
          </span>
          <span className="min-w-0 truncate font-mono text-[9px] uppercase tracking-[0.12em] text-nexus-lime/80">{title}</span>
          {state.arranging ? <span className="ml-auto shrink-0 font-mono text-[9px] uppercase text-nexus-yellow">drag me</span> : null}
        </div>
        <div className="nexus-overlay-nodrag space-y-2 p-2">
          {view ? (
            <LiveBlocks view={view} blocks={blocks} showNewBuys={state.layout.showNewBuys} version={version} catalog={catalog} iconUrl={iconUrl} />
          ) : (
            blocks.map((block) => (
              <div
                key={block}
                className="flex items-center justify-center border border-dashed border-nexus-line bg-nexus-bg/30 font-mono text-[10px] uppercase tracking-[0.12em] text-nexus-muted"
                style={{ height: PLACEHOLDER_HEIGHT[block] }}
              >
                {LIVE_BLOCK_LABELS[block]} · shows here in game
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
