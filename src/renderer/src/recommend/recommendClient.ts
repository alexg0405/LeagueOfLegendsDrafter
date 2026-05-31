import { suggestPicks, type PickSuggestion, type SuggestPicksArgs } from '../../../shared/draft'

type RecommendResult = {
  suggestions: PickSuggestion[]
  patchLabel: string
}

type RecommendResponse = RecommendResult & {
  id: number
  ok: boolean
  source: 'rust' | 'typescript'
  error?: string
}

type PendingRequest = {
  resolve: (result: RecommendResult) => void
  args: SuggestPicksArgs
  timer: ReturnType<typeof setTimeout>
}

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, PendingRequest>()

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
      request.resolve(suggestPicks(request.args))
    }
    worker?.terminate()
    worker = null
  }
  return worker
}

export function suggestPicksAsync(args: SuggestPicksArgs): Promise<RecommendResult> {
  if (typeof Worker === 'undefined') {
    return Promise.resolve(suggestPicks(args))
  }
  const id = nextId++
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      const request = pending.get(id)
      if (!request) {
        return
      }
      pending.delete(id)
      request.resolve(suggestPicks(args))
    }, 8000)
    pending.set(id, { resolve, args, timer })
    try {
      createWorker().postMessage({ id, args })
    } catch {
      pending.delete(id)
      clearTimeout(timer)
      resolve(suggestPicks(args))
    }
  })
}
