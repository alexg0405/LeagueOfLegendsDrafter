import { buildDraftItemMatrixPlans, type BuildDraftIntelArgs, type DraftMatchupPlan } from '../../../shared/draft'

type MatrixResponse = {
  id: number
  ok: boolean
  source: 'rust' | 'typescript'
  plans: DraftMatchupPlan[]
  error?: string
}

type PendingRequest = {
  resolve: (plans: DraftMatchupPlan[]) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, PendingRequest>()

function createWorker(): Worker {
  worker ??= new Worker(new URL('../workers/itemMatrix.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event: MessageEvent<MatrixResponse>) => {
    const response = event.data
    const request = pending.get(response.id)
    if (!request) {
      return
    }
    pending.delete(response.id)
    clearTimeout(request.timer)
    request.resolve(response.plans)
  }
  worker.onerror = (event) => {
    for (const [id, request] of Array.from(pending.entries())) {
      pending.delete(id)
      clearTimeout(request.timer)
      request.reject(new Error(event.message || 'item matrix worker failed'))
    }
    worker?.terminate()
    worker = null
  }
  return worker
}

export function buildDraftItemMatrixPlansAsync(args: BuildDraftIntelArgs): Promise<DraftMatchupPlan[]> {
  if (typeof Worker === 'undefined') {
    return Promise.resolve(buildDraftItemMatrixPlans(args))
  }
  const id = nextId++
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      const request = pending.get(id)
      if (!request) {
        return
      }
      pending.delete(id)
      request.resolve(buildDraftItemMatrixPlans(args))
    }, 8000)
    pending.set(id, {
      resolve,
      reject: () => resolve(buildDraftItemMatrixPlans(args)),
      timer
    })
    try {
      createWorker().postMessage({ id, args })
    } catch {
      pending.delete(id)
      clearTimeout(timer)
      resolve(buildDraftItemMatrixPlans(args))
    }
  })
}
