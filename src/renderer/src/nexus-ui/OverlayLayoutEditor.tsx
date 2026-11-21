import { useEffect, useState } from 'react'
import type { OverlayPositionPreset, OverlayPositionStatus } from '@shared/desktopInterop'
import {
  LIVE_BLOCKS,
  LIVE_BLOCK_LABELS,
  MAX_OVERLAY_BOXES,
  DEFAULT_OVERLAY_LAYOUT,
  boxLabel,
  moveBlockTo,
  placeOf,
  removeBox,
  shiftBlock,
  type LiveBlock,
  type OverlayLayout
} from '@shared/overlayLayout'
import { NexusInfoTip } from './NexusInfoTip'

const chip = (on: boolean) =>
  [
    'nexus-focus border px-1.5 py-[2px] font-mono text-[10px] uppercase tracking-[0.1em] disabled:opacity-40',
    on ? 'border-nexus-lime bg-nexus-lime/15 text-nexus-lime' : 'border-nexus-line text-nexus-muted hover:text-nexus-text'
  ].join(' ')

const POSITION_GRID: { preset: OverlayPositionPreset; label: string }[] = [
  { preset: 'top-left', label: '↖' },
  { preset: 'top-right', label: '↗' },
  { preset: 'middle-left', label: '←' },
  { preset: 'middle-right', label: '→' },
  { preset: 'bottom-left', label: '↙' },
  { preset: 'bottom-right', label: '↘' }
]

function placeValue(layout: OverlayLayout, block: LiveBlock): string {
  const place = placeOf(layout, block)
  return typeof place === 'string' ? place : place.box
}

/**
 * Pick where each in-game section shows: the main overlay, your own floating boxes (separate
 * windows you drag anywhere), or nowhere. Fits the overlay without scrolling.
 */
