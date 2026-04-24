/**
 * Disk loader for the trained-effects bundle exported by `npm run train:export`.
 *
 * The JSON ships in source under `training/runtime/effects_id.json`. In dev we read the
 * live repo path. In production (asar), the bundle may be missing (the file is git-ignored
 * to keep personal comfort data local); callers treat that as "no trained effects" and
 * the UI cleanly falls back to bundled heuristics.
 */

import { existsSync, readFileSync, watch, type FSWatcher } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export type TrainedEffectsLoad =
  | { ok: true; path: string; raw: unknown }
  | { ok: false; path: string; error: string }

const _dirname = dirname(fileURLToPath(import.meta.url))

/** Candidate paths, in priority order. Env override wins for manual testing. */
function candidatePaths(): string[] {
  const envPath = process.env['LEAGUE_DRAFTER_TRAINED_EFFECTS']
  const list: string[] = []
  if (envPath && envPath.trim()) {
    list.push(resolve(envPath.trim()))
  }
  /** `out/main/index.js` in built output; walk up to the repo root where `training/` lives. */
  list.push(resolve(_dirname, '../../training/runtime/effects_id.json'))
  list.push(resolve(process.cwd(), 'training/runtime/effects_id.json'))
  /** If bundled with the app via `extraResources` (not default in this repo, but harmless). */
  if (process.resourcesPath) {
    list.push(join(process.resourcesPath, 'training/runtime/effects_id.json'))
  }
  return Array.from(new Set(list))
}

export function locateTrainedEffects(): string | null {
  for (const p of candidatePaths()) {
    if (existsSync(p)) {
      return p
    }
  }
  return null
}

export function loadTrainedEffectsFromDisk(): TrainedEffectsLoad {
  const p = locateTrainedEffects()
  if (!p) {
    return {
      ok: false,
      path: candidatePaths()[0] ?? 'training/runtime/effects_id.json',
      error:
        'effects_id.json not found — run: npm run riot:collect && npm run riot:extract && npm run etl:ingest-riot && npm run etl:aggregate && npm run train:export'
    }
  }
  try {
    const txt = readFileSync(p, 'utf8')
    const raw = JSON.parse(txt)
    return { ok: true, path: p, raw }
  } catch (e) {
    return { ok: false, path: p, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Watch the effects file and invoke `onChange` when it is updated. The watcher is intentionally
 * lenient (debounced via a small timer) — writes during `train:export` are multi-chunk on Windows.
 */
export function watchTrainedEffects(onChange: (load: TrainedEffectsLoad) => void): () => void {
  const p = locateTrainedEffects()
  if (!p) {
    return () => {
      /* nothing to unwatch */
    }
  }
  let watcher: FSWatcher | null = null
  let timer: NodeJS.Timeout | null = null
  try {
    watcher = watch(p, { persistent: false }, () => {
      if (timer) {
        clearTimeout(timer)
      }
      timer = setTimeout(() => {
        onChange(loadTrainedEffectsFromDisk())
      }, 250)
    })
  } catch {
    /** Some filesystems (shared drives, symlinked locations) do not support fs.watch; ignore silently. */
    return () => {
      /* nothing to unwatch */
    }
  }
  return () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (watcher) {
      try {
        watcher.close()
      } catch {
        /* ignore */
      }
      watcher = null
    }
  }
}
