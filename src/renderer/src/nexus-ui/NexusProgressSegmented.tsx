import { motion } from 'framer-motion'
import { EASING, useNexusMotion } from './nexusMotion'

type Props = {
  value: number
  segments?: number
  label?: string
  sub?: string
  accent?: 'lime' | 'blue' | 'red'
}

export function NexusProgressSegmented({
  value,
  segments = 12,
  label,
  sub,
  accent = 'lime'
}: Props) {
  const { reduce } = useNexusMotion()
  const v = Math.max(0, Math.min(1, value))
  const filled = Math.round(v * segments)
  const ac =
    accent === 'blue' ? 'bg-nexus-blue' : accent === 'red' ? 'bg-nexus-red' : 'bg-nexus-lime'
  return (
    <div className="w-full">
      {(label || sub) && (
        <div className="flex justify-between items-baseline gap-2 mb-2">
          {label && <span className="font-mono text-xs text-nexus-muted tracking-wider uppercase">{label}</span>}
          {sub && <span className="font-mono text-sm text-nexus-text/80 tabular-nums">{sub}</span>}
        </div>
      )}
      <div className="flex gap-px" role="progressbar" aria-valuenow={Math.round(v * 100)} aria-valuemin={0} aria-valuemax={100}>
        {Array.from({ length: segments }).map((_, i) => {
          const isOn = i < filled
          return (
            <motion.div
              key={i}
              className={`h-2 flex-1 min-w-0 ${
                isOn ? ac : 'bg-nexus-surface-2'
              } border border-nexus-line/60 origin-bottom`}
              initial={reduce ? false : { scaleY: 0.45, opacity: 0.35 }}
              animate={{
                scaleY: 1,
                opacity: isOn ? 1 : 0.4
              }}
              transition={{
                delay: reduce ? 0 : i * 0.03,
                duration: 0.11,
                ease: EASING.sharp
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
