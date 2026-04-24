import { motion, type HTMLMotionProps } from 'framer-motion'
import type { ReactNode } from 'react'
import { useNexusMotion, mainRouteVariants } from './nexusMotion'

type Props = {
  children: ReactNode
  /** 1 = forward (next route index), -1 = back */
  direction: number
} & Pick<HTMLMotionProps<'div'>, 'className'>

/**
 * AnimatePresence child wrapper — keeps route choreography (wipe, slide) consistent.
 */
export function NexusRoutePanel({ children, direction, className }: Props) {
  const { reduce } = useNexusMotion()
  return (
    <motion.div
      className={className}
      custom={direction}
      variants={mainRouteVariants(reduce)}
      initial="initial"
      animate="enter"
      exit="exit"
    >
      {children}
    </motion.div>
  )
}
