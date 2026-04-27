const DEFAULT_MODEL = 'gemini-2.5-flash'

function modelName() {
  return (process.env.GEMINI_MODEL || DEFAULT_MODEL).trim()
}

function prompt(dataDragonVersion) {
  return `You read League of Legends champion select screenshots.
Data Dragon patch context: "${dataDragonVersion || 'unknown'}".

Return only valid JSON. No markdown. No comments.

Schema:
{
  "allyPicks": [ { "role": "top|jungle|middle|bottom|support|unknown", "championName": string } ],
  "enemyPicks": [ { "role": "top|jungle|middle|bottom|support|unknown", "championName": string } ],
  "myRole": "top|jungle|middle|bottom|support|unknown",
  "confidence": "low|medium|high"
}

Rules:
- Include up to five allies and five enemies.
- The ally team is usually the player's team list/columns labeled ally, your team, blue side, left side, or the team containing the selected/local player.
- The enemy team is usually labeled enemy, opponents, red side, their team, or appears in the opposite team list/column.
- During champion select, enemy picks may appear on the right side or in a separate opponent column. Do not omit them if visible.
- If only one side is clearly visible, fill that side and leave the other side empty.
- If a champion is unclear, use an empty championName.
- Prefer the role labels shown in the screenshot if visible.
- If the screenshot is not champion select, return empty arrays and confidence "low".`
}

function normalizeRows(value) {
  return Array.isArray(value) ? value : []
}

function normalizeResponse(parsed) {
  const allyPicks =
    normalizeRows(parsed.allyPicks).length > 0
      ? normalizeRows(parsed.allyPicks)
      : normalizeRows(parsed.allies).length > 0
        ? normalizeRows(parsed.allies)
        : normalizeRows(parsed.myTeam)

  const enemyPicks =
    normalizeRows(parsed.enemyPicks).length > 0
      ? normalizeRows(parsed.enemyPicks)
      : normalizeRows(parsed.enemies).length > 0
        ? normalizeRows(parsed.enemies)
        : normalizeRows(parsed.opponentPicks).length > 0
          ? normalizeRows(parsed.opponentPicks)
          : normalizeRows(parsed.theirTeam)

  return {
    allyPicks,
    enemyPicks,
    myRole: typeof parsed.myRole === 'string' ? parsed.myRole : 'unknown',
    confidence: typeof parsed.confidence === 'string' ? parsed.confidence : 'low'
  }
}

function firstText(json) {
  return json?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim() || ''
}

function extractJsonObject(text) {
  const trimmed = String(text || '').trim()
  const withoutFence = trimmed.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  const start = withoutFence.indexOf('{')
  const end = withoutFence.lastIndexOf('}')
  if (start < 0 || end <= start) {
    return withoutFence
  }
  return withoutFence.slice(start, end + 1)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ error: 'POST only' })
    return
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  if (!apiKey) {
    res.status(501).json({
      error: 'Screenshot autofill is not configured yet. Add GEMINI_API_KEY in Vercel project environment variables.'
    })
    return
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
  const imageBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64 : ''
  const mimeType = typeof body.mimeType === 'string' ? body.mimeType : 'image/jpeg'
  const dataDragonVersion = typeof body.dataDragonVersion === 'string' ? body.dataDragonVersion : null

  if (!imageBase64) {
    res.status(400).json({ error: 'Missing screenshot image.' })
    return
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName()}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt(dataDragonVersion) },
                { inline_data: { mime_type: mimeType, data: imageBase64 } }
              ]
            }
          ],
          generationConfig: {
            maxOutputTokens: 700,
            temperature: 0.1
          }
        })
      }
    )

    const raw = await response.text()
    if (!response.ok) {
      let hint = raw.slice(0, 500)
      try {
        const parsed = JSON.parse(raw)
        hint = parsed?.error?.message || hint
      } catch {
        // keep raw hint
      }
      res.status(502).json({ error: `Vision service failed: ${hint}` })
      return
    }

    const gemini = JSON.parse(raw)
    const text = firstText(gemini)
    const parsed = JSON.parse(extractJsonObject(text))
    res.status(200).json(normalizeResponse(parsed))
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
}
