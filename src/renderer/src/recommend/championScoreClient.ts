import {
  serializeChampionScoreInput,
  type RustChampionScore,
  type RustChampionScoreOutput,
  type SuggestPicksArgs
} from '../../../shared/draft'
let wasmModulePromise: Promise<typeof import('../wasm/nexus-draft-core/nexus_draft_core.js')> | null = null

async function loadWasm() {
  wasmModulePromise ??= import('../wasm/nexus-draft-core/nexus_draft_core.js').then(async (mod) => {
    await mod.default()
    return mod
  })
  return wasmModulePromise
}

export async function scoreChampionAsync(args: SuggestPicksArgs, championId: number): Promise<RustChampionScore | null> {
  try {
    const wasm = await loadWasm()
    const raw = wasm.score_champion_json(JSON.stringify(serializeChampionScoreInput(args, championId)))
    const parsed = JSON.parse(raw) as RustChampionScoreOutput
    return parsed.ok ? parsed.score ?? null : null
  } catch {
    return null
  }
}
