import { useReducedMotion } from 'framer-motion'
import type { Variants, Transition } from 'framer-motion'
import type { NexusNavId } from './NexusSidebar'

/** Punchy, controlled — not floaty */
export const EASING = {
  out: [0.22, 1, 0.36, 1] as const,
  /** Slight overshoot, disciplined */
  snap: [0.34, 1.15, 0.34, 1] as const,
  sharp: [0.4, 0, 0.2, 1] as const
}

export const DUR = {
  micro: 0.14,
  fast: 0.2,
  panel: 0.3,
  section: 0.38
}

export const MOTION_PRESETS = {
  fast: DUR.fast,
  panel: DUR.panel,
  cinematic: 0.52,
  reduced: 0.01
}

const STAGGER = { nav: 0.055, card: 0.065, row: 0.045, meta: 0.04 }

export const NAV_ORDER: Record<NexusNavId, number> = { home: 0, operations: 1, settings: 2 }

export function useNexusMotion() {
  const reduce = useReducedMotion() ?? false
  return { reduce, dur: (n: number) => (reduce ? 0.01 : n) }
}

export const springMicro: Transition = { type: 'spring', stiffness: 520, damping: 38, mass: 0.7 }

const transitionEnter = (reduce: boolean): Transition =>
  reduce
    ? { duration: 0.01 }
    : { duration: DUR.panel, ease: EASING.out }

const transitionExit = (reduce: boolean): Transition =>
  reduce
    ? { duration: 0.01 }
    : { duration: DUR.fast, ease: EASING.sharp }

/** Main canvas: directional wipe + slide. `custom` = 1 or -1 */
export function mainRouteVariants(reduce: boolean): Variants {
  if (reduce) {
    return {
      initial: { opacity: 0 },
      enter: { opacity: 1, transition: transitionEnter(true) },
      exit: { opacity: 0, transition: transitionExit(true) }
    }
  }
  return {
    initial: (d: number) => ({
      x: 28 * d,
      opacity: 0,
      clipPath: 'inset(0 8% 0 8%)',
      filter: 'brightness(0.96)'
    }),
    enter: {
      x: 0,
      opacity: 1,
      clipPath: 'inset(0 0% 0 0%)',
      filter: 'brightness(1)',
      transition: { ...transitionEnter(false), clipPath: { duration: DUR.section, ease: EASING.out } as Transition }
    },
    exit: (d: number) => ({
      x: -22 * d,
      opacity: 0,
      clipPath: 'inset(0 6% 0 6%)',
      filter: 'brightness(0.92)',
      transition: { ...transitionExit(false), duration: DUR.panel }
    })
  }
}

export const navItemVariants = (reduce: boolean): Variants => ({
  initial: { opacity: reduce ? 0 : 0.65, y: reduce ? 0 : 3 },
  animate: { opacity: 1, y: 0, transition: { duration: DUR.panel, ease: EASING.out } }
})

export const topBarVariants = (reduce: boolean): Variants => ({
  initial: { opacity: 0, y: reduce ? 0 : -4 },
  animate: { opacity: 1, y: 0, transition: { duration: DUR.fast, ease: EASING.sharp } }
})

export const rightColumnListVariants: Variants = {
  initial: { opacity: 1 },
  animate: {
    transition: { staggerChildren: STAGGER.row, delayChildren: 0.04, when: 'beforeChildren' }
  }
}

export const rightColumnItemVariants = (reduce: boolean): Variants => ({
  initial: { opacity: 0, x: reduce ? 0 : 6 },
  animate: { opacity: 1, x: 0, transition: { duration: DUR.fast, ease: EASING.out } }
})

export function homeTitleLineVars(reduce: boolean): Variants {
  if (reduce) {
    return {
      initial: { opacity: 1, y: 0 },
      animate: { opacity: 1, y: 0, transition: { duration: 0.01 } }
    }
  }
  return {
    initial: { opacity: 0, y: 10 },
    animate: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: { delay: (i as number) * 0.05, duration: DUR.panel, ease: EASING.snap }
    })
  }
}

export function homeMetaCascadeVars(reduce: boolean): Variants {
  if (reduce) {
    return {
      initial: { opacity: 1, x: 0 },
      animate: { opacity: 1, x: 0, transition: { duration: 0.01 } }
    }
  }
  return {
    initial: { opacity: 0, x: -8 },
    animate: (i: number) => ({
      opacity: 1,
      x: 0,
      transition: { delay: 0.12 + (i as number) * 0.04, duration: DUR.fast, ease: EASING.out }
    })
  }
}

export function cardStaggerContainerVars(reduce: boolean): Variants {
  if (reduce) {
    return { initial: {}, animate: { transition: { duration: 0.01 } } }
  }
  return {
    initial: {},
    animate: { transition: { staggerChildren: STAGGER.card, delayChildren: 0.2 } }
  }
}

export const cardStaggerItem = (reduce: boolean): Variants => ({
  initial: { opacity: 0, y: reduce ? 0 : 12, x: reduce ? 0 : -6, skewX: reduce ? 0 : -0.3 },
  animate: {
    opacity: 1,
    y: 0,
    x: 0,
    skewX: 0,
    transition: { duration: DUR.section, ease: EASING.out }
  }
})

export { STAGGER }
