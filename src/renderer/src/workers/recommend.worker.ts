import {
  canUseRustRecommendations,
  hydrateRustRecommendations,
  serializeRecommendInput,
  type PickSuggestion,
  type RustRecommendOutput,
  type SuggestPicksArgs
} from '../../../shared/draft'

type RecommendRequest = {
  id: number
  args: SuggestPicksArgs
}

type RecommendResponse = {
  id: number
  ok: boolean
  source: 'rust'
  suggestions: PickSuggestion[]
  patchLabel: string
  error?: string
}

let wasmModulePromise: Promise<typeof import('../wasm/nexus-draft-core/nexus_draft_core.js')> | null = null

async function loadWasm() {
  wasmModulePromise ??= import('../wasm/nexus-draft-core/nexus_draft_core.js').then(async (mod) => {
    await mod.default()
    return mod
  })
  return wasmModulePromise
}

function fallbackResponse(id: number, error?: unknown): RecommendResponse {
  return {
    id,
    ok: false,
    source: 'rust',
    suggestions: [],
    patchLabel: 'engine-v1',
    error: error == null ? undefined : error instanceof Error ? error.message : String(error)
  }
}

self.onmessage = (event: MessageEvent<RecommendRequest>) => {
  const { id, args } = event.data
  void (async () => {
    try {
      const eligibility = canUseRustRecommendations(args)
      if (!eligibility.ok) {
        ;(self as unknown as { postMessage: (message: RecommendResponse) => void }).postMessage(
          fallbackResponse(id, eligibility.reason)
        )
        return
      }
      const wasm = await loadWasm()
      const raw = wasm.recommend_picks_json(JSON.stringify(serializeRecommendInput(args)))
      const parsed = JSON.parse(raw) as RustRecommendOutput
      if (!parsed.ok || !Array.isArray(parsed.rows)) {
        throw new Error(parsed.unsupportedReason ?? parsed.error ?? 'Rust recommend output was not usable')
      }
      const response: RecommendResponse = {
        id,
        ok: true,
        source: 'rust',
        suggestions: hydrateRustRecommendations(parsed.rows, args),
        patchLabel: parsed.patchLabel ?? 'engine-v1'
      }
      ;(self as unknown as { postMessage: (message: RecommendResponse) => void }).postMessage(response)
    } catch (error) {
      ;(self as unknown as { postMessage: (message: RecommendResponse) => void }).postMessage(
        fallbackResponse(id, error)
      )
    }
  })()
}

export {}
