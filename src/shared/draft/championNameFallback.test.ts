import { describe, expect, it } from 'vitest'
import { resolveChampionName } from './championNameFallback'

describe('resolveChampionName', () => {
  it('uses bundled name when the live map is empty', () => {
    const empty = new Map<number, string>()
    expect(resolveChampionName(121, empty)).toBe("Kha'Zix")
  })
  it('prefers live Data Dragon name when present', () => {
    const m = new Map<number, string>([[121, 'Override']])
    expect(resolveChampionName(121, m)).toBe('Override')
  })
})
