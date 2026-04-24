/**
 * Off-main-thread vision stub: cheap per-pixel stats on a downscaled RGBA buffer.
 * Heavy template/OCR can move here later; drop frames in the main thread if busy.
 */
import type { VisionFrameResult } from '../../../shared/vision/visionResult'

self.onmessage = (ev: MessageEvent<{ w: number; h: number; buffer: ArrayBuffer }>) => {
  const t0 = performance.now()
  const { w, h, buffer } = ev.data
  const d = new Uint8ClampedArray(buffer)
  const len = w * h
  if (d.length < len * 4) {
    return
  }
  let sumL = 0
  for (let i = 0; i < len; i++) {
    const o = i * 4
    const r = d[o]!
    const g = d[o + 1]!
    const b = d[o + 2]!
    sumL += 0.299 * r + 0.587 * g + 0.114 * b
  }
  const meanLuma = sumL / len
  // Sobel-like magnitude sample (4-neighbor) on a stride to stay cheap
  let mag = 0
  const stride = Math.max(2, Math.floor(Math.min(w, h) / 64))
  for (let y = stride; y < h - stride; y += stride) {
    for (let x = stride; x < w - stride; x += stride) {
      const g = (xx: number, yy: number) => {
        const o = (yy * w + xx) * 4
        return 0.299 * d[o]! + 0.587 * d[o + 1]! + 0.114 * d[o + 2]!
      }
      const gx = g(x + 1, y) - g(x - 1, y)
      const gy = g(x, y + 1) - g(x, y - 1)
      mag += Math.sqrt(gx * gx + gy * gy)
    }
  }
  const cells = Math.ceil((h - 2 * stride) / stride) * Math.ceil((w - 2 * stride) / stride)
  const edgeDensity = cells > 0 ? mag / (cells * 255) : 0
  const res: VisionFrameResult = {
    width: w,
    height: h,
    meanLuma,
    edgeDensity: Math.min(1, edgeDensity * 2),
    ms: performance.now() - t0
  }
  ;(self as unknown as { postMessage: (m: unknown) => void }).postMessage(res)
}

export {}
