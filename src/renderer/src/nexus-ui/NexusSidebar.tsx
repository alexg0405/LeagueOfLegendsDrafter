import { motion } from 'framer-motion'
import { MicroLabel, NexusPlus } from './NexusTick'
import { DUR, EASING, useNexusMotion, navItemVariants, springMicro } from './nexusMotion'

/** League / Nexus-only routes — no placeholder game-launcher items */
export type NexusNavId = 'home' | 'operations' | 'settings'

const NAV: { id: NexusNavId; label: string; tag: string }[] = [
  { id: 'home', label: 'Home', tag: '01' },
  { id: 'operations', label: 'Draft', tag: '02' },
  { id: 'settings', label: 'Setup', tag: '03' }
]

const navStagger: import('framer-motion').Variants = {
  initial: {},
  animate: {
    transition: { staggerChildren: 0.055, delayChildren: 0.1, when: 'beforeChildren' }
  }
}

type Props = {
  active: NexusNavId
  onNavigate: (id: NexusNavId) => void
}

export function NexusSidebar({ active, onNavigate }: Props) {
  const { reduce } = useNexusMotion()
  return (
    <aside
      className="w-[72px] shrink-0 border-r border-nexus-line bg-nexus-surface flex flex-col"
      aria-label="Primary navigation"
    >
      <motion.div
        className="min-h-[48px] border-b border-nexus-line flex items-center justify-center py-2"
        initial={reduce ? false : { opacity: 0, y: -3 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DUR.fast, ease: EASING.sharp }}
      >
        <span className="font-mono text-[10px] text-nexus-lime/80">NX</span>
      </motion.div>
      <motion.nav
        className="flex-1 flex flex-col py-2 gap-0.5"
        variants={navStagger}
        initial="initial"
        animate="animate"
      >
        {NAV.map((item) => {
          const on = item.id === active
          return (
            <motion.button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              variants={navItemVariants(reduce)}
              className="nexus-focus group relative flex flex-col items-center py-2.5 px-1 text-left w-full overflow-hidden"
              whileHover={
                reduce
                  ? undefined
                  : { x: 2, transition: { duration: 0.12, ease: EASING.sharp } }
              }
              whileTap={reduce ? undefined : { scale: 0.98 }}
            >
              {on && (
                <motion.div
                  layoutId="nexus-nav-slab"
                  className="absolute inset-y-0.5 left-0 right-0 -z-0 border-l-2 border-nexus-lime bg-nexus-lime/12"
                  transition={reduce ? { duration: 0.01 } : springMicro}
                />
              )}
              <span
                className={`relative z-10 font-mono text-[9px] tabular-nums ${on ? 'text-nexus-lime' : 'text-nexus-muted'}`}
              >
                {item.tag}
              </span>
              <span
                className={`relative z-10 font-display text-xs tracking-wide uppercase leading-tight text-center ${
                  on ? 'text-nexus-text' : 'text-nexus-muted group-hover:text-nexus-text/90'
                }`}
              >
                {item.label}
              </span>
            </motion.button>
          )
        })}
      </motion.nav>
      <div className="border-t border-nexus-line p-2 flex flex-col items-center gap-1">
        <NexusPlus className="text-[8px] opacity-50" />
        <MicroLabel className="[writing-mode:vertical-rl] rotate-180 text-[10px] opacity-50">
          draft v 1.1
        </MicroLabel>
      </div>
    </aside>
  )
}
