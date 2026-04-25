import { describe, expect, it } from 'vitest'
import championSearchIndex from '../data/championSearchIndex.json'
import { resolveChampionName } from './championNameFallback'

describe('resolveChampionName', () => {
  it('uses bundled name when the live map is empty', () => {
    const empty = new Map<number, string>()
    expect(resolveChampionName(121, empty)).toBe("Kha'Zix")
    expect(resolveChampionName(54, empty)).toBe('Malphite')
    expect(resolveChampionName(246, empty)).toBe('Qiyana')
    expect(resolveChampionName(31, empty)).toBe("Cho'Gath")
    expect(resolveChampionName(904, empty)).toBe('Zaahen')
    expect(resolveChampionName(106, empty)).toBe('Volibear')
  })
  it('prefers live Data Dragon name when present', () => {
    const m = new Map<number, string>([[121, 'Override']])
    expect(resolveChampionName(121, m)).toBe('Override')
  })

  it('resolves every champion in the bundled champion index', () => {
    const empty = new Map<number, string>()
    for (const champion of championSearchIndex.champions) {
      expect(resolveChampionName(champion.id, empty)).toBe(champion.name)
      expect(resolveChampionName(champion.id, empty)).not.toBe(`Champion ${champion.id}`)
    }
  })
})