export function OverlayLayoutEditor({
  layout,
  arranging,
  onChange,
  onArrange,
  onClose
}: {
  layout: OverlayLayout
  arranging: boolean
  onChange: (layout: OverlayLayout) => void
  onArrange: (arranging: boolean) => void
  /** Shows a Done button (overlay use); omitted when embedded in Setup. */
  onClose?: () => void
}) {
  const [position, setPosition] = useState<OverlayPositionStatus | null>(null)
  useEffect(() => {
    let cancelled = false
    void window.drafter
      .getOverlayPosition()
      .then((status) => {
        if (!cancelled) setPosition(status)
      })
      .catch(() => {
        /* older main process */
      })
    return () => {
      cancelled = true
    }
  }, [])

  const move = (block: LiveBlock, value: string) => {
    const target = value === 'main' || value === 'hidden' || value === 'new' ? value : { box: value }
    onChange(moveBlockTo(layout, block, target))
  }

  return (
    <div className="space-y-2.5 font-mono text-[11px] leading-4">
      {onClose ? (
        <div className="flex justify-end">
          <button type="button" className={chip(true)} onClick={onClose}>
            Done
          </button>
        </div>
      ) : null}

      <div className="space-y-1">
        {LIVE_BLOCKS.map((block) => {
          const value = placeValue(layout, block)
          return (
            <div key={block} className="flex items-center gap-1.5">
              <span className="w-[118px] shrink-0 truncate text-nexus-text/90">{LIVE_BLOCK_LABELS[block]}</span>
              <select
                aria-label={`Where ${LIVE_BLOCK_LABELS[block]} shows`}
                className="nexus-focus min-w-0 flex-1 border border-nexus-line bg-nexus-bg px-1 py-[3px] text-[11px] text-nexus-text"
                value={value}
                onChange={(event) => move(block, event.target.value)}
              >
                <option value="main">Main overlay</option>
                {layout.boxes.map((box) => (
                  <option key={box.id} value={box.id}>
                    {boxLabel(layout, box.id)}
                  </option>
                ))}
                {layout.boxes.length < MAX_OVERLAY_BOXES ? <option value="new">New box</option> : null}
                <option value="hidden">Hidden</option>
              </select>
              <button
                type="button"
                className={chip(false)}
                disabled={value === 'hidden'}
                aria-label={`Move ${LIVE_BLOCK_LABELS[block]} up`}
                onClick={() => onChange(shiftBlock(layout, block, -1))}
              >
                ▲
              </button>
              <button
                type="button"
                className={chip(false)}
                disabled={value === 'hidden'}
                aria-label={`Move ${LIVE_BLOCK_LABELS[block]} down`}
                onClick={() => onChange(shiftBlock(layout, block, 1))}
              >
                ▼
              </button>
            </div>
          )
        })}
      </div>

      {layout.boxes.length ? (
        <div className="space-y-1.5 border border-nexus-line/70 bg-nexus-bg/30 px-2 py-1.5">
          <div className="flex flex-wrap items-center gap-1">
            {layout.boxes.map((box) => (
              <span key={box.id} className="inline-flex items-center gap-1 border border-nexus-line px-1 py-[1px] text-[10px] text-nexus-muted">
                {boxLabel(layout, box.id)}
                <button
                  type="button"
                  className="nexus-focus text-nexus-muted hover:text-nexus-red"
                  title="Close this box (its sections go back to the overlay)"
                  aria-label={`Close ${boxLabel(layout, box.id)}`}
                  onClick={() => onChange(removeBox(layout, box.id))}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-1 inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.1em] text-nexus-muted">
              Boxes show
              <NexusInfoTip label="When boxes show">
                <b>Whole game</b>: on screen all game (your overlay hotkey hides them). <b>While peeking</b>: only while your peek key
                shows them.
              </NexusInfoTip>
            </span>
            <button type="button" className={chip(layout.boxVisibility === 'always')} onClick={() => onChange({ ...layout, boxVisibility: 'always' })}>
              Whole game
            </button>
            <button type="button" className={chip(layout.boxVisibility === 'peek')} onClick={() => onChange({ ...layout, boxVisibility: 'peek' })}>
              While peeking
            </button>
          </div>
          <button
            type="button"
            className={`${chip(arranging)} w-full py-1`}
            onClick={() => onArrange(!arranging)}
            title="Shows your boxes now so you can drag them where you want them in game"
          >
            {arranging ? 'Done arranging' : 'Arrange boxes on screen'}
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-1 text-[10px] uppercase tracking-[0.1em] text-nexus-muted">Also show</span>
        <button type="button" className={chip(layout.showNewBuys)} onClick={() => onChange({ ...layout, showNewBuys: !layout.showNewBuys })}>
          New enemy buys
        </button>
        <button type="button" className={chip(layout.showSkills)} onClick={() => onChange({ ...layout, showSkills: !layout.showSkills })}>
          Skill order
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Main overlay in-game position">
        <span className="mr-1 text-[10px] uppercase tracking-[0.1em] text-nexus-muted" title="Or drag the overlay during a game: it remembers.">
          Overlay in game
        </span>
        {POSITION_GRID.map((cell) => (
          <button
            key={cell.preset}
            type="button"
            className={`${chip(false)} h-[22px] w-7 px-0`}
            title={`In game, open the overlay ${cell.preset.replace('-', ' ')}`}
            onClick={() => {
              void window.drafter.setOverlayPosition({ phase: 'game', preset: cell.preset }).then(setPosition)
            }}
          >
            {cell.label}
          </button>
        ))}
        {position?.hasGamePosition ? (
          <button
            type="button"
            className={chip(false)}
            title="In game, open where it sits in champ select"
            onClick={() => {
              void window.drafter.setOverlayPosition({ phase: 'game', reset: true }).then(setPosition)
            }}
          >
            ↺
          </button>
        ) : null}
      </div>

      <button
        type="button"
        className={`${chip(false)} w-full`}
        onClick={() => {
          onArrange(false)
          // Champ select settings live in their own card and keep their own reset.
          onChange({ ...DEFAULT_OVERLAY_LAYOUT, main: [...DEFAULT_OVERLAY_LAYOUT.main], boxes: [], draft: layout.draft })
        }}
      >
        Reset layout
      </button>
    </div>
  )
}
