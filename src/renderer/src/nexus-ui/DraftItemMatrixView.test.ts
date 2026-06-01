import { describe, expect, it } from 'vitest'
import { dedupeEnemyTargetsForMatrix, dedupeMatchupPlansForMatrix, type MatchupPlan } from './DraftItemMatrixView'

function matchupPlan(championId: number, championName: string, rowCount: number): MatchupPlan {
  return {
    championId,
    championName,
    laneOpponentId: null,
    laneOpponentName: null,
    summonerSpells: '',
    startingItem: '',
    firstRecall: '',
    runeExport: '',
    gamePlan: '',
    itemPlan: {
      core: '',
      boots: '',
      defensive: '',
      situational: [],
      notes: [],
      matrixRows: Array.from({ length: rowCount }, (_, index) => ({
        itemId: 1000 + index,
        name: `Item ${index}`,
        reason: '',
        score: 1,
        tags: [],
        phase: 'completed' as const,
        cost: 3000,
        goodInto: [],
        avoidWhen: []
      }))
    }
  }
}

describe('DraftItemMatrixView helpers', () => {
  it('dedupes selectable champion plans and keeps the richest plan', () => {
    const plans = [
      matchupPlan(50, 'Swain', 2),
      matchupPlan(6, 'Urgot', 3),
      matchupPlan(50, 'Swain', 8),
      matchupPlan(6, 'Urgot', 1)
    ]

    const deduped = dedupeMatchupPlansForMatrix(plans)

    expect(deduped.map((plan) => plan.championName)).toEqual(['Swain', 'Urgot'])
    expect(deduped[0]?.itemPlan?.matrixRows?.length).toBe(8)
    expect(deduped[1]?.itemPlan?.matrixRows?.length).toBe(3)
  })

  it('dedupes enemy target icons by champion with stable source priority', () => {
    const deduped = dedupeEnemyTargetsForMatrix([
      { championId: 50, championName: 'Swain', reason: 'kit sustain', source: 'kit' },
      { championId: 50, championName: 'Swain', reason: 'default sustain items', source: 'defaultBuild' },
      { championId: 6, championName: 'Urgot', reason: 'frontline', source: 'teamThreat' },
      { championId: 6, championName: 'Urgot', reason: 'armor stack', source: 'defaultBuild' }
    ])

    expect(deduped).toEqual([
      { championId: 50, championName: 'Swain', reason: 'default sustain items', source: 'defaultBuild' },
      { championId: 6, championName: 'Urgot', reason: 'armor stack', source: 'defaultBuild' }
    ])
  })
})
