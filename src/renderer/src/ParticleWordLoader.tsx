import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

type Particle = {
  x: number
  y: number
  tx: number
  ty: number
  vx: number
  vy: number
  r: number
  glow: number
}

type PointerState = {
  x: number
  y: number
  active: boolean
}

type ParticleWordLoaderProps = {
  label?: string
}

type ParticleWordMarkProps = {
  word?: string
  ariaLabel?: string
  className?: string
  target?: string
  maxParticles?: number
  fontScale?: number
  minFontSize?: number
  maxFontSize?: number
  interactive?: boolean
  settledOnMount?: boolean
  maxDevicePixelRatio?: number
  softGlow?: boolean
}

type ParticleWordOptions = Required<Pick<ParticleWordMarkProps, 'word' | 'maxParticles' | 'fontScale' | 'minFontSize' | 'maxFontSize'>>
type ParticleTarget = { x: number; y: number }
type ParticleWordBounds = { left: number; top: number; width: number; height: number }

const DEFAULT_WORD = 'NexusDraft'
const DEFAULT_MAX_PARTICLES = 1600
const INTRO_TARGET = 'nexusdraft'
const INTRO_HOLD_MS = 5000
const INTRO_EXIT_MS = 520

export const ParticleIntroActiveContext = createContext(false)

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function makeWordTargets(width: number, height: number, options: ParticleWordOptions, bounds?: ParticleWordBounds): ParticleTarget[] {
  const scratch = document.createElement('canvas')
  scratch.width = Math.max(1, Math.floor(width))
  scratch.height = Math.max(1, Math.floor(height))
  const context = scratch.getContext('2d', { willReadFrequently: true })
  if (!context) {
    return []
  }

  const wordWidth = Math.max(1, bounds?.width ?? width)
  const centerX = (bounds?.left ?? 0) + wordWidth / 2
  const centerY = (bounds?.top ?? 0) + Math.max(1, bounds?.height ?? height) / 2
  let fontSize = clamp(wordWidth * options.fontScale, options.minFontSize, options.maxFontSize)
  context.clearRect(0, 0, scratch.width, scratch.height)
  context.fillStyle = '#ffffff'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.font = `900 ${fontSize}px Inter, "Segoe UI", system-ui, sans-serif`
  const maxTextWidth = wordWidth * 0.96
  const measuredWidth = context.measureText(options.word).width
  if (measuredWidth > maxTextWidth) {
    fontSize = clamp(fontSize * (maxTextWidth / measuredWidth), options.minFontSize, options.maxFontSize)
    context.font = `900 ${fontSize}px Inter, "Segoe UI", system-ui, sans-serif`
  }
  context.fillText(options.word, centerX, centerY)

  const step = clamp(Math.floor(wordWidth / 150), 4, 7)
  const image = context.getImageData(0, 0, scratch.width, scratch.height)
  const targets: ParticleTarget[] = []
  const scanLeft = bounds ? clamp(Math.floor(bounds.left), 0, scratch.width - 1) : 0
  const scanTop = bounds ? clamp(Math.floor(bounds.top), 0, scratch.height - 1) : 0
  const scanRight = bounds ? clamp(Math.ceil(bounds.left + bounds.width), scanLeft + 1, scratch.width) : scratch.width
  const scanBottom = bounds ? clamp(Math.ceil(bounds.top + bounds.height), scanTop + 1, scratch.height) : scratch.height
  for (let y = scanTop; y < scanBottom; y += step) {
    for (let x = scanLeft; x < scanRight; x += step) {
      const alpha = image.data[(y * scratch.width + x) * 4 + 3] ?? 0
      if (alpha > 80) {
        targets.push({ x, y })
      }
    }
  }

  const stride = Math.max(1, Math.ceil(targets.length / options.maxParticles))
  const sampled = targets.filter((_, index) => index % stride === 0)
  return sampled.length > 0 ? sampled : [{ x: centerX, y: centerY }]
}

function makeParticles(
  width: number,
  height: number,
  previous: Particle[],
  options: ParticleWordOptions,
  settledOnMount = false
): Particle[] {
  const targets = makeWordTargets(width, height, options)
  const centerX = width / 2
  const centerY = height / 2
  return targets
    .map((target, index) => {
      const old = previous[index]
      const angle = index * 2.3999632297
      const spread = 110 + (index % 17) * 5
      return {
        x: settledOnMount ? target.x : old?.x ?? centerX + Math.cos(angle) * spread,
        y: settledOnMount ? target.y : old?.y ?? centerY + Math.sin(angle) * spread * 0.35,
        tx: target.x,
        ty: target.y,
        vx: settledOnMount ? 0 : old?.vx ?? 0,
        vy: settledOnMount ? 0 : old?.vy ?? 0,
        r: 1.05 + (index % 4) * 0.16,
        glow: 0.55 + (index % 9) * 0.045
      }
    })
}

