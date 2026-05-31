import {
  buildDraftItemMatrixPlans,
  serializeItemMatrixInput,
  type BuildDraftIntelArgs,
  type DraftMatchupPlan
} from '../../../shared/draft'

type MatrixRequest = {
  id: number
  args: BuildDraftIntelArgs
}

type MatrixResponse = {
  id: number
  ok: boolean
  source: 'rust' | 'typescript'
  plans: DraftMatchupPlan[]
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

function fallbackPlans(args: BuildDraftIntelArgs): DraftMatchupPlan[] {
  return buildDraftItemMatrixPlans(args)
}

self.onmessage = (event: MessageEvent<MatrixRequest>) => {
  const { id, args } = event.data
  void (async () => {
    try {
      const wasm = await loadWasm()
      const input = serializeItemMatrixInput(args)
      const raw = wasm.build_item_matrix_plans_json(JSON.stringify(input))
      const parsed = JSON.parse(raw) as unknown
      if (!Array.isArray(parsed)) {
        throw new Error(typeof parsed === 'object' && parsed != null && 'error' in parsed ? String((parsed as { error: unknown }).error) : 'Rust matrix output was not an array')
      }
      const response: MatrixResponse = { id, ok: true, source: 'rust', plans: parsed as DraftMatchupPlan[] }
      ;(self as unknown as { postMessage: (message: MatrixResponse) => void }).postMessage(response)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const response: MatrixResponse = {
        id,
        ok: false,
        source: 'typescript',
        plans: fallbackPlans(args),
        error: message
      }
      ;(self as unknown as { postMessage: (message: MatrixResponse) => void }).postMessage(response)
    }
  })()
}

export {}

