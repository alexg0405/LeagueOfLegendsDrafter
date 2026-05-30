import { describe, expect, it } from 'vitest'
import publicSynergyStatsSeed from '../data/publicSynergyStatsSeed.json'
import { ALLY_SYNERGY_BONUS, ALLY_SYNERGY_TABLE_META } from './synergyData'

function synergy(a: number, b: number): number {
  return ALLY_SYNERGY_BONUS[String(a)]?.[String(b)] ?? ALLY_SYNERGY_BONUS[String(b)]?.[String(a)] ?? 0
}

function tablePairCount(): number {
  return Object.values(ALLY_SYNERGY_BONUS).reduce((total, row) => total + Object.keys(row).length, 0)
}

describe('patch-aware ally synergy table', () => {
  it('generates a broad table from public role rows instead of a tiny curated list', () => {
    expect(ALLY_SYNERGY_TABLE_META.source).toBe(
      `mobalytics-emerald-plus-${publicSynergyStatsSeed.patch}-duo-plus-class-heuristics`
    )
    expect(ALLY_SYNERGY_TABLE_META.pairCount).toBe(tablePairCount())
    expect(ALLY_SYNERGY_TABLE_META.pairCount).toBeGreaterThan(2000)
    expect(Object.keys(ALLY_SYNERGY_BONUS).length).toBeGreaterThan(100)
  })

  it('keeps classic lane and map synergies visible', () => {
    expect(synergy(222, 412)).toBeGreaterThanOrEqual(1) // Jinx + Thresh
    expect(synergy(81, 111)).toBeGreaterThanOrEqual(1) // Ezreal + Nautilus
    expect(synergy(64, 61)).toBeGreaterThan(0) // Lee Sin + Orianna
    expect(synergy(59, 61)).toBeGreaterThan(0) // Jarvan IV + Orianna
    expect(synergy(117, 96)).toBeGreaterThan(0) // Lulu + Kog'Maw
  })

  it('keeps generated values inside the engine bonus range', () => {
    for (const row of Object.values(ALLY_SYNERGY_BONUS)) {
      for (const value of Object.values(row)) {
        expect(Number.isFinite(value)).toBe(true)
        expect(value).toBeGreaterThanOrEqual(0.25)
        expect(value).toBeLessThanOrEqual(2)
      }
    }
  })
})
