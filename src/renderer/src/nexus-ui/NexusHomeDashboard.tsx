import { motion } from 'framer-motion'
import { useState, type ReactNode } from 'react'
import { ParticleWordMark } from '../ParticleWordLoader'
import { NexusCollapsible } from './NexusCollapsible'
import { MicroLabel, NexusPlus } from './NexusTick'
import { NexusProgressSegmented } from './NexusProgressSegmented'
import {
  EASING,
  useNexusMotion,
  homeTitleLineVars,
  homeMetaCascadeVars,
  cardStaggerContainerVars
} from './nexusMotion'

type Props = {
  ddragonVersion: string
  patchLabel: string
  onEnterOperations: () => void
}

type HomeModule = {
  id: string
  kicker: string
  title: string
  light?: boolean
  body: ReactNode
}

export function NexusHomeDashboard({
  ddragonVersion,
  patchLabel,
  onEnterOperations
}: Props) {
  const [openModuleIds, setOpenModuleIds] = useState<ReadonlySet<string>>(() => new Set())
  const { reduce } = useNexusMotion()
  const titleV = homeTitleLineVars(reduce)
  const metaV = homeMetaCascadeVars(reduce)
  const gridV = cardStaggerContainerVars(reduce)
  const modules: HomeModule[] = [
    {
      id: 'LC_01',
      kicker: 'lcu',
      title: 'League client',
      body: 'Connects to the Riot client when you are in champ select. No login stored in Nexus.'
    },
    {
      id: 'SC_01',
      kicker: 'model',
      title: 'Scoring',
      light: true,
      body: (
        <>
          <NexusProgressSegmented value={0.55} label="blend (v1)" sub="4-term" />
          <p className="mt-2 font-mono text-sm text-[#1a1e1a]">Base / lane / ally terms · export optional</p>
        </>
      )
    },
    {
      id: 'OV_01',
      kicker: 'hud',
      title: 'Overlay',
      body: 'Compact window on top of the game. Insert, F9, or F10 — set up from Draft.'
    },
    {
      id: 'TR_01',
      kicker: 'train',
      title: 'Data (optional)',
      light: true,
      body: 'Pull match-v5, ingest, aggregate, export — for custom stats. No cloud required.'
    }
  ]

  return (
    <div className="p-5 lg:px-8 lg:py-6 min-h-0 max-w-[1100px]">
      <section className="nexus-command-deck relative mb-6 border border-nexus-line bg-nexus-surface-2 overflow-hidden">
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
              <span className="font-mono text-sm text-nexus-lime/85">SoloQ · Flex · manual entry if needed</span>
            </motion.div>
            <motion.h1
              className="mb-1"
              custom={0}
              variants={titleV}
              initial="initial"
              animate="animate"
            >
              <ParticleWordMark
                ariaLabel="NexusDraft"
                target="nexusdraft"
                className="h-[8.5rem] w-full max-w-[620px] sm:h-[10rem] md:h-[11.5rem]"
                maxParticles={1500}
                fontScale={0.22}
                minFontSize={54}
                maxFontSize={154}
                interactive={false}
              />
            </motion.h1>
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
            <motion.div
              className="mt-3 inline-flex flex-wrap items-center gap-x-2 gap-y-1 border border-nexus-line/70 bg-nexus-bg/35 px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-nexus-text"
              custom={3}
              variants={metaV}
              initial="initial"
              animate="animate"
            >
              <span>github</span>
            </motion.div>
          </div>
          <div className="border-t lg:border-t-0 lg:border-l border-nexus-line bg-nexus-bg/90 flex flex-col min-h-[100px]">
            <motion.div
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 auto-rows-min items-start gap-2 p-2"
              variants={gridV}
              initial="initial"
              animate="animate"
            >
              {modules.map((module) => {
                const isOpen = openModuleIds.has(module.id)
                return (
                  <motion.section
                    key={module.id}
                    className={[
                      'relative border border-nexus-line overflow-hidden',
                      module.light ? 'bg-nexus-panel text-[#0a0c0d]' : 'bg-nexus-surface'
                    ].join(' ')}
                    transition={reduce ? { duration: 0 } : { duration: 0.18, ease: EASING.out }}
                  >
                    <button
                      type="button"
                      className="nexus-focus w-full px-4 py-3 text-left flex items-center justify-between gap-3 font-mono text-sm"
                      onClick={() =>
                        setOpenModuleIds((prev) => {
                          const next = new Set(prev)
                          if (next.has(module.id)) {
                            next.delete(module.id)
                          } else {
                            next.add(module.id)
                          }
                          return next
                        })
                      }
                      aria-expanded={isOpen}
                    >
                      <span className={module.light ? 'text-[#1a1e1a]' : 'text-nexus-muted'}>{module.title}</span>
                      <motion.span
                        className={[
                          'text-lg leading-none',
                          module.light ? 'text-[#0a0c0d]' : 'text-nexus-lime/90'
                        ].join(' ')}
                        animate={reduce ? undefined : { rotate: isOpen ? 45 : 0, scale: isOpen ? 1.08 : 1 }}
                        transition={{ duration: 0.14, ease: EASING.sharp }}
                        aria-hidden
                      >
                        +
                      </motion.span>
                    </button>
                    <NexusCollapsible
                      open={isOpen}
                      reduce={reduce}
                      className={isOpen ? 'border-t border-nexus-line' : 'border-t border-transparent'}
                    >
                      <div
                        className={[
                          'px-4 py-3 min-h-[120px]',
                          module.light ? 'text-[#1a1e1a]' : 'text-nexus-muted'
                        ].join(' ')}
                      >
                        <MicroLabel className={module.light ? 'opacity-70 text-[#1a1e1a]' : 'opacity-80'}>
                          {module.kicker}
                        </MicroLabel>
                        <h3
                          className={[
                            'mt-1 font-display text-2xl tracking-[0.1em] uppercase leading-tight',
                            module.light ? 'text-[#0a0c0d]' : 'text-nexus-text'
                          ].join(' ')}
                        >
                          {module.title}
                        </h3>
                        <div className="mt-2 text-base leading-relaxed">{module.body}</div>
                      </div>
                    </NexusCollapsible>
                  </motion.section>
                )
              })}
            </motion.div>
            <div className="border-t border-nexus-line p-2.5 font-mono text-xs text-nexus-muted space-y-0.5">
              <p>APP_1.1.0</p>
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

    </div>
  )
}
