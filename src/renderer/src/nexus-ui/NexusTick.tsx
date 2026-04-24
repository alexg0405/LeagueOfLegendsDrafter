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

export function NexusCross({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block font-mono text-nexus-line select-none ${className}`}
      aria-hidden
    >
      ×
    </span>
  )
}

export function MicroLabel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`font-mono text-[11px] uppercase tracking-[0.14em] text-nexus-muted ${className}`}
    >
      {children}
    </span>
  )
}
