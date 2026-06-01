import {
  hydrateRustDraftIntel,
  serializeDraftIntelInput,
  type BuildDraftIntelArgs,
  type DraftIntel
} from '@shared/draft'
import { invokeTauriCommand, isTauriBuild } from '../tauri/commands'

let wasmModulePromise: Promise<typeof import('../wasm/nexus-draft-core/nexus_draft_core.js')> | null = null

async function loadWasm() {
  wasmModulePromise ??= import('../wasm/nexus-draft-core/nexus_draft_core.js').then(async (mod) => {
    await mod.default()
    return mod
  })
  return wasmModulePromise
}

export async function buildDraftIntelAsync(args: BuildDraftIntelArgs): Promise<DraftIntel | null> {
  if (isTauriBuild()) {
    try {
      const raw = await invokeTauriCommand<string>('build_draft_intel_native', {
        inputJson: JSON.stringify(serializeDraftIntelInput(args))
      })
      return hydrateRustDraftIntel(JSON.parse(raw) as unknown)
    } catch {
      /* fall through to the WASM path */
    }
  }
  try {
    const wasm = await loadWasm()
    const raw = wasm.build_draft_intel_json(JSON.stringify(serializeDraftIntelInput(args)))
    return hydrateRustDraftIntel(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}
