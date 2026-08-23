import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Hover/focus tooltip used to hide long explanatory copy behind a small `i` badge.
 *
 * The overlay window is ~380px wide with `overflow: hidden` on `html`/`body` and an
 * internal scroll container, so an absolutely-positioned bubble would clip. This renders
 * into a `document.body` portal with `position: fixed` coordinates measured from the
 * trigger, and flips/clamps itself to stay on screen.
 */

const TIP_GAP = 8
const VIEWPORT_PAD = 8
const TOUCH_DISMISS_MS = 6000

type TipPlacement = 'top' | 'bottom'

type TipRect = { left: number; top: number; placement: TipPlacement; maxWidth: number }

function measure(trigger: HTMLElement, bubble: HTMLElement | null): TipRect {
  const anchor = trigger.getBoundingClientRect()
  const vw = window.innerWidth
  const vh = window.innerHeight
  const maxWidth = Math.min(320, Math.max(180, vw - VIEWPORT_PAD * 2))
  const width = bubble?.offsetWidth ?? maxWidth
  const height = bubble?.offsetHeight ?? 0

  const spaceAbove = anchor.top
  const spaceBelow = vh - anchor.bottom
  // Prefer above (overlay lists grow downward); flip when it would not fit.
  const placement: TipPlacement =
    spaceAbove >= height + TIP_GAP || spaceAbove >= spaceBelow ? 'top' : 'bottom'

  const rawLeft = anchor.left + anchor.width / 2 - width / 2
  const left = Math.min(Math.max(VIEWPORT_PAD, rawLeft), Math.max(VIEWPORT_PAD, vw - width - VIEWPORT_PAD))
  const top =
    placement === 'top'
      ? Math.max(VIEWPORT_PAD, anchor.top - height - TIP_GAP)
      : Math.min(vh - height - VIEWPORT_PAD, anchor.bottom + TIP_GAP)

  return { left, top, placement, maxWidth }
}

export function NexusInfoTip({
  children,
  label = 'More info',
  tone = 'muted',
  className
}: {
  children: ReactNode
  /** Screen-reader name for the badge; also the native title fallback. */
  label?: string
  tone?: 'muted' | 'lime'
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<TipRect | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const bubbleRef = useRef<HTMLDivElement | null>(null)
  const dismissTimer = useRef<number | null>(null)
  const tipId = useId()

  const reposition = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) {
      return
    }
    setRect(measure(trigger, bubbleRef.current))
  }, [])

  // Two-pass: first paint measures the bubble, then we place it precisely.
  useLayoutEffect(() => {
    if (!open) {
      setRect(null)
      return
    }
    reposition()
    const raf = window.requestAnimationFrame(reposition)
    return () => window.cancelAnimationFrame(raf)
  }, [open, reposition])

  useEffect(() => {
    if (!open) {
      return
    }
    const close = () => setOpen(false)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close()
      }
    }
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    return () => {
      if (dismissTimer.current != null) {
        window.clearTimeout(dismissTimer.current)
      }
    }
  }, [])

  const armTouchDismiss = () => {
    if (dismissTimer.current != null) {
      window.clearTimeout(dismissTimer.current)
    }
    dismissTimer.current = window.setTimeout(() => setOpen(false), TOUCH_DISMISS_MS)
  }

  const toneClass =
    tone === 'lime'
      ? 'border-nexus-lime/55 text-nexus-lime/90 hover:border-nexus-lime hover:text-nexus-lime'
      : 'border-nexus-line text-nexus-muted hover:border-nexus-lime/60 hover:text-nexus-lime/90'

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-describedby={open ? tipId : undefined}
        aria-expanded={open}
        title={label}
        className={[
          'nexus-focus nexus-infotip-badge inline-flex h-[14px] w-[14px] shrink-0 translate-y-[1px] items-center justify-center',
          'rounded-full border align-middle font-mono text-[9px] leading-none transition-colors',
          toneClass,
          className ?? ''
        ].join(' ')}
        onPointerEnter={(event) => {
          if (event.pointerType === 'mouse') {
            setOpen(true)
          }
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === 'mouse') {
            setOpen(false)
          }
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(event) => {
          // Keeps the badge usable on touch and stops parent <summary>/<li> handlers.
          event.preventDefault()
          event.stopPropagation()
          setOpen((prev) => !prev)
          armTouchDismiss()
        }}
      >
        i
      </button>
      {open &&
        createPortal(
          <div
            ref={bubbleRef}
            id={tipId}
            role="tooltip"
            className="nexus-infotip-bubble pointer-events-none fixed z-[9999] border border-nexus-lime/40 bg-nexus-surface-2 px-2.5 py-2 font-mono text-[11px] font-normal leading-snug text-nexus-text/90 shadow-[0_8px_28px_rgba(0,0,0,0.55)]"
            style={{
              left: rect?.left ?? -9999,
              top: rect?.top ?? -9999,
              maxWidth: rect?.maxWidth ?? 320,
              visibility: rect ? 'visible' : 'hidden'
            }}
          >
            {children}
          </div>,
          document.body
        )}
    </>
  )
}

/**
 * Label + `i` badge pair. Use where a section heading previously carried a
 * sentence of explanation inline.
 */
export function NexusLabelWithTip({
  label,
  tip,
  tipLabel,
  className
}: {
  label: ReactNode
  tip: ReactNode
  tipLabel?: string
  className?: string
}) {
  return (
    <span className={['inline-flex items-center gap-1.5', className ?? ''].join(' ')}>
      <span>{label}</span>
      <NexusInfoTip label={tipLabel ?? (typeof label === 'string' ? `About ${label}` : 'More info')}>
        {tip}
      </NexusInfoTip>
    </span>
  )
}
