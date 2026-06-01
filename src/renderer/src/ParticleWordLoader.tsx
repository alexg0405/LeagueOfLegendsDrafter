import { useEffect, useRef } from 'react'

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

const WORD = 'NexusDraft'
const MAX_PARTICLES = 3200

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function makeParticles(width: number, height: number, previous: Particle[]): Particle[] {
  const scratch = document.createElement('canvas')
  scratch.width = Math.max(1, Math.floor(width))
  scratch.height = Math.max(1, Math.floor(height))
  const context = scratch.getContext('2d', { willReadFrequently: true })
  if (!context) {
    return []
  }

  const fontSize = clamp(width * 0.14, 48, 150)
  context.clearRect(0, 0, scratch.width, scratch.height)
  context.fillStyle = '#ffffff'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.font = `900 ${fontSize}px Inter, "Segoe UI", system-ui, sans-serif`
  context.fillText(WORD, width / 2, height / 2)

  const step = clamp(Math.floor(width / 150), 4, 7)
  const image = context.getImageData(0, 0, scratch.width, scratch.height)
  const targets: { x: number; y: number }[] = []
  for (let y = 0; y < scratch.height; y += step) {
    for (let x = 0; x < scratch.width; x += step) {
      const alpha = image.data[(y * scratch.width + x) * 4 + 3] ?? 0
      if (alpha > 80) {
        targets.push({ x, y })
      }
    }
  }

  const stride = Math.max(1, Math.ceil(targets.length / MAX_PARTICLES))
  const centerX = width / 2
  const centerY = height / 2
  return targets
    .filter((_, index) => index % stride === 0)
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

export function ParticleWordLoader({ label = 'Loading' }: ParticleWordLoaderProps) {
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

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      width = Math.max(1, rect.width)
      height = Math.max(1, rect.height)
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      particles = makeParticles(width, height, particles)
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
  }, [])

  return (
    <div className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#06100d_0%,#020706_100%)] text-nexus-text">
      <div className="nexus-noise absolute inset-0 opacity-70" aria-hidden />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" aria-hidden />
      <div className="pointer-events-none absolute inset-x-0 bottom-[18vh] flex justify-center px-6">
        <p className="m-0 border border-nexus-line/70 bg-nexus-bg/55 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.24em] text-nexus-muted shadow-[0_0_28px_rgba(29,212,168,0.12)]">
          {label}
        </p>
      </div>
      <span className="sr-only">{label} NexusDraft</span>
    </div>
  )
}
