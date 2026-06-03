import { motion } from 'framer-motion'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { EASING, MOTION_PRESETS } from './nexusMotion'

type NexusCollapsibleProps = {
  id?: string
  open: boolean
  reduce?: boolean
  className?: string
  contentClassName?: string
  children: ReactNode
  unmountDelayMs?: number
}

export function NexusCollapsible({
  id,
  open,
  reduce = false,
  className = '',
  contentClassName = '',
  children,
  unmountDelayMs = 180
}: NexusCollapsibleProps) {
  const contentRef = useRef<HTMLDivElement | null>(null)
  const [height, setHeight] = useState(0)
  const [mounted, setMounted] = useState(open)

  useEffect(() => {
    if (open) {
      setMounted(true)
      return
    }
    const timeout = window.setTimeout(() => setMounted(false), reduce ? 0 : unmountDelayMs)
    return () => window.clearTimeout(timeout)
  }, [open, reduce, unmountDelayMs])

  useLayoutEffect(() => {
    const element = contentRef.current
    if (!element || !mounted) {
      return
    }
    const measure = () => setHeight(element.scrollHeight)
    measure()
    if (typeof ResizeObserver === 'undefined') {
      return
    }
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [mounted, children])

  return (
    <motion.div
      id={id}
      className={`overflow-hidden ${className}`}
      initial={false}
      animate={{
        height: open ? height : 0,
        opacity: open ? 1 : 0.98
      }}
      transition={{
        duration: reduce ? MOTION_PRESETS.reduced : open ? MOTION_PRESETS.panel : MOTION_PRESETS.fast,
        ease: open ? EASING.out : EASING.sharp
      }}
      aria-hidden={!open}
    >
      <div ref={contentRef} className={contentClassName}>
        {mounted ? children : null}
      </div>
    </motion.div>
  )
}
