import type { VisionFrameResult } from '@shared/vision/visionResult'

export function createVisionWorker(): Worker {
  return new Worker(new URL('../workers/visionFrame.worker.ts', import.meta.url), { type: 'module' })
}

/**
 * Transfers the ImageData pixel buffer to the worker (no copy on main thread).
 * Do not use `imageData` after this call.
 */
export function postImageDataToWorker(
  worker: Worker,
  imageData: ImageData
): Promise<VisionFrameResult> {
  return new Promise((resolve, reject) => {
    const w = imageData.width
    const h = imageData.height
    const buffer = imageData.data.buffer
    const onMsg = (e: MessageEvent<VisionFrameResult>) => {
      worker.removeEventListener('message', onMsg)
      worker.removeEventListener('messageerror', onErr)
      resolve(e.data)
    }
    const onErr = () => {
      worker.removeEventListener('message', onMsg)
      worker.removeEventListener('messageerror', onErr)
      reject(new Error('vision worker failed'))
    }
    worker.addEventListener('message', onMsg, { once: true })
    worker.addEventListener('messageerror', onErr, { once: true })
    worker.postMessage({ w, h, buffer }, [buffer])
  })
}
