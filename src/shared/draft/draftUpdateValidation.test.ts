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
            gamePlan: 'Play short trades around cooldowns.',
            itemPlan: {
              core: 'Manamune into poke DPS.',
              boots: "Mercury's Treads into heavy CC.",
              defensive: 'Buy MR if mid/jungle burst is fed.',
              situational: ['Anti-heal into sustain.', 'Anti-tank into frontline.'],
              notes: ['Team damage is mostly physical.'],
              defaultBuildSource: 'ugg',
              defaultItemIds: [1055, 3111, 3071],
              starting: [
                {
                  itemId: 1055,
                  name: "Doran's Blade",
                  reason: 'safe ranged start',
                  score: 77,
                  tags: ['ad', 'starter'],
                  phase: 'starter',
                  cost: 450
                }
              ],
              bootChoice: {
                itemId: 3111,
                name: "Mercury's Treads",
                reason: 'answers hard CC',
                score: 91,
                tags: ['boots', 'mr', 'anti-cc'],
                phase: 'boots',
                cost: 1200
              },
              coreBuild: [
                {
                  itemId: 3071,
                  name: 'Black Cleaver',
                  reason: 'answers frontline',
                  score: 88,
                  tags: ['ad', 'health', 'anti-tank'],
                  phase: 'completed',
                  cost: 3000
                }
              ],
              matrixRows: [
                {
                  itemId: 3071,
                  name: 'Black Cleaver',
                  reason: 'answers frontline',
                  score: 88,
                  tags: ['ad', 'health', 'anti-tank'],
                  phase: 'completed',
                  cost: 3000,
                  goodInto: ['frontline'],
                  avoidWhen: [],
                  enemyTargets: [
                    {
                      championId: 54,
                      championName: 'Malphite',
                      reason: 'armor stack',
                      source: 'defaultBuild'
                    }
                  ]
                }
              ],
              threatSummary: [
                {
                  label: 'Hard CC',
                  tone: 'danger',
                  reason: 'Enemy lockdown can deny rotations.'
                }
              ]
            }
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
    const baseMatrixPlan = update.draftIntel!.matchupPlans[0]!
    update.draftIntel!.itemMatrixPlans = Array.from({ length: 40 }, (_, idx) => ({
      ...baseMatrixPlan,
      championId: 1000 + idx,
      championName: `Matrix Champ ${idx}`
    }))

    const sanitized = sanitizeDraftUpdateForIpc(update)
    expect(isDraftUpdate(sanitized)).toBe(true)
    expect(sanitized.draftIntel?.matchupPlans[0]?.championName).toBe('Ezreal')
    expect(sanitized.draftIntel?.matchupPlans[0]?.itemPlan?.bootChoice?.itemId).toBe(3111)
    expect(sanitized.draftIntel?.matchupPlans[0]?.itemPlan?.matrixRows?.[0]?.goodInto).toContain('frontline')
    expect(sanitized.draftIntel?.matchupPlans[0]?.itemPlan?.defaultBuildSource).toBe('ugg')
    expect(sanitized.draftIntel?.matchupPlans[0]?.itemPlan?.matrixRows?.[0]?.enemyTargets?.[0]?.championName).toBe('Malphite')
    expect(sanitized.draftIntel?.itemMatrixPlans).toHaveLength(40)
    expect(sanitized.draftIntel?.itemMatrixPlans?.[39]?.championName).toBe('Matrix Champ 39')
    expect(sanitized.draftIntel?.itemMatrixPlans?.[0]?.itemPlan?.matrixRows?.[0]?.enemyTargets?.[0]?.championName).toBe('Malphite')
  })
})
