import { suggestPicks, type PickSuggestion, type SuggestPicksArgs } from '../../../shared/draft'

type RecommendRequest = {
  id: number
  args: SuggestPicksArgs
}

type RecommendResponse = {
  id: number
  ok: boolean
  source: 'rust' | 'typescript'
  suggestions: PickSuggestion[]
  patchLabel: string
  error?: string
}

self.onmessage = (event: MessageEvent<RecommendRequest>) => {
  const { id, args } = event.data
  try {
    const result = suggestPicks(args)
    const response: RecommendResponse = {
      id,
      ok: true,
      source: 'typescript',
      suggestions: result.suggestions,
      patchLabel: result.patchLabel
    }
    ;(self as unknown as { postMessage: (message: RecommendResponse) => void }).postMessage(response)
  } catch (error) {
    const response: RecommendResponse = {
      id,
      ok: false,
      source: 'typescript',
      suggestions: [],
      patchLabel: 'engine-v1',
      error: error instanceof Error ? error.message : String(error)
    }
    ;(self as unknown as { postMessage: (message: RecommendResponse) => void }).postMessage(response)
  }
}

export {}
