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
- If a champion is unclear, use an empty championName.
- Prefer the role labels shown in the screenshot if visible.
- If the screenshot is not champion select, return empty arrays and confidence "low".`
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
    res.status(200).json(parsed)
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
}
