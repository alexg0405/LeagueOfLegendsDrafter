import { useEffect, useRef, useState } from 'react'

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
}

type ParticleWordOptions = Required<Pick<ParticleWordMarkProps, 'word' | 'maxParticles' | 'fontScale' | 'minFontSize' | 'maxFontSize'>>
type ParticleTarget = { x: number; y: number }
type ParticleWordBounds = { left: number; top: number; width: number; height: number }

const DEFAULT_WORD = 'NexusDraft'
const DEFAULT_MAX_PARTICLES = 3200
const INTRO_TARGET = 'nexusdraft'

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

function makeParticles(width: number, height: number, previous: Particle[], options: ParticleWordOptions): Particle[] {
  const targets = makeWordTargets(width, height, options)
  const centerX = width / 2
  const centerY = height / 2
  return targets
    .map((target, index) => {
      const old = previous[index]
      const angle = index * 2.3999632297
      const spread = 110 + (index % 17) * 5
      return {
        x: old?.x ?? centerX + Math.cos(angle) * spread,
        y: old?.y ?? centerY + Math.sin(angle) * spread * 0.35,
        tx: target.x,
        ty: target.y,
        vx: old?.vx ?? 0,
        vy: old?.vy ?? 0,
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
  maxFontSize = 150
}: ParticleWordMarkProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) {
      return
    }

    let raf = 0
    let width = 0
    let height = 0
    let particles: Particle[] = []
    const pointer: PointerState = { x: -9999, y: -9999, active: false }
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const options: ParticleWordOptions = { word, maxParticles, fontScale, minFontSize, maxFontSize }

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      width = Math.max(1, rect.width)
      height = Math.max(1, rect.height)
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      particles = makeParticles(width, height, particles, options)
    }

    const draw = () => {
      context.clearRect(0, 0, width, height)
      context.globalCompositeOperation = 'lighter'
      context.shadowColor = 'rgba(29, 212, 168, 0.48)'
      context.shadowBlur = 8
      for (const particle of particles) {
        if (!reduceMotion) {
          const toTargetX = particle.tx - particle.x
          const toTargetY = particle.ty - particle.y
          particle.vx += toTargetX * 0.035
          particle.vy += toTargetY * 0.035

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
      if (!reduceMotion) {
        raf = window.requestAnimationFrame(draw)
      }
    }

    const handlePointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      pointer.x = event.clientX - rect.left
      pointer.y = event.clientY - rect.top
      pointer.active = true
    }
    const handlePointerLeave = () => {
      pointer.active = false
    }

    resize()
    draw()
    const observer = new ResizeObserver(() => {
      resize()
      if (reduceMotion) {
        draw()
      }
    })
    observer.observe(canvas)
    canvas.addEventListener('pointermove', handlePointerMove)
    canvas.addEventListener('pointerleave', handlePointerLeave)

    return () => {
      window.cancelAnimationFrame(raf)
      observer.disconnect()
      canvas.removeEventListener('pointermove', handlePointerMove)
      canvas.removeEventListener('pointerleave', handlePointerLeave)
    }
  }, [fontScale, maxFontSize, maxParticles, minFontSize, word])

  return (
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
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const onDoneRef = useRef(onDone)
  const exitingRef = useRef(false)
  const exitStartedRef = useRef(0)
  const completedRef = useRef(false)
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    onDoneRef.current = onDone
  }, [onDone])

  useEffect(() => {
    rootRef.current?.focus()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) {
      return
    }

    let raf = 0
    let width = 0
    let height = 0
    let particles: Particle[] = []
    let targetCenter = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    let retargeted = false
    const pointer: PointerState = { x: -9999, y: -9999, active: false }
    const options: ParticleWordOptions = {
      word: DEFAULT_WORD,
      maxParticles: 3400,
      fontScale: 0.16,
      minFontSize: 54,
      maxFontSize: 170
    }
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      width = Math.max(1, rect.width)
      height = Math.max(1, rect.height)
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (!exitingRef.current) {
        particles = makeParticles(width, height, particles, options)
      }
    }

    const retargetToHero = () => {
      const fallback = {
        left: width * 0.18,
        top: height * 0.14,
        width: width * 0.42,
        height: height * 0.18
      }
      const bounds = findIntroTargetBounds() ?? fallback
      targetCenter = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 }
      const targets = makeWordTargets(width, height, {
        ...options,
        fontScale: 0.2,
        maxFontSize: 160
      }, bounds)
      particles = particles.map((particle, index) => {
        const target = targets[index % targets.length]
        const angle = index * 0.21
        return {
          ...particle,
          tx: target.x,
          ty: target.y,
          vx: particle.vx + Math.cos(angle) * 2.1,
          vy: particle.vy + Math.sin(angle) * 2.1
        }
      })
    }

    const finish = () => {
      if (completedRef.current) {
        return
      }
      completedRef.current = true
      onDoneRef.current()
    }

    const draw = (time: number) => {
      const isExiting = exitingRef.current
      if (isExiting && !retargeted) {
        retargeted = true
        retargetToHero()
      }

      const progress = isExiting ? clamp((time - exitStartedRef.current) / 1450, 0, 1) : 0
      const particleAlpha = isExiting ? clamp(1 - Math.max(0, progress - 0.7) / 0.3, 0, 1) : 1

      context.clearRect(0, 0, width, height)
      context.globalCompositeOperation = 'lighter'
      context.shadowColor = `rgba(29, 212, 168, ${0.46 * particleAlpha})`
      context.shadowBlur = 9
      for (const particle of particles) {
        if (!reduceMotion) {
          const toTargetX = particle.tx - particle.x
          const toTargetY = particle.ty - particle.y
          const spring = isExiting ? 0.062 : 0.034
          particle.vx += toTargetX * spring
          particle.vy += toTargetY * spring

          if (isExiting) {
            const dx = particle.x - targetCenter.x
            const dy = particle.y - targetCenter.y
            const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy))
            const swirl = (1 - progress) * 1.45
            particle.vx += (-dy / distance) * swirl
            particle.vy += (dx / distance) * swirl
          } else if (pointer.active) {
            const dx = particle.x - pointer.x
            const dy = particle.y - pointer.y
            const distanceSquared = dx * dx + dy * dy
            const radius = 132
            if (distanceSquared > 0.01 && distanceSquared < radius * radius) {
              const distance = Math.sqrt(distanceSquared)
              const push = (1 - distance / radius) * 7.6
              particle.vx += (dx / distance) * push
              particle.vy += (dy / distance) * push
            }
          }

          particle.vx *= isExiting ? 0.82 : 0.78
          particle.vy *= isExiting ? 0.82 : 0.78
          particle.x += particle.vx
          particle.y += particle.vy
        } else {
          particle.x = particle.tx
          particle.y = particle.ty
        }

        context.beginPath()
        const alpha = particleAlpha * (particle.glow > 0.8 ? 0.94 : particle.glow > 0.67 ? 0.84 : 0.78)
        context.fillStyle =
          particle.glow > 0.8 ? `rgba(232, 243, 238, ${alpha})` : particle.glow > 0.67 ? `rgba(61, 184, 160, ${alpha})` : `rgba(29, 212, 168, ${alpha})`
        context.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2)
        context.fill()
      }
      context.globalCompositeOperation = 'source-over'
      context.shadowBlur = 0

      if (isExiting && (progress >= 1 || reduceMotion)) {
        finish()
        return
      }
      raf = window.requestAnimationFrame(draw)
    }

    const handlePointerMove = (event: PointerEvent) => {
      pointer.x = event.clientX
      pointer.y = event.clientY
      pointer.active = true
    }
    const handlePointerLeave = () => {
      pointer.active = false
    }

    resize()
    raf = window.requestAnimationFrame(draw)
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    window.addEventListener('resize', resize)
    canvas.addEventListener('pointermove', handlePointerMove)
    canvas.addEventListener('pointerleave', handlePointerLeave)

    return () => {
      window.cancelAnimationFrame(raf)
      observer.disconnect()
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('pointermove', handlePointerMove)
      canvas.removeEventListener('pointerleave', handlePointerLeave)
    }
  }, [])

  const enter = () => {
    if (exitingRef.current) {
      return
    }
    exitingRef.current = true
    exitStartedRef.current = performance.now()
    setExiting(true)
  }

  return (
    <div
      ref={rootRef}
      className={[
        'fixed inset-0 z-[300] overflow-hidden bg-transparent text-nexus-text outline-none',
        exiting ? 'pointer-events-none' : 'cursor-pointer'
      ].join(' ')}
      role="button"
      tabIndex={0}
      aria-label="Enter NexusDraft"
      onPointerDown={enter}
      onClick={enter}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          enter()
        }
      }}
    >
      <div className={['absolute inset-0 bg-[linear-gradient(180deg,#06100d_0%,#020706_100%)] transition-opacity duration-700', exiting ? 'opacity-0' : 'opacity-100'].join(' ')} aria-hidden />
      <div className={['nexus-noise absolute inset-0 transition-opacity duration-700', exiting ? 'opacity-0' : 'opacity-70'].join(' ')} aria-hidden />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" aria-hidden />
      <div className={['pointer-events-none absolute inset-x-0 bottom-[18vh] flex justify-center px-6 transition-opacity duration-300', exiting ? 'opacity-0' : 'opacity-100'].join(' ')}>
        <p className="m-0 border border-nexus-line/70 bg-nexus-bg/55 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.24em] text-nexus-muted shadow-[0_0_28px_rgba(29,212,168,0.12)]">
          Click to enter
        </p>
      </div>
      <span className="sr-only">Click to enter NexusDraft</span>
    </div>
  )
}

export function ParticleWordLoader({ label = 'Loading' }: ParticleWordLoaderProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#06100d_0%,#020706_100%)] text-nexus-text">
      <div className="nexus-noise absolute inset-0 opacity-70" aria-hidden />
      <ParticleWordCanvas className="absolute inset-0 h-full w-full" ariaLabel="NexusDraft" />
      <div className="pointer-events-none absolute inset-x-0 bottom-[18vh] flex justify-center px-6">
        <p className="m-0 border border-nexus-line/70 bg-nexus-bg/55 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.24em] text-nexus-muted shadow-[0_0_28px_rgba(29,212,168,0.12)]">
          {label}
        </p>
      </div>
      <span className="sr-only">{label} NexusDraft</span>
    </div>
  )
}
