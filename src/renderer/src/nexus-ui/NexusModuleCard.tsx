import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { NexusCross, MicroLabel } from './NexusTick'
import { DUR, EASING, useNexusMotion, cardStaggerItem } from './nexusMotion'

type Props = {
  title: string
  kicker?: string
  id?: string
  children: ReactNode
  className?: string
  light?: boolean
}

export function NexusModuleCard({ title, kicker, id, children, className = '', light = false }: Props) {
  const { reduce } = useNexusMotion()
  return (
    <motion.article
      variants={cardStaggerItem(reduce)}
      className={[
        'group relative border border-nexus-line overflow-hidden',
        light ? 'bg-nexus-panel text-[#0a0c0d]' : 'bg-nexus-surface',
        'p-4 sm:p-5 flex flex-col gap-3',
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
        className
      ].join(' ')}
    >
      {!reduce && (
        <div
          className="absolute bottom-0 left-0 right-0 h-px z-0 pointer-events-none origin-left scale-x-[0.08] opacity-40 group-hover:scale-x-100 group-hover:opacity-95 transition-[transform,opacity] duration-[220ms] ease-out bg-nexus-lime/80"
          aria-hidden
        />
      )}
      <div
        className={`absolute top-0 right-0 w-8 h-8 border-l border-b border-nexus-line/50 flex items-start justify-end p-0.5 ${
          light ? 'border-[#0a0c0d]/15' : ''
        }`}
        aria-hidden
      >
        <motion.span
          className="block"
          whileHover={reduce ? undefined : { y: -1, x: 1, transition: { duration: 0.12, ease: EASING.sharp } }}
        >
          <NexusCross className="text-xs opacity-40" />
        </motion.span>
      </div>
      <header className="flex items-start justify-between gap-2 pr-6 relative z-10">
        <div>
          {kicker && (
            <motion.div
              className="block mb-1.5"
              whileHover={reduce ? undefined : { x: 2, transition: { duration: 0.12, ease: EASING.out } }}
            >
              <MicroLabel className="opacity-80">{kicker}</MicroLabel>
            </motion.div>
          )}
          <motion.h3
            className={`font-display text-2xl tracking-[0.1em] uppercase leading-tight ${
              light ? 'text-[#0a0c0d]' : 'text-nexus-text'
            }`}
            whileHover={reduce ? undefined : { x: 1, transition: { duration: 0.14, ease: EASING.out } }}
          >
            {title}
          </motion.h3>
        </div>
        {id && (
          <motion.span
            className="font-mono text-xs text-nexus-lime/90 shrink-0 tabular-nums"
            whileHover={reduce ? undefined : { scale: 1.04, transition: { duration: 0.12, ease: EASING.snap } }}
          >
            {id}
          </motion.span>
        )}
      </header>
      <motion.div
        className={`text-base leading-relaxed relative z-10 ${light ? 'text-[#1a1e1a]' : 'text-nexus-muted'}`}
        whileHover={reduce ? undefined : { y: 0, transition: { delay: 0, duration: 0.12 } }}
      >
        {children}
      </motion.div>
    </motion.article>
  )
}
