import { forwardRef, useCallback, useEffect, useRef, useState } from 'react'
import type { VisionFrameResult } from '@shared/vision/visionResult'
import { createVisionWorker, postImageDataToWorker } from './createVisionWorker'
import { getDesktopStream, stopDesktopStream } from './desktopStream'

const PREVIEW_MAX_W = 320
const DEFAULT_ANALYSIS_MS = 700
/** drawImage rate — interval-based avoids rAF + video decode glitches on some drivers. */
const PREVIEW_DRAW_MS = Math.round(1000 / 12)

type Props = {
  sourceId: string | null
  /** Off-thread vision analysis rate; optional. */
  onFrameStats?: (r: VisionFrameResult) => void
  /** How often to sample the canvas for the vision worker (ms). */
  visionSampleIntervalMs?: number
}

/** Live-capture preview (throttled draw) + Web Worker analysis. */
export const DesktopPreview = forwardRef<HTMLCanvasElement, Props>(function DesktopPreview(
  { sourceId, onFrameStats, visionSampleIntervalMs = DEFAULT_ANALYSIS_MS },
  ref
) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const busyRef = useRef(false)
  const onStatsRef = useRef(onFrameStats)

  const [err, setErr] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const streamRef = useRef<MediaStream | null>(null)
  const visionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const drawIntervalRef = useRef<number | null>(null)
  const onEndedRef = useRef<(() => void) | null>(null)

  const setCanvasRef = useCallback(
    (el: HTMLCanvasElement | null) => {
      canvasRef.current = el
      if (typeof ref === 'function') {
        ref(el)
      } else if (ref) {
        ref.current = el
      }
    },
    [ref]
  )

  useEffect(() => {
    onStatsRef.current = onFrameStats
  }, [onFrameStats])

  useEffect(() => {
    if (!sourceId) {
      setErr(null)
      setReady(false)
      return
    }
    setErr(null)
    setReady(false)
    const video = videoRef.current
    if (!video) {
      return
    }
    void (async () => {
      try {
        if (streamRef.current) {
          stopDesktopStream(streamRef.current)
        }
        const stream = await getDesktopStream(sourceId)
        streamRef.current = stream
        const track = stream.getVideoTracks()[0]
        if (track) {
          const onEnd = () => {
            setErr('Capture ended — the window or display may have closed. Refresh the source list and pick it again.')
            setReady(false)
          }
          onEndedRef.current = onEnd
          track.addEventListener('ended', onEnd)
        }
        video.srcObject = stream
        video.onloadedmetadata = () => {
          void video
            .play()
            .then(() => {
              setReady(true)
            })
            .catch((e) => {
              setErr(e instanceof Error ? e.message : String(e))
              setReady(false)
            })
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e))
        setReady(false)
      }
    })()

    return () => {
      if (streamRef.current) {
        const tr = streamRef.current.getVideoTracks()[0]
        if (tr && onEndedRef.current) {
          tr.removeEventListener('ended', onEndedRef.current)
        }
        onEndedRef.current = null
        stopDesktopStream(streamRef.current)
        streamRef.current = null
      }
      video.srcObject = null
      setReady(false)
    }
  }, [sourceId])

  useEffect(() => {
    if (!sourceId) {
      if (workerRef.current) {
        workerRef.current.terminate()
        workerRef.current = null
      }
    }
  }, [sourceId])

  /** Live video → canvas (fixed interval; kinder to fragile GPU capture paths than rAF) */
  useEffect(() => {
    if (!sourceId || !ready) {
      if (drawIntervalRef.current) {
        clearInterval(drawIntervalRef.current)
        drawIntervalRef.current = null
      }
      return
    }
    const lastSize = { dw: 0, dh: 0 }
    const tick = () => {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas) {
        return
      }
      const w = video.videoWidth
      const h = video.videoHeight
      if (w < 1 || h < 1) {
        return
      }
      const scale = Math.min(1, PREVIEW_MAX_W / w)
      const dw = Math.floor(w * scale)
      const dh = Math.floor(h * scale)
      if (lastSize.dw !== dw || lastSize.dh !== dh) {
        canvas.width = dw
        canvas.height = dh
        lastSize.dw = dw
        lastSize.dh = dh
      }
      const ctx = canvas.getContext('2d', { willReadFrequently: true } as never)
      if (ctx) {
        ctx.drawImage(video, 0, 0, dw, dh)
      }
    }
    const id = window.setInterval(tick, PREVIEW_DRAW_MS)
    drawIntervalRef.current = id
    return () => {
      clearInterval(id)
      drawIntervalRef.current = null
    }
  }, [sourceId, ready])

  /** Throttled vision worker sampling of the current canvas (same frame the user sees) */
  useEffect(() => {
    if (!sourceId) {
      if (visionIntervalRef.current) {
        clearInterval(visionIntervalRef.current)
        visionIntervalRef.current = null
      }
      return
    }
    if (!onFrameStats) {
      if (workerRef.current) {
        workerRef.current.terminate()
        workerRef.current = null
      }
    } else if (!workerRef.current) {
      workerRef.current = createVisionWorker()
    }

    const id = setInterval(() => {
      const canvas = canvasRef.current
      if (!canvas || !ready) {
        return
      }
      if (!onStatsRef.current) {
        return
      }
      if (!workerRef.current) {
        workerRef.current = createVisionWorker()
      }
      if (busyRef.current) {
        return
      }
      const w = canvas.width
      const h = canvas.height
      if (w < 1 || h < 1) {
        return
      }
      const ctx = canvas.getContext('2d', { willReadFrequently: true } as never)
      if (!ctx) {
        return
      }
      const imageData = ctx.getImageData(0, 0, w, h)
      const worker = workerRef.current
      busyRef.current = true
      void postImageDataToWorker(worker, imageData)
        .then((r) => {
          onStatsRef.current?.(r)
        })
        .catch(() => {
          /* terminated mid-flight */
        })
        .finally(() => {
          busyRef.current = false
        })
    }, visionSampleIntervalMs)
    visionIntervalRef.current = id
    return () => {
      clearInterval(id)
      visionIntervalRef.current = null
    }
  }, [onFrameStats, ready, sourceId, visionSampleIntervalMs])

  if (!sourceId) {
    return <p className="muted">Select a capture source to preview the stream.</p>
  }

  return (
    <div className="desktop-preview">
      {err && <p className="err">Stream: {err}</p>}
      <video
        ref={videoRef}
        className="preview-video"
        playsInline
        muted
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
        aria-hidden
      />
      <canvas
        ref={setCanvasRef}
        className="preview-canvas"
        width={PREVIEW_MAX_W}
        height={180}
        style={{ maxWidth: '100%', borderRadius: 6, background: '#000' }}
      />
      {!err && (
        <p className="muted small">
          {ready
            ? `Live preview (≤${PREVIEW_MAX_W}px) · draw ~${PREVIEW_DRAW_MS}ms · vision ${visionSampleIntervalMs}ms` +
              (onFrameStats ? ' (drops if busy)' : '')
            : 'Starting stream…'}
        </p>
      )}
    </div>
  )
})
