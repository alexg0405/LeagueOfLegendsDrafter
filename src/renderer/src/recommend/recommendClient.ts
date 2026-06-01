import {
  hydrateRustRecommendations,
  serializeRecommendInput,
  type PickSuggestion,
  type RustRecommendOutput,
  type SuggestPicksArgs
} from '../../../shared/draft'
import { invokeTauriCommand, isTauriBuild } from '../tauri/commands'

type RecommendResult = {
  suggestions: PickSuggestion[]
  patchLabel: string
}

type RecommendResponse = RecommendResult & {
  id: number
  ok: boolean
  source: 'rust'
  error?: string
}

type PendingRequest = {
  resolve: (result: RecommendResult) => void
  timer: ReturnType<typeof setTimeout>
}

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, PendingRequest>()

function emptyRecommendResult(): RecommendResult {
  return { suggestions: [], patchLabel: 'engine-v1' }
}

function createWorker(): Worker {
  worker ??= new Worker(new URL('../workers/recommend.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event: MessageEvent<RecommendResponse>) => {
    const response = event.data
    const request = pending.get(response.id)
    if (!request) {
      return
    }
    pending.delete(response.id)
    clearTimeout(request.timer)
    request.resolve({ suggestions: response.suggestions, patchLabel: response.patchLabel })
  }
  worker.onerror = () => {
    for (const [id, request] of Array.from(pending.entries())) {
      pending.delete(id)
      clearTimeout(request.timer)
      request.resolve(emptyRecommendResult())
    }
    worker?.terminate()
    worker = null
  }
  return worker
}

async function suggestPicksNative(args: SuggestPicksArgs): Promise<RecommendResult | null> {
  try {
    const raw = await invokeTauriCommand<string>('recommend_picks_native', {
      inputJson: JSON.stringify(serializeRecommendInput(args))
    })
    const parsed = JSON.parse(raw) as RustRecommendOutput
    if (!parsed.ok || !Array.isArray(parsed.rows)) {
      return null
    }
    return {
      suggestions: hydrateRustRecommendations(parsed.rows, args),
      patchLabel: parsed.patchLabel ?? 'engine-v1'
    }
  } catch {
    return null
  }
}

export async function suggestPicksAsync(args: SuggestPicksArgs): Promise<RecommendResult> {
  if (isTauriBuild()) {
    const native = await suggestPicksNative(args)
    if (native) {
      return native
    }
  }
  if (typeof Worker === 'undefined') {
    return Promise.resolve(emptyRecommendResult())
  }
  const id = nextId++
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      const request = pending.get(id)
      if (!request) {
        return
      }
      pending.delete(id)
      request.resolve(emptyRecommendResult())
    }, 8000)
    pending.set(id, { resolve, timer })
    try {
      createWorker().postMessage({ id, args })
    } catch {
      pending.delete(id)
      clearTimeout(timer)
      resolve(emptyRecommendResult())
    }
  })
}
