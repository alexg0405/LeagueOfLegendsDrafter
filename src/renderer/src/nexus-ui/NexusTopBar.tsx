import { motion } from 'framer-motion'
import { MicroLabel, NexusPlus } from './NexusTick'
import { useNexusMotion, topBarVariants } from './nexusMotion'

type Props = {
  runnerId: string
  region: string
  link?: string
  dataVersion: string
  build: string
  networkStatus: string
  /** Optional: source + model (short) */
  resourceLine?: string
  onMinimizeApp?: () => void
  onCloseApp?: () => void
}

export function NexusTopBar({
  runnerId,
  region,
  link = 'LIVE // READY',
  dataVersion,
  build,
  networkStatus,
  resourceLine,
  onMinimizeApp,
  onCloseApp
}: Props) {
  const { reduce } = useNexusMotion()
  return (
    <motion.header
      className="nexus-window-drag min-h-[48px] border-b border-nexus-line bg-nexus-bg flex items-stretch text-sm"
      role="banner"
      variants={topBarVariants(reduce)}
      initial="initial"
      animate="animate"
    >
      <div className="flex-1 flex items-center gap-3 px-4 py-1.5 min-w-0">
        <MicroLabel>App</MicroLabel>
        <span className="font-mono text-nexus-text/95 truncate tabular-nums">{runnerId}</span>
        <span className="text-nexus-line select-none" aria-hidden>
          |
        </span>
        <MicroLabel>region</MicroLabel>
        <span className="font-mono text-nexus-muted uppercase">{region}</span>
        <NexusPlus className="text-[10px] opacity-40" />
        <motion.span
          className="font-mono text-nexus-lime/90 text-xs tracking-widest"
          initial={false}
          whileHover={reduce ? undefined : { x: 1, letterSpacing: '0.14em' }}
          transition={{ duration: 0.12 }}
        >
          {link}
        </motion.span>
      </div>
      <div className="nexus-window-nodrag border-l border-nexus-line flex items-center gap-3 sm:gap-4 px-3 sm:px-4 font-mono text-xs text-nexus-muted">
        <div className="hidden xl:flex items-center gap-2">
          <span className="text-nexus-muted/90">Data</span>
          <span className="text-nexus-text tabular-nums">{dataVersion}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-nexus-muted/90">Build</span>
          <span className="text-nexus-lime/95 tabular-nums">{build}</span>
        </div>
        <div className="hidden sm:flex items-center gap-1">
          <span className="text-nexus-muted/90">League</span>
          <span className="text-nexus-lime/95 uppercase">{networkStatus}</span>
        </div>
        {resourceLine && (
          <div
            className="hidden lg:block text-nexus-text/80 text-[11px] max-w-[min(280px,32vw)] truncate leading-snug"
            title={resourceLine}
          >
            {resourceLine}
          </div>
        )}
        <button
          type="button"
          className="nexus-focus h-7 min-w-7 px-2 border border-nexus-line bg-nexus-surface-2 text-nexus-text/90 hover:bg-nexus-lime/10 hover:border-nexus-lime/45 transition-colors uppercase text-[11px] leading-none"
          onClick={onMinimizeApp}
          aria-label="Minimize application"
          title="Minimize"
        >
          <span
            aria-hidden
            className="inline-block w-2.5 border-t border-current align-middle translate-y-[1px]"
          />
        </button>
        <button
          type="button"
          className="nexus-focus h-7 min-w-7 px-2 border border-nexus-line bg-nexus-surface-2 text-nexus-red hover:bg-nexus-red/15 hover:border-nexus-red/60 transition-colors uppercase text-[11px] leading-none"
          onClick={onCloseApp}
          aria-label="Close application"
          title="Close"
        >
          X
        </button>
      </div>
    </motion.header>
  )
}
