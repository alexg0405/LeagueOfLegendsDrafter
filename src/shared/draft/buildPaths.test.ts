import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import seed from '../data/uggDefaultItemBuildsSeed.json'
import fullSeed from '../data/buildPathsSeed.json'
import {
  bestBuildRoleForChampion,
  buildRolesForChampion,
  bundledChampionByKeyOrName,
  getChampionBuildPath,
  runeInfo,
  summonerSpellInfo,
  type BuildPathCatalogItem
} from './buildPaths'
import {
  applyBuildSeed,
  buildSeedInfo,
  buildSeedRow,
  ensureBuildPathDetails,
  isNewerBuildSeed,
  normalizeBuildSeed,
  resetBuildSeedForTests,
  rustBuildSeed
} from './buildSeedStore'

afterEach(() => {
  resetBuildSeedForTests()
})

function liveSeed(overrides: Record<string, unknown>) {
  return { ...fullSeed, ...overrides }
}

describe('build seed store', () => {
  it('starts from the slim engine seed and lazy-loads the full paths', async () => {
    const info = buildSeedInfo()
    expect(info.rows).toBe(seed.builds.length)
    expect(info.source).toBe('bundled')
    expect(info.hasDetails).toBe(false)
    // The champion table ships in the slim seed so live games resolve ids offline.
    expect(bundledChampionByKeyOrName('MonkeyKing')?.id).toBe(62)
    expect(bundledChampionByKeyOrName('wukong')?.key).toBe('MonkeyKing')
    expect(buildSeedRow(103, 'middle')?.core?.length).toBe(3)
    expect(buildSeedRow(103, 'middle')?.runes).toBeUndefined()

    await ensureBuildPathDetails()
    expect(buildSeedInfo().hasDetails).toBe(true)
    expect(summonerSpellInfo(4)?.key).toBe('SummonerFlash')
    const ahri = buildSeedRow(103, 'middle')
    expect(ahri?.runes?.perks.length).toBeGreaterThanOrEqual(4)
    expect(runeInfo(ahri?.runes?.perks[0])?.name).toBeTruthy()
  })

  it('only downloads a published seed when it is newer', () => {
    const held = { statsPatch: '16.23', updatedAt: '2026-11-20' }
    expect(isNewerBuildSeed({ patch: '16.23', updatedAt: '2026-11-20' }, held)).toBe(false)
    expect(isNewerBuildSeed({ patch: '16.23', updatedAt: '2026-11-21' }, held)).toBe(true)
    expect(isNewerBuildSeed({ patch: '16.24', updatedAt: '2026-11-01' }, held)).toBe(true)
    expect(isNewerBuildSeed({ patch: '16.22', updatedAt: '2026-12-01' }, held)).toBe(false)
    expect(isNewerBuildSeed({}, held)).toBe(true)
  })

  it('rejects malformed rows instead of trusting the payload', () => {
    const parsed = normalizeBuildSeed({
      patch: '99.1.1',
      builds: [
        { championId: 'x', role: 'middle' },
        { championId: 1, role: 'mid' },
        { championId: 1, role: 'middle', sourceUrl: 'u', core: [1, 'two', -3, 4.5, 3118], skills: 'QWEZ', items4: [[3157, 55, 100], ['bad']] }
      ]
    })
    expect(parsed?.builds).toHaveLength(1)
    expect(parsed?.builds[0]?.core).toEqual([1, 3118])
    expect(parsed?.builds[0]?.skills).toBeUndefined()
    expect(parsed?.builds[0]?.items4).toEqual([[3157, 55, 100]])
  })

  it('applies a newer live seed and ignores older or thin ones', async () => {
    await ensureBuildPathDetails()
    expect(applyBuildSeed(liveSeed({ statsPatch: '1.1', patch: '1.1.1' })).applied).toBe(false)
    expect(applyBuildSeed({ patch: '99.1.1', builds: [] }).ok).toBe(false)
    const newer = applyBuildSeed(liveSeed({ statsPatch: '99.1', patch: '99.1.1' }), 'test')
    expect(newer.applied).toBe(true)
    expect(buildSeedInfo().statsPatch).toBe('99.1')
    expect(buildSeedInfo().source).toBe('test')
    // Same patch, same day: no churn.
    expect(applyBuildSeed(liveSeed({ statsPatch: '99.1', patch: '99.1.1' })).applied).toBe(false)
  })

  it('hands the Rust core only the legacy fields it deserializes', async () => {
    await ensureBuildPathDetails()
    const rust = rustBuildSeed()
    expect(rust.builds).toHaveLength(seed.builds.length)
    const row = rust.builds[0]!
    expect(Object.keys(row).sort()).toEqual(
      expect.arrayContaining(['boots', 'championId', 'core', 'final', 'role', 'sourceUrl', 'starting'])
    )
    expect(row).not.toHaveProperty('items4')
    expect(typeof row.sourceUrl).toBe('string')
  })
})

describe('champion build paths', () => {
  beforeEach(async () => {
    await ensureBuildPathDetails()
  })

  it('turns a seed row into a six-item path that starts with the core in buy order', () => {
    const path = getChampionBuildPath(103, 'middle')!
    const row = buildSeedRow(103, 'middle')!
    expect(path.core).toEqual(row.order)
    expect(path.fullBuild.slice(0, path.core.length)).toEqual(path.core)
    expect(path.fullBuild.length).toBeGreaterThanOrEqual(5)
    expect(path.fullBuild.length).toBeLessThanOrEqual(6)
    expect(new Set(path.fullBuild).size).toBe(path.fullBuild.length)
    expect(path.startSet.length).toBeGreaterThan(0)
    expect(path.skills?.priority).toHaveLength(3)
    expect(path.slots.length).toBeGreaterThan(0)
    for (const slot of path.slots) {
      expect(slot.options[0]!.matches).toBeGreaterThanOrEqual(slot.options[slot.options.length - 1]!.matches)
    }
  })

  it('folds tier-3 boot options into the boots slot instead of adding a seventh item', () => {
    applyBuildSeed(
      liveSeed({
        statsPatch: '99.2',
        patch: '99.2.1',
        builds: [
          ...fullSeed.builds.filter((r) => r.championId !== 1),
          {
            championId: 1,
            role: 'middle',
            sourceUrl: 'x',
            boots: [3020],
            order: [100, 3020, 101],
            items4: [[3175, 60, 900], [102, 55, 500]],
            items5: [[103, 50, 400]],
            items6: [[104, 50, 300]]
          }
        ]
      })
    )
    const catalog = new Map<number, BuildPathCatalogItem>([
      [3020, { id: 3020, name: "Sorcerer's Shoes", tags: ['Boots'], from: ['1001'], gold: { total: 1100 } }],
      [3175, { id: 3175, name: "Spellslinger's Shoes", tags: ['Boots'], from: ['3020'], gold: { total: 1100 } }]
    ])
    const path = getChampionBuildPath(1, 'middle', catalog)!
    expect(path.fullBuild).toEqual([100, 3175, 101, 103, 104])
  })

  it('opens the build in the role the champion is actually played', () => {
    const roles = buildRolesForChampion(103)
    expect(roles[0]!.role).toBe('middle')
    expect(bestBuildRoleForChampion(103, 'jungle')).toBe('middle')
    expect(bestBuildRoleForChampion(103, null)).toBe('middle')
    expect(bestBuildRoleForChampion(103, 'middle')).toBe('middle')
    expect(bestBuildRoleForChampion(-5, 'top')).toBeNull()
  })
})
