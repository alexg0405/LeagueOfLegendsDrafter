import { motion } from 'framer-motion'
import { MicroLabel, NexusPlus } from './NexusTick'
import { NexusModuleCard } from './NexusModuleCard'
import { NexusProgressSegmented } from './NexusProgressSegmented'
import {
  DUR,
  EASING,
  useNexusMotion,
  homeTitleLineVars,
  homeMetaCascadeVars,
  cardStaggerContainerVars
} from './nexusMotion'

type Props = {
  ddragonVersion: string
  lcuStatus: string
  patchLabel: string
  onEnterOperations: () => void
}

export function NexusHomeDashboard({
  ddragonVersion,
  lcuStatus,
  patchLabel,
  onEnterOperations
}: Props) {
  const { reduce } = useNexusMotion()
  const titleV = homeTitleLineVars(reduce)
  const metaV = homeMetaCascadeVars(reduce)
  const gridV = cardStaggerContainerVars(reduce)

  return (
    <div className="p-5 lg:px-8 lg:py-6 min-h-0 max-w-[1100px]">
      <section className="relative mb-6 border border-nexus-line bg-nexus-surface-2 overflow-hidden">
        <div className="nexus-noise absolute inset-0 opacity-40" aria-hidden />
        <div className="relative grid grid-cols-1 lg:grid-cols-[1fr_120px]">
          <div className="p-6 pb-5 lg:pr-4">
            <motion.div
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2"
              custom={0}
              variants={metaV}
              initial="initial"
              animate="animate"
            >
              <MicroLabel>league // champ select</MicroLabel>
              <span className="font-mono text-sm text-nexus-lime/85">SoloQ · Flex · manual/vision if needed</span>
            </motion.div>
            <h1 className="font-display text-5xl sm:text-6xl md:text-7xl text-nexus-text leading-[0.9] tracking-[0.06em] mb-1 overflow-hidden">
              <motion.span className="block" custom={0} variants={titleV} initial="initial" animate="animate">
                DRAFT
              </motion.span>
              <motion.span className="block text-nexus-lime" custom={1} variants={titleV} initial="initial" animate="animate">
                NEXUS
              </motion.span>
            </h1>
            <motion.p
              className="font-mono text-sm sm:text-base text-nexus-muted max-w-xl mt-4 leading-relaxed"
              custom={0}
              variants={metaV}
              initial="initial"
              animate="animate"
            >
              Pick and ban support for <span className="text-nexus-text/85">League of Legends</span> — Riot LCU, manual
              board, or screen vision. Suggestions are heuristics plus optional data you train locally. Third-party; not
              from Riot.
            </motion.p>
            <motion.div
              className="mt-4 flex flex-wrap items-center gap-2 font-mono text-sm text-nexus-muted"
              custom={1}
              variants={metaV}
              initial="initial"
              animate="animate"
            >
              <span>Data Dragon {ddragonVersion || '—'}</span>
              <NexusPlus className="text-xs opacity-50" />
              <span className="text-nexus-lime/80">scorer: {patchLabel}</span>
            </motion.div>
            <div className="mt-6 flex flex-wrap gap-2">
              <motion.button
                type="button"
                onClick={onEnterOperations}
                className="nexus-focus px-7 py-3 font-display text-base tracking-[0.18em] uppercase bg-nexus-lime text-nexus-bg border border-nexus-lime/90"
                whileHover={reduce ? undefined : { x: 3, transition: { duration: 0.12, ease: EASING.sharp } }}
                whileTap={reduce ? undefined : { scale: 0.99 }}
              >
                Open draft
              </motion.button>
            </div>
            <motion.p
              className="mt-4 font-mono text-sm text-nexus-red/85 max-w-prose leading-snug"
              custom={2}
              variants={metaV}
              initial="initial"
              animate="animate"
            >
              Client: {lcuStatus}
            </motion.p>
          </div>
          <div className="border-t lg:border-t-0 lg:border-l border-nexus-line bg-nexus-bg/90 flex flex-col min-h-[100px]">
            <div className="flex-1 p-2 flex items-center justify-center">
              <motion.div
                className="text-nexus-lime/90 font-display text-5xl leading-none tracking-widest opacity-90 [writing-mode:vertical-rl] [text-orientation:mixed]"
                initial={reduce ? false : { opacity: 0, x: 10 }}
                animate={{ opacity: 0.9, x: 0 }}
                transition={{ delay: 0.18, duration: DUR.panel, ease: EASING.out }}
              >
                NEX
              </motion.div>
            </div>
            <div className="border-t border-nexus-line p-2.5 font-mono text-xs text-nexus-muted space-y-0.5">
              <p>APP_0.2.0</p>
            </div>
          </div>
        </div>
        <div className="h-1 flex border-t border-nexus-line">
          <motion.div
            className="h-full bg-nexus-lime/80"
            initial={reduce ? { width: '32%' } : { width: '0%' }}
            animate={{ width: '32%' }}
            transition={reduce ? { duration: 0 } : { duration: 0.4, ease: EASING.out }}
          />
          <div className="flex-1 bg-nexus-surface-2" />
        </div>
      </section>

      <motion.div
        className="grid grid-cols-1 sm:grid-cols-2 gap-4"
        variants={gridV}
        initial="initial"
        animate="animate"
      >
        <NexusModuleCard title="League client" kicker="lcu" id="LC_01" className="min-h-[128px]">
          Connects to the Riot client when you are in champ select. No login stored in Nexus.
        </NexusModuleCard>
        <NexusModuleCard title="Scoring" kicker="model" id="SC_01" className="min-h-[120px] light">
          <NexusProgressSegmented value={0.55} label="blend (v1)" sub="4-term" />
          <p className="mt-2 font-mono text-sm text-nexus-muted/95">
            Base / lane / ally terms · export optional
          </p>
        </NexusModuleCard>
        <NexusModuleCard title="Overlay" kicker="hud" id="OV_01" className="min-h-[120px]">
          Compact window on top of the game. Insert, F9, or F10 — set up from Draft.
        </NexusModuleCard>
        <NexusModuleCard title="Data (optional)" kicker="train" id="TR_01" className="min-h-[120px] light">
          Pull match-v5, ingest, aggregate, export — for custom stats. No cloud required.
        </NexusModuleCard>
      </motion.div>
    </div>
  )
}
