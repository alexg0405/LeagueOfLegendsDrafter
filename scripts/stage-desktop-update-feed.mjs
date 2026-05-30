import { copyFile, mkdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const releaseDir = resolve(repoRoot, 'release')
const publicDownloadsDir = resolve(repoRoot, 'src/renderer/public/downloads')
const latestYmlPath = resolve(releaseDir, 'latest.yml')

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
const updatePath = field(latestYml, 'path')
if (!updatePath) {
  throw new Error('release/latest.yml is missing a path field.')
}

await mkdir(publicDownloadsDir, { recursive: true })
await copyFile(latestYmlPath, resolve(publicDownloadsDir, 'latest.yml'))
await copyFile(sourcePathFor(updatePath), resolve(publicDownloadsDir, basename(updatePath)))

const blockmapName = `${updatePath}.blockmap`
const blockmapSource = sourcePathFor(blockmapName)
if (existsSync(blockmapSource)) {
  await copyFile(blockmapSource, resolve(publicDownloadsDir, basename(blockmapName)))
}

console.log(`Staged desktop update feed for ${updatePath} in src/renderer/public/downloads.`)
