import { motion } from 'framer-motion'
import { MicroLabel } from './NexusTick'
import { EASING, useNexusMotion } from './nexusMotion'

type Props = {
  primaryLabel: string
  onPrimary?: () => void
  secondaryLabel?: string
  onSecondary?: () => void
  statusLine: string
  /** If omitted, queue estimate is hidden (avoids a useless “—”) */
  estWait?: string
  platform: string
}

export function NexusBottomActionBar({
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  statusLine,
  estWait,
  platform
}: Props) {
  const { reduce } = useNexusMotion()
  return (
    <div className="min-h-[52px] border-t border-nexus-line bg-nexus-surface-2 flex items-stretch text-sm">
      <div className="flex-1 flex items-center px-4 gap-3 min-w-0 py-1">
        <MicroLabel>Status</MicroLabel>
        <motion.span
          key={statusLine}
          className="font-mono text-sm text-nexus-text/80 truncate leading-snug"
          initial={reduce ? false : { x: 4, opacity: 0.5 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.14, ease: EASING.sharp }}
        >
          {statusLine}
        </motion.span>
        {estWait != null && estWait !== '' && estWait !== '—' && (
          <>
            <span className="text-nexus-line hidden sm:inline" aria-hidden>
              |
            </span>
            <span className="font-mono text-xs text-nexus-yellow/90 hidden sm:inline tabular-nums">
              Queue: {estWait}
            </span>
          </>
        )}
      </div>
      <div className="flex items-stretch">
        {secondaryLabel && (
          <motion.button
            type="button"
            onClick={onSecondary}
            className="nexus-focus px-4 sm:px-5 font-display text-sm tracking-[0.18em] uppercase text-nexus-muted border-l border-nexus-line hover:bg-nexus-surface hover:text-nexus-text"
            whileHover={reduce ? undefined : { x: 2, transition: { duration: 0.1, ease: EASING.sharp } }}
            whileTap={reduce ? undefined : { scale: 0.99 }}
            transition={{ duration: 0.1 }}
          >
            {secondaryLabel}
          </motion.button>
        )}
        <motion.button
          type="button"
          onClick={onPrimary}
          className="nexus-focus nexus-glitch-cta nexus-glitch-cta--solid relative overflow-hidden px-6 sm:px-8 min-w-[180px] font-display text-base tracking-[0.2em] uppercase bg-nexus-lime text-nexus-bg border-l border-nexus-lime/80 hover:brightness-110"
          data-glitch-label={primaryLabel}
          initial="rest"
          whileHover={reduce ? undefined : 'hover'}
          whileTap={reduce ? undefined : { scale: 0.992 }}
          variants={{
            rest: {},
            hover: {}
          }}
          transition={{ duration: 0.1 }}
        >
          {!reduce && (
            <motion.span
              className="absolute inset-0 pointer-events-none bg-nexus-text/[0.06]"
              variants={{
                rest: { x: '-102%', opacity: 0 },
                hover: { x: 0, opacity: 1, transition: { duration: 0.2, ease: EASING.sharp } }
              }}
            />
          )}
          <span className="relative z-10 block">{primaryLabel}</span>
        </motion.button>
      </div>
      <div className="hidden md:flex w-44 min-w-0 border-l border-nexus-line items-center justify-center px-2">
        <span className="font-mono text-xs text-nexus-muted uppercase text-center leading-snug">{platform}</span>
      </div>
    </div>
  )
}
