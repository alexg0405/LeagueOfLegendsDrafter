import type { ReactNode } from 'react'

/** Tiny tactical marks — not branded artwork, just linework. */
export function NexusPlus({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block font-mono text-nexus-lime/90 select-none ${className}`}
      aria-hidden
    >
      +
    </span>
  )
}

/**
 * Small caps label. Doubles as a form label, so it stays at readable contrast rather
 * than the dim tone used for de-emphasised body copy.
 */
export function MicroLabel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`font-mono text-xs uppercase tracking-[0.14em] text-nexus-text/85 ${className}`}
    >
      {children}
    </span>
  )
}