function ParticleWordCanvas({
  word = DEFAULT_WORD,
  ariaLabel = word,
  className = '',
  target,
  maxParticles = DEFAULT_MAX_PARTICLES,
  fontScale = 0.14,
  minFontSize = 48,
  maxFontSize = 150,
  interactive = true,
  settledOnMount = false,
  maxDevicePixelRatio = 2,
  softGlow = true
}: ParticleWordMarkProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const introActive = useContext(ParticleIntroActiveContext)
  const suspendedForIntro = introActive && target === INTRO_TARGET

  useEffect(() => {
    if (suspendedForIntro) {
      return
    }
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) {
      return
    }

    let raf = 0
    let width = 0
    let height = 0
    let particles: Particle[] = []
    let running = false
    const pointer: PointerState = { x: -9999, y: -9999, active: false }
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const options: ParticleWordOptions = { word, maxParticles, fontScale, minFontSize, maxFontSize }

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      width = Math.max(1, rect.width)
      height = Math.max(1, rect.height)
      const dpr = Math.min(window.devicePixelRatio || 1, maxDevicePixelRatio)
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      particles = makeParticles(width, height, particles, options, settledOnMount)
    }

    const start = () => {
      if (!running) {
        running = true
        raf = window.requestAnimationFrame(draw)
      }
    }

    const draw = () => {
      running = false
      context.clearRect(0, 0, width, height)
      context.globalCompositeOperation = softGlow ? 'lighter' : 'source-over'
      context.shadowColor = 'rgba(29, 212, 168, 0.34)'
      context.shadowBlur = softGlow ? 5 : 0
      let settled = !pointer.active
      for (const particle of particles) {
        if (!reduceMotion) {
          const toTargetX = particle.tx - particle.x
          const toTargetY = particle.ty - particle.y
          particle.vx += toTargetX * 0.04
          particle.vy += toTargetY * 0.04

          if (pointer.active) {
            const dx = particle.x - pointer.x
            const dy = particle.y - pointer.y
            const distanceSquared = dx * dx + dy * dy
            const radius = 118
            if (distanceSquared > 0.01 && distanceSquared < radius * radius) {
              const distance = Math.sqrt(distanceSquared)
              const push = (1 - distance / radius) * 7.8
              particle.vx += (dx / distance) * push
              particle.vy += (dy / distance) * push
            }
          }

          particle.vx *= 0.78
          particle.vy *= 0.78
          particle.x += particle.vx
          particle.y += particle.vy
          if (
            settled &&
            (Math.abs(toTargetX) > 0.7 ||
              Math.abs(toTargetY) > 0.7 ||
              Math.abs(particle.vx) > 0.035 ||
              Math.abs(particle.vy) > 0.035)
          ) {
            settled = false
          }
        } else {
          particle.x = particle.tx
          particle.y = particle.ty
        }

        context.beginPath()
        context.fillStyle =
          particle.glow > 0.8 ? 'rgba(232, 243, 238, 0.94)' : particle.glow > 0.67 ? 'rgba(61, 184, 160, 0.84)' : 'rgba(29, 212, 168, 0.78)'
        context.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2)
        context.fill()
      }
      context.globalCompositeOperation = 'source-over'
      context.shadowBlur = 0
      if (!reduceMotion && !settled) {
        start()
      }
    }

    const handlePointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      pointer.x = event.clientX - rect.left
      pointer.y = event.clientY - rect.top
      pointer.active = true
      start()
    }
    const handlePointerLeave = () => {
      pointer.active = false
      start()
    }

    resize()
    start()
    const observer = new ResizeObserver(() => {
      resize()
      if (reduceMotion) {
        draw()
      } else {
        start()
      }
    })
    observer.observe(canvas)
    if (interactive) {
      canvas.addEventListener('pointermove', handlePointerMove)
      canvas.addEventListener('pointerleave', handlePointerLeave)
    }

    return () => {
      window.cancelAnimationFrame(raf)
      running = false
      observer.disconnect()
      if (interactive) {
        canvas.removeEventListener('pointermove', handlePointerMove)
        canvas.removeEventListener('pointerleave', handlePointerLeave)
      }
    }
  }, [fontScale, interactive, maxDevicePixelRatio, maxFontSize, maxParticles, minFontSize, settledOnMount, softGlow, word, suspendedForIntro])

  return suspendedForIntro ? (
    <span className={`relative block overflow-hidden ${className}`} aria-label={ariaLabel} data-particle-word-target={target}>
      <span className="sr-only">{ariaLabel}</span>
    </span>
  ) : (
    <span className={`relative block overflow-hidden ${className}`} aria-label={ariaLabel} data-particle-word-target={target}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" aria-hidden />
      <span className="sr-only">{ariaLabel}</span>
    </span>
  )
}

export function ParticleWordMark(props: ParticleWordMarkProps) {
  return <ParticleWordCanvas {...props} />
}

function findIntroTargetBounds(): ParticleWordBounds | undefined {
  const target = document.querySelector<HTMLElement>(`[data-particle-word-target="${INTRO_TARGET}"]`)
  const rect = target?.getBoundingClientRect()
  if (!rect || rect.width < 16 || rect.height < 16) {
    return undefined
  }
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
}

