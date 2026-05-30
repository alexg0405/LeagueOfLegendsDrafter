import { describe, expect, it } from 'vitest'
import { sanitizeDraftUpdateForIpc } from './sanitizeDraftIpc'
import { isDraftUpdate } from './validate'
import type { DraftUpdate } from './types'

function baseUpdate(): DraftUpdate {
  return {
    source: 'manual',
    lcuConnected: false,
    lcuStatus: 'ready',
    snapshot: null,
    suggestions: [],
    geminiNarration: null,
    dataDragonVersion: '16.11.1',
    patchLabel: 'engine-v1',
    error: null,
    updatedAt: '2026-05-01T00:00:00.000Z',
    suggestionMyRole: 'top',
    boardSignature: null,
    championsSearch: null
  }
}

describe('DraftUpdate enemy role inference payload', () => {
  it('validates and preserves inferred enemy role rows over IPC', () => {
    const update: DraftUpdate = {
      ...baseUpdate(),
      enemyRoleInference: [
        {
          enemyIndex: 0,
          cellId: 5,
          championId: 67,
          assignedRole: 'bottom',
          inferredRole: 'top',
          confidence: 0.82,
          confidenceLabel: 'likely',
          roleProbabilities: {
            top: 0.82,
            jungle: 0.01,
            middle: 0.02,
            bottom: 0.14,
            support: 0.01
          }
        }
      ]
    }
    const sanitized = sanitizeDraftUpdateForIpc(update)
    expect(isDraftUpdate(sanitized)).toBe(true)
    expect(sanitized.enemyRoleInference?.[0]?.inferredRole).toBe('top')
  })

  it('validates and preserves draft intel over IPC', () => {
    const update: DraftUpdate = {
      ...baseUpdate(),
      draftIntel: {
        banRecommendations: [
          {
            championId: 238,
            championName: 'Zed',
            role: 'middle',
            score: 88.5,
            reason: 'mid 52.1% WR / high pick'
          }
        ],
        compIdentity: {
          ally: ['poke/siege'],
          enemy: ['dive'],
          missing: ['frontline'],
          warnings: ['Enemy has multiple backline threats.'],
          winCondition: 'Play through vision and poke before objectives.'
        },
        matchupPlans: [
          {
            championId: 81,
            championName: 'Ezreal',
            laneOpponentId: 51,
            laneOpponentName: 'Caitlyn',
            summonerSpells: 'Flash + Cleanse',
            startingItem: "Doran's Bow",
            firstRecall: 'Pickaxe plus boots.',
            runeExport: 'Sorcery: Arcane Comet / Secondary: Inspiration',
            gamePlan: 'Play short trades around cooldowns.'
          }
        ],
        pickComparison: [
          {
            championId: 81,
            championName: 'Ezreal',
            score: 91,
            estWin: 0.535,
            delta: 0.01,
            summary: 'Lane counter.'
          }
        ],
        loadingBrief: ['Win condition: poke before objectives.'],
        confidenceNotes: ['Current-patch Emerald+ public meta seed.']
      }
    }
    const sanitized = sanitizeDraftUpdateForIpc(update)
    expect(isDraftUpdate(sanitized)).toBe(true)
    expect(sanitized.draftIntel?.matchupPlans[0]?.championName).toBe('Ezreal')
  })
})
