import { motion } from 'framer-motion'
import { MicroLabel } from './NexusTick'
import type { Variants } from 'framer-motion'
import { DUR, EASING, useNexusMotion } from './nexusMotion'

const liVariants = (reduce: boolean): Variants => {
  if (reduce) {
    return {
      initial: { opacity: 1, x: 0 },
      animate: { opacity: 1, x: 0, transition: { duration: 0.01 } }
    }
  }
  return {
    initial: { opacity: 0, x: -6 },
    animate: (i: number) => ({
      opacity: 1,
      x: 0,
      transition: { delay: 0.08 + (i as number) * 0.05, duration: DUR.fast, ease: EASING.out }
    })
  }
}

/** Setup tab — most controls stay under Draft; this is orientation only. */
export function NexusStubView() {
  const { reduce } = useNexusMotion()
  const li = liVariants(reduce)
  const copy = [
    '· LCU: live pick/ban from the Riot client when it is open.',
    '· Manual board: use local entry when LCU is unavailable.',
    '· Overlay: Insert / F9 / F10 from Draft.'
  ]
  return (
    <div className="p-6 max-w-2xl text-base">
      <div className="border border-nexus-line bg-nexus-surface-2 p-6 sm:p-8 relative overflow-hidden">
        <motion.div
          initial={reduce ? false : { opacity: 0, clipPath: 'inset(0 4% 0 4%)' }}
          animate={{ opacity: 1, clipPath: 'inset(0 0% 0 0%)' }}
          transition={{ duration: DUR.panel, ease: EASING.out }}
        >
          <MicroLabel>setup // league</MicroLabel>
          <h1 className="font-display text-3xl sm:text-4xl tracking-[0.1em] text-nexus-text mt-2 mb-4">CLIENT &amp; CAPTURE</h1>
        </motion.div>
        <motion.p
          className="font-mono text-base sm:text-lg text-nexus-muted max-w-prose leading-relaxed"
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06, duration: DUR.fast, ease: EASING.sharp }}
        >
          Use the <strong className="text-nexus-text/90">Draft</strong> screen for the League client link, your role, champion
          data, manual board, and overlay toggle. Nothing here is paywalled.
        </motion.p>
        <ul className="mt-5 space-y-2.5 font-mono text-sm sm:text-base text-nexus-text/90 list-none pl-0">
          {copy.map((line, i) => (
            <motion.li
              key={line}
              className="border-l-2 border-nexus-lime/50 pl-3 first:border-nexus-lime/80"
              custom={i}
              variants={li}
              initial="initial"
              animate="animate"
            >
              {line}
            </motion.li>
          ))}
        </ul>
        <motion.p
          className="mt-5 font-mono text-sm text-nexus-muted"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.28, duration: 0.15 }}
        >
          Nexus//Draft is not affiliated with Riot Games.
        </motion.p>
      </div>
    </div>
  )
}
