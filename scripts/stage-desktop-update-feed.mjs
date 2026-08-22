import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const releaseDir = resolve(repoRoot, 'release')
const publicDownloadsDir = resolve(repoRoot, 'src/renderer/public/downloads')
const latestYmlPath = resolve(releaseDir, 'latest.yml')
const packageJsonPath = resolve(repoRoot, 'package.json')

function field(text, name) {
  const match = new RegExp(`^${name}:\\s*(.+)$`, 'm').exec(text)
  return match?.[1]?.trim().replace(/^['"]|['"]$/g, '') ?? null
}

function sourcePathFor(fileName) {
  const direct = resolve(releaseDir, fileName)
  if (existsSync(direct)) {
    return direct
  }
  const spaceVariant = resolve(releaseDir, fileName.replace(/^Nexus-Draft-/, 'Nexus Draft-'))
  if (existsSync(spaceVariant)) {
    return spaceVariant
  }
  return direct
}

const latestYml = await readFile(latestYmlPath, 'utf8')
const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'))
const updatePath = field(latestYml, 'path')
if (!updatePath) {
  throw new Error('release/latest.yml is missing a path field.')
}
const portablePath = `Nexus-Draft-Portable-${packageJson.version}.exe`

await mkdir(publicDownloadsDir, { recursive: true })
await copyFile(latestYmlPath, resolve(publicDownloadsDir, 'latest.yml'))
await copyFile(sourcePathFor(updatePath), resolve(publicDownloadsDir, basename(updatePath)))
if (existsSync(sourcePathFor(portablePath))) {
  await copyFile(sourcePathFor(portablePath), resolve(publicDownloadsDir, basename(portablePath)))
}

const blockmapName = `${updatePath}.blockmap`
const blockmapSource = sourcePathFor(blockmapName)
if (existsSync(blockmapSource)) {
  await copyFile(blockmapSource, resolve(publicDownloadsDir, basename(blockmapName)))
}

/*
 * Prune superseded builds. Without this every release left its installer behind — a stale
 * 3.11.0 setup (84 MB) was still being served next to a 4.3.0 portable, and it shipped in
 * every Vercel deploy.
 */
const keep = new Set([
  'latest.yml',
  '.gitkeep',
  'downloads.json',
  basename(updatePath),
  `${basename(updatePath)}.blockmap`,
  portablePath
])
const removed = []
for (const entry of await readdir(publicDownloadsDir)) {
  if (keep.has(entry)) {
    continue
  }
  if (!/^Nexus[- ]Draft-.*\.(exe|blockmap|yml|zip)$/i.test(entry)) {
    continue
  }
  await rm(resolve(publicDownloadsDir, entry), { force: true })
  removed.push(entry)
}

/*
 * Small manifest so the website can render real download links (and sizes) without a
 * hardcoded filename per release.
 */
const { statSync } = await import('node:fs')
const sizeOf = (name) => {
  const p = resolve(publicDownloadsDir, name)
  return existsSync(p) ? statSync(p).size : null
}
const manifest = {
  version: packageJson.version,
  releasedAt: field(latestYml, 'releaseDate') ?? new Date().toISOString(),
  installer: existsSync(resolve(publicDownloadsDir, basename(updatePath)))
    ? { file: basename(updatePath), bytes: sizeOf(basename(updatePath)) }
    : null,
  portable: existsSync(resolve(publicDownloadsDir, portablePath))
    ? { file: portablePath, bytes: sizeOf(portablePath) }
    : null
}
await writeFile(
  resolve(publicDownloadsDir, 'downloads.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8'
)

console.log(`Staged desktop update feed for ${updatePath} in src/renderer/public/downloads.`)
if (removed.length) {
  console.log(`Pruned superseded artifacts: ${removed.join(', ')}`)
}