export function ParticleWordIntroOverlay({ onDone }: { onDone: () => void }) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const wordRef = useRef<HTMLDivElement | null>(null)
  const onDoneRef = useRef(onDone)
  const exitingRef = useRef(false)
  const holdTimerRef = useRef<number | null>(null)
  const doneTimerRef = useRef<number | null>(null)
  const [exiting, setExiting] = useState(false)
  const [wordTransform, setWordTransform] = useState('translate3d(-50%, -50%, 0) scale(1)')

  useEffect(() => {
    onDoneRef.current = onDone
  }, [onDone])

  useEffect(() => {
    rootRef.current?.focus()
    return () => {
      if (holdTimerRef.current != null) {
        window.clearTimeout(holdTimerRef.current)
      }
      if (doneTimerRef.current != null) {
        window.clearTimeout(doneTimerRef.current)
      }
    }
  }, [])

  const enter = useCallback(() => {
    if (exitingRef.current) {
      return
    }
    if (holdTimerRef.current != null) {
      window.clearTimeout(holdTimerRef.current)
      holdTimerRef.current = null
    }
    const current = wordRef.current?.getBoundingClientRect()
    const target = findIntroTargetBounds()
    if (current && target) {
      const currentCenterX = current.left + current.width / 2
      const currentCenterY = current.top + current.height / 2
      const targetCenterX = target.left + target.width / 2
      const targetCenterY = target.top + target.height / 2
      const scale = clamp(Math.min(target.width / current.width, target.height / current.height), 0.44, 1.08)
      setWordTransform(
        `translate3d(-50%, -50%, 0) translate3d(${Math.round(targetCenterX - currentCenterX)}px, ${Math.round(
          targetCenterY - currentCenterY
        )}px, 0) scale(${scale.toFixed(3)})`
      )
    }
    exitingRef.current = true
    setExiting(true)
    doneTimerRef.current = window.setTimeout(() => {
      onDoneRef.current()
    }, INTRO_EXIT_MS)
  }, [])

  useEffect(() => {
    holdTimerRef.current = window.setTimeout(enter, INTRO_HOLD_MS)
    return () => {
      if (holdTimerRef.current != null) {
        window.clearTimeout(holdTimerRef.current)
        holdTimerRef.current = null
      }
    }
  }, [enter])

  return (
    <div
      ref={rootRef}
      className={[
        'fixed inset-0 z-[300] overflow-hidden bg-transparent text-nexus-text outline-none',
        exiting ? 'pointer-events-none' : ''
      ].join(' ')}
      role="status"
      aria-label="Loading NexusDraft"
    >
      <div className={['absolute inset-0 bg-[linear-gradient(180deg,#06100d_0%,#020706_100%)] transition-opacity duration-500', exiting ? 'opacity-0' : 'opacity-100'].join(' ')} aria-hidden />
      <div className={['nexus-noise absolute inset-0 transition-opacity duration-500', exiting ? 'opacity-0' : 'opacity-70'].join(' ')} aria-hidden />
      <div
        ref={wordRef}
        className="absolute left-1/2 top-[42%] h-[clamp(118px,18vw,208px)] w-[min(92vw,920px)] origin-center transform-gpu transition-transform duration-500 ease-[cubic-bezier(0.2,0.9,0.2,1)] will-change-transform"
        style={{ transform: wordTransform, contain: 'layout paint style' }}
      >
        <ParticleWordCanvas
          ariaLabel="NexusDraft"
          className="h-full w-full"
          maxParticles={560}
          fontScale={0.16}
          minFontSize={54}
          maxFontSize={170}
          interactive={false}
          settledOnMount
          maxDevicePixelRatio={1.2}
          softGlow={false}
        />
      </div>
      <div className={['pointer-events-none absolute inset-x-0 bottom-[18vh] flex justify-center px-6 transition-opacity duration-300', exiting ? 'opacity-0' : 'opacity-100'].join(' ')}>
        <p className="m-0 border border-nexus-line/70 bg-nexus-bg/55 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.24em] text-nexus-muted shadow-[0_0_28px_rgba(29,212,168,0.12)]">
          Loading NexusDraft
        </p>
      </div>
      <span className="sr-only">Loading NexusDraft</span>
    </div>
  )
}

export function ParticleWordLoader({ label = 'Loading' }: ParticleWordLoaderProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#06100d_0%,#020706_100%)] text-nexus-text">
      <div className="nexus-noise absolute inset-0 opacity-70" aria-hidden />
      <ParticleWordCanvas
        className="absolute left-1/2 top-[42%] h-[clamp(118px,18vw,208px)] w-[min(92vw,920px)] -translate-x-1/2 -translate-y-1/2"
        ariaLabel="NexusDraft"
        maxParticles={700}
        fontScale={0.16}
        minFontSize={54}
        maxFontSize={170}
        interactive={false}
        settledOnMount
        maxDevicePixelRatio={1.2}
        softGlow={false}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-[18vh] flex justify-center px-6">
        <p className="m-0 border border-nexus-line/70 bg-nexus-bg/55 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.24em] text-nexus-muted shadow-[0_0_28px_rgba(29,212,168,0.12)]">
          {label}
        </p>
      </div>
      <span className="sr-only">{label} NexusDraft</span>
    </div>
  )
}
