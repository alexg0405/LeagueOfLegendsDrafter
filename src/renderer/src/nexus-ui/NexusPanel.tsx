import type { ReactNode } from 'react'
import { MicroLabel } from './NexusTick'

type Props = {
  kicker?: string
  title: string
  children: ReactNode
  className?: string
  /** Slight highlight for first / hero panel */
  accent?: boolean
}

/** Section panel — matches Nexus home / module shell (industrial, lime, no rounded “card” blob) */
export function NexusPanel({ kicker, title, children, className = '', accent = false }: Props) {
  return (
    <section
      className={[
        'relative border border-nexus-line bg-nexus-surface-2/90 p-4 sm:p-5 mb-4',
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
        accent ? 'border-nexus-lime/25' : '',
        className
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {kicker && (
        <MicroLabel className="block mb-2 text-nexus-lime/75">{kicker}</MicroLabel>
      )}
      <h2 className="font-display text-base sm:text-lg tracking-[0.14em] uppercase text-nexus-lime/95 mb-3 sm:mb-4">
        {title}
      </h2>
      <div className="text-sm sm:text-base leading-relaxed">{children}</div>
    </section>
  )
}
