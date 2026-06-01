import {
  serializeItemMatrixInput,
  type BuildDraftIntelArgs,
  type DraftMatchupPlan
} from '../../../shared/draft'
import { invokeTauriCommand, isTauriBuild } from '../tauri/commands'

export type ItemMatrixResult = {
  plans: DraftMatchupPlan[]
  status: 'ready' | 'error'
  error?: string
}

export type ItemMatrixRequestOptions = {
  focusChampionId?: number | null
  limit?: number
}

type MatrixResponse = {
  id: number
  ok: boolean
  source: 'rust'
  plans: DraftMatchupPlan[]
  error?: string
}

type PendingRequest = {
  resolve: (result: ItemMatrixResult) => void
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
    request.resolve(
      response.ok
        ? { plans: response.plans, status: 'ready' }
        : { plans: [], status: 'error', error: response.error ?? 'Item matrix worker failed.' }
    )
  }
  worker.onerror = (event) => {
    for (const [id, request] of Array.from(pending.entries())) {
      pending.delete(id)
      clearTimeout(request.timer)
      request.resolve({ plans: [], status: 'error', error: event.message || 'Item matrix worker failed.' })
    }
    worker?.terminate()
    worker = null
  }
  return worker
}

export function buildDraftItemMatrixPlansAsync(
  args: BuildDraftIntelArgs,
  options?: ItemMatrixRequestOptions
): Promise<ItemMatrixResult> {
  if (isTauriBuild()) {
    return invokeTauriCommand<string>('build_item_matrix_plans_native', {
      inputJson: JSON.stringify(serializeItemMatrixInput(args, options))
    })
      .then((raw) => {
        const parsed = JSON.parse(raw) as unknown
        if (!Array.isArray(parsed)) {
          return { plans: [], status: 'error' as const, error: 'Rust item matrix returned invalid data.' }
        }
        return { plans: parsed as DraftMatchupPlan[], status: 'ready' as const }
      })
      .catch((error) => ({
        plans: [],
        status: 'error' as const,
        error: error instanceof Error ? error.message : String(error)
      }))
  }
  if (typeof Worker === 'undefined') {
    return Promise.resolve({ plans: [], status: 'error', error: 'Browser workers are unavailable.' })
  }
  const id = nextId++
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      const request = pending.get(id)
      if (!request) {
        return
      }
      pending.delete(id)
      request.resolve({ plans: [], status: 'error', error: 'Preparing item matrix timed out.' })
    }, 8000)
    pending.set(id, {
      resolve,
      timer
    })
    try {
      createWorker().postMessage({ id, args, options })
    } catch {
      pending.delete(id)
      clearTimeout(timer)
      resolve({ plans: [], status: 'error', error: 'Could not start item matrix worker.' })
    }
  })
}
