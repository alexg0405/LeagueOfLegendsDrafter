import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = new Set(process.argv.slice(2))
const countArgIndex = process.argv.findIndex((arg) => arg === '--count')
const dryRun = args.has('--dry-run')
const count =
  countArgIndex >= 0 && process.argv[countArgIndex + 1]
    ? Number.parseInt(process.argv[countArgIndex + 1], 10)
    : 1

if (!Number.isFinite(count) || count < 0) {
  throw new Error('Expected --count to be a non-negative integer.')
}

function readText(path) {
  return readFileSync(resolve(repoRoot, path), 'utf8')
}

function writeText(path, value) {
  if (!dryRun) {
    writeFileSync(resolve(repoRoot, path), value)
  }
}

function readJson(path) {
  return JSON.parse(readText(path))
}

function writeJson(path, value) {
  writeText(path, `${JSON.stringify(value, null, 2)}\n`)
}

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)(?:\.(\d+))?$/.exec(String(version).trim())
  if (!match) {
    throw new Error(`Unsupported version format: ${version}`)
  }
  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3] ?? '0', 10)
  }
}

function formatVersion(version) {
  return `${version.major}.${version.minor}.${version.patch}`
}

function formatShortVersion(version) {
  return `${version.major}.${version.minor}`
}

function bumpOnce(version) {
  if (version.minor >= 11) {
    return { major: version.major + 1, minor: 0, patch: 0 }
  }
  return { major: version.major, minor: version.minor + 1, patch: 0 }
}

function bumpVersion(version, steps) {
  let next = parseVersion(version)
  for (let i = 0; i < steps; i += 1) {
    next = bumpOnce(next)
  }
  return next
}

function replaceRequired(path, pattern, replacement) {
  const current = readText(path)
  const next = current.replace(pattern, replacement)
  if (current === next) {
    throw new Error(`No version match found in ${path}.`)
  }
  writeText(path, next)
}

const packageJson = readJson('package.json')
const previous = parseVersion(packageJson.version)
const next = bumpVersion(packageJson.version, count)
const nextVersion = formatVersion(next)
const nextShortVersion = formatShortVersion(next)

packageJson.version = nextVersion
writeJson('package.json', packageJson)

const packageLock = readJson('package-lock.json')
packageLock.version = nextVersion
if (packageLock.packages?.['']) {
  packageLock.packages[''].version = nextVersion
}
writeJson('package-lock.json', packageLock)

const tauriConfig = readJson('src-tauri/tauri.conf.json')
tauriConfig.version = nextVersion
writeJson('src-tauri/tauri.conf.json', tauriConfig)

replaceRequired('src-tauri/Cargo.toml', /^version = ".+"$/m, `version = "${nextVersion}"`)
replaceRequired(
  'Cargo.lock',
  /(\[\[package\]\]\r?\nname = "nexus-draft-tauri"\r?\nversion = ")([^"]+)(")/,
  `$1${nextVersion}$3`
)
replaceRequired(
  'src-tauri/src/lib.rs',
  /NexusDraft\/\d+\.\d+(?:\.\d+)? rust-desktop/g,
  `NexusDraft/${nextShortVersion} rust-desktop`
)
replaceRequired('src/renderer/src/MainShell.tsx', /build: '\d+\.\d+\.\d+'/g, `build: '${nextVersion}'`)
replaceRequired(
  'src/renderer/src/WebDraftApp.tsx',
  /Nexus-Draft-Portable-\d+\.\d+\.\d+\.exe/g,
  `Nexus-Draft-Portable-${nextVersion}.exe`
)
replaceRequired('src/renderer/src/WebDraftApp.tsx', /Web build v\d+\.\d+\.\d+/g, `Web build v${nextVersion}`)

console.log(`${formatVersion(previous)} -> ${nextVersion}${dryRun ? ' (dry run)' : ''}`)
