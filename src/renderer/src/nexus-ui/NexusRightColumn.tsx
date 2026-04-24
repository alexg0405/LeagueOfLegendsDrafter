import type { DraftSource } from '@shared/draft'
import { motion } from 'framer-motion'
import { MicroLabel, NexusPlus } from './NexusTick'
import { DUR, EASING, useNexusMotion, rightColumnListVariants, rightColumnItemVariants } from './nexusMotion'
import { copyDraftSource } from './nexusCopy'

type Props = {
  /** Riot LCU / client string */
  lcuState: string
  /** lcu | vision | manual | none */
  draftSource: string
  /** Whether we have a board to score */
  hasDraftBoard: boolean
  modelLabel: string
  queueLine?: string
}

export function NexusRightColumn({
  lcuState,
  draftSource,
  hasDraftBoard,
  modelLabel,
  queueLine
}: Props) {
  const { reduce } = useNexusMotion()
  const item = rightColumnItemVariants(reduce)
  const src = copyDraftSource((draftSource || 'none') as DraftSource)
  const srcKey = (draftSource || 'none') as DraftSource
  return (
    <aside
      className="w-[280px] min-w-[260px] shrink-0 border-l border-nexus-line bg-nexus-surface flex flex-col text-sm"
      aria-label="Client and draft status"
    >
      <motion.div
        className="min-h-10 border-b border-nexus-line flex items-center px-3 py-1.5"
        initial={reduce ? false : { x: 6, opacity: 0.75 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: DUR.fast, ease: EASING.sharp }}
      >
        <MicroLabel className="text-nexus-lime/80">League</MicroLabel>
      </motion.div>
      <motion.div
        className="p-3.5 space-y-3.5 flex-1 overflow-y-auto nexus-ops-scroll text-sm leading-relaxed"
        variants={rightColumnListVariants}
        initial="initial"
        animate="animate"
      >
        <motion.section
          className="border border-nexus-line/90 bg-nexus-surface-2/80 p-3"
          variants={item}
        >
          <div className="flex justify-between items-baseline gap-2 mb-2">
            <MicroLabel>Riot client</MicroLabel>
            <motion.span
              key={lcuState.includes('reachable') ? 'on' : 'off'}
              className={`font-mono text-xs font-medium ${
                lcuState.includes('reachable') ? 'text-nexus-lime' : 'text-nexus-red/80'
              }`}
              initial={reduce ? false : { y: -4, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.12, ease: EASING.sharp }}
            >
              {lcuState.includes('reachable') ? 'On' : 'Off'}
            </motion.span>
          </div>
          <p className="font-mono text-sm text-nexus-text/90 leading-snug">{lcuState}</p>
        </motion.section>

        <motion.section className="space-y-2" variants={item}>
          <div className="flex justify-between font-mono text-sm border-b border-nexus-line/60 pb-1.5 gap-2">
            <span className="text-nexus-muted shrink-0">Picks from</span>
            <motion.span
              key={srcKey}
              className="text-nexus-text/90 text-right font-medium min-w-0"
              initial={reduce ? false : { x: 6, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.14, ease: EASING.sharp }}
            >
              {src}
            </motion.span>
          </div>
          <div className="flex justify-between font-mono text-sm border-b border-nexus-line/60 pb-1.5">
            <span className="text-nexus-muted">Roster</span>
            <motion.span
              key={hasDraftBoard ? 'live' : 'wait'}
              className={hasDraftBoard ? 'text-nexus-lime font-medium' : 'text-nexus-yellow/90 font-medium'}
              initial={reduce ? false : { scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 28, mass: 0.4 }}
            >
              {hasDraftBoard ? 'Ready' : 'Empty'}
            </motion.span>
          </div>
          <div className="flex justify-between font-mono text-sm gap-2">
            <span className="text-nexus-muted shrink-0">Scoring</span>
            <span className="text-nexus-text/90 text-right leading-snug min-w-0 break-words">{modelLabel}</span>
          </div>
        </motion.section>

        {queueLine && (
          <motion.section variants={item}>
            <MicroLabel>Tip</MicroLabel>
            <p className="font-mono text-sm text-nexus-lime/85 mt-1.5 leading-relaxed">{queueLine}</p>
          </motion.section>
        )}

        <motion.p
          className="font-mono text-xs text-nexus-muted leading-relaxed"
          variants={item}
        >
          Riot and League of Legends are trademarks of Riot Games, Inc. Nexus//Draft is an independent tool.
        </motion.p>

        <div className="flex items-center justify-center gap-1 pt-1 opacity-40" aria-hidden>
          <NexusPlus className="text-[8px]" />
          <div className="h-px w-12 bg-nexus-line" />
          <NexusPlus className="text-[8px]" />
        </div>
      </motion.div>
    </aside>
  )
}
