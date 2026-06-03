import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app } from 'electron'

/**
 * Load project `.env` into `process.env`.
 * - Strips UTF-8 BOM (common when saving in Notepad) — otherwise keys never match.
 * - Supports `export KEY=...` used by some tools.
 * - **Non-empty** values win: empty `KEY=` lines do not clobber, so a later file can fill a key.
 */
function parseAndApplyEnvFile(content: string) {
  const raw = content.replace(/^\uFEFF/, '')
  for (const line of raw.split(/\r?\n/)) {
    let t = line.trim()
    if (!t || t.startsWith('#')) {
      continue
    }
    if (t.toLowerCase().startsWith('export ')) {
      t = t.slice(7).trim()
    }
    const eq = t.indexOf('=')
    if (eq < 1) {
      continue
    }
    const key = t.slice(0, eq).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue
    }
    let v = t.slice(eq + 1).trim()
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1)
    }
    if (v === '') {
      continue
    }
    process.env[key] = v
  }
}

function tryRead(filePath: string) {
  if (!existsSync(filePath)) {
    return
  }
  let content: string
  try {
    content = readFileSync(filePath, 'utf8')
  } catch {
    return
  }
  parseAndApplyEnvFile(content)
}

export function loadLocalEnv() {
  const fromCwd = join(process.cwd(), '.env')
  const fromMainDir = join(dirname(fileURLToPath(import.meta.url)), '../../.env')
  const paths: string[] = [fromCwd, fromMainDir]
  try {
    if (typeof app?.getPath === 'function' && app.isPackaged) {
      /** .env in the same folder as the .exe (installed build) */
      paths.push(join(dirname(app.getPath('exe')), '.env'))
    }
  } catch {
    /* ignore */
  }
  for (const p of paths) {
    tryRead(p)
  }
}

/**
 * After `app` is ready — extra paths and second pass so we pick up .env that depends on getPath.
 */
export function loadLocalEnvWhenReady() {
  const more: string[] = []
  try {
    if (typeof app.getPath === 'function') {
      more.push(join(dirname(app.getPath('exe')), '.env'))
      more.push(join(process.cwd(), '.env'))
      more.push(join(dirname(fileURLToPath(import.meta.url)), '../../.env'))
    }
  } catch {
    return
  }
  for (const p of more) {
    tryRead(p)
  }
}
