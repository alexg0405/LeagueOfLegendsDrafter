/**
 * Google Gemini image → text. Key never logged. Uses header auth (not query string).
 * @see https://ai.google.dev/gemini-api/docs/vision
 *
 * Default is `gemini-2.5-flash`. Override: env `GEMINI_MODEL`.
 */
function defaultModelName(): string {
  const m = process.env['GEMINI_MODEL']?.trim()
  return m || 'gemini-2.5-flash'
}

function generateContentUrl(): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${defaultModelName()}:generateContent`
}

function streamContentUrl(): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${defaultModelName()}:streamGenerateContent?alt=sse`
}

type GenerateContentResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> }
    finishReason?: string
  }>
  error?: { message?: string; code?: number }
}

function buildDraftScreenPrompt(dataDragonVersion: string | null): string {
  const dd = dataDragonVersion ?? 'unknown (fetch Data Dragon in app)'
  return `You read League of Legends **champion select** from a client screenshot (may be downscaled).
Data Dragon patch context (approx): "${dd}".

Output **only** valid JSON, no markdown, no backticks, no extra text. Schema:
{
  "allyPicks": [ { "role": "top|jungle|middle|bottom|support|unknown", "championName": string } ],
  "enemyPicks": [ { "role": "top|jungle|middle|bottom|support|unknown", "championName": string } ],
  "myRole": "top|jungle|middle|bottom|support|unknown",
  "confidence": "low|medium|high"
}
Use empty string for unknown champion. Include up to 5 per side. If the screen is not draft, return confidence "low" and best guess or empty arrays.`
}

function buildPrompt(dataDragonVersion: string | null): string {
  const dd = dataDragonVersion ?? 'unknown (fetch Data Dragon in app)'
  return `You are a concise League of Legends coach. The attached image is a screen capture of the League client or in-game UI (may be downscaled).

Context: the app uses Riot Data Dragon version approximately "${dd}" for item/champion data — game balance may have moved since; give general, non-exploit advice.

In under 200 words, English:
(1) Name what you see (e.g. draft, loading, in-game, scoreboard if visible).
(2) Give 3 specific, actionable tips for the player (macro, itemization, or draft) tailored to what is visible. If the image is too unclear, say so and still give 2 general tips.

No profanity. Do not output JSON; plain text with short bullet points is fine.`
}

export type GeminiImageRequest = {
  imageBase64: string
  dataDragonVersion: string | null
}

async function callGenerateContent(
  apiKey: string,
  body: object
): Promise<GenerateContentResponse> {
  const res = await fetch(generateContentUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify(body)
  })

  const raw = await res.text()
  if (!res.ok) {
    let hint = raw.slice(0, 400)
    try {
      const j = JSON.parse(raw) as { error?: { message?: string } }
      if (j.error?.message) {
        hint = j.error.message
      }
    } catch {
      /* ignore */
    }
    throw new Error(`Gemini HTTP ${res.status}: ${hint}`)
  }

  const json = JSON.parse(raw) as GenerateContentResponse
  if (json.error?.message) {
    throw new Error(`Gemini: ${json.error.message}`)
  }
  return json
}

function firstCandidateText(json: GenerateContentResponse): string {
  return json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('')?.trim() ?? ''
}

/**
 * Streaming vision call. `onDelta` receives (delta, accumulated) as tokens arrive.
 */
export async function streamCoachingText(
  apiKey: string,
  req: GeminiImageRequest,
  onDelta: (delta: string, accumulated: string) => void
): Promise<string> {
  const body = {
    contents: [
      {
        parts: [
          { text: buildPrompt(req.dataDragonVersion) },
          { inline_data: { mime_type: 'image/png', data: req.imageBase64 } }
        ]
      }
    ],
    generationConfig: {
      maxOutputTokens: 900,
      temperature: 0.35
    }
  }

  const res = await fetch(streamContentUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify(body)
  })

  if (!res.ok) {
    const raw = await res.text()
    let hint = raw.slice(0, 800)
    try {
      const j = JSON.parse(raw) as { error?: { message?: string } }
      if (j.error?.message) {
        hint = j.error.message
      }
    } catch {
      /* ignore */
    }
    throw new Error(`Gemini HTTP ${res.status}: ${hint}`)
  }

  if (!res.body) {
    throw new Error('Gemini: empty stream body')
  }

  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let lineBuf = ''
  let lastCumulative = ''
  let acc = ''

  for (;;) {
    const { value, done } = await reader.read()
    if (done) {
      break
    }
    lineBuf += dec.decode(value, { stream: true })
    for (;;) {
      const nl = lineBuf.indexOf('\n')
      if (nl < 0) {
        break
      }
      const line = lineBuf.slice(0, nl)
      lineBuf = lineBuf.slice(nl + 1)
      const trimmed = line.trim()
      if (!trimmed) {
        continue
      }
      if (!trimmed.startsWith('data: ')) {
        continue
      }
      const dataStr = trimmed.slice(6).trim()
      if (dataStr === '[DONE]') {
        continue
      }
      let j: GenerateContentResponse
      try {
        j = JSON.parse(dataStr) as GenerateContentResponse
      } catch {
        continue
      }
      if (j.error?.message) {
        throw new Error(`Gemini: ${j.error.message}`)
      }
      const full = firstCandidateText(j)
      if (full && full.startsWith(lastCumulative) && full.length >= lastCumulative.length) {
        const delta = full.slice(lastCumulative.length)
        lastCumulative = full
        acc = full
        if (delta) {
          onDelta(delta, acc)
        }
        continue
      }
      for (const p of j.candidates?.[0]?.content?.parts ?? []) {
        if (p.text) {
          acc += p.text
          onDelta(p.text, acc)
          lastCumulative = acc
        }
      }
    }
  }
  if (!acc && lastCumulative) {
    acc = lastCumulative
  }
  if (!acc) {
    throw new Error('Empty Gemini stream')
  }
  return acc
}

/** Streaming draft UI read: JSON text per streamDraftScreenToText contract. */
export async function streamDraftScreenStream(
  apiKey: string,
  req: GeminiImageRequest,
  onDelta: (delta: string, accumulated: string) => void
): Promise<string> {
  const body = {
    contents: [
      {
        parts: [
          { text: buildDraftScreenPrompt(req.dataDragonVersion) },
          { inline_data: { mime_type: 'image/png', data: req.imageBase64 } }
        ]
      }
    ],
    generationConfig: {
      maxOutputTokens: 1200,
      temperature: 0.2
    }
  }

  const res = await fetch(streamContentUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify(body)
  })

  if (!res.ok) {
    const raw = await res.text()
    let hint = raw.slice(0, 800)
    try {
      const j = JSON.parse(raw) as { error?: { message?: string } }
      if (j.error?.message) {
        hint = j.error.message
      }
    } catch {
      /* ignore */
    }
    throw new Error(`Gemini HTTP ${res.status}: ${hint}`)
  }

  if (!res.body) {
    throw new Error('Gemini: empty stream body')
  }

  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let lineBuf = ''
  let lastCumulative = ''
  let acc = ''

  for (;;) {
    const { value, done } = await reader.read()
    if (done) {
      break
    }
    lineBuf += dec.decode(value, { stream: true })
    for (;;) {
      const nl = lineBuf.indexOf('\n')
      if (nl < 0) {
        break
      }
      const line = lineBuf.slice(0, nl)
      lineBuf = lineBuf.slice(nl + 1)
      const trimmed = line.trim()
      if (!trimmed) {
        continue
      }
      if (!trimmed.startsWith('data: ')) {
        continue
      }
      const dataStr = trimmed.slice(6).trim()
      if (dataStr === '[DONE]') {
        continue
      }
      let j: GenerateContentResponse
      try {
        j = JSON.parse(dataStr) as GenerateContentResponse
      } catch {
        continue
      }
      if (j.error?.message) {
        throw new Error(`Gemini: ${j.error.message}`)
      }
      const full = firstCandidateText(j)
      if (full && full.startsWith(lastCumulative) && full.length >= lastCumulative.length) {
        const delta = full.slice(lastCumulative.length)
        lastCumulative = full
        acc = full
        if (delta) {
          onDelta(delta, acc)
        }
        continue
      }
      for (const p of j.candidates?.[0]?.content?.parts ?? []) {
        if (p.text) {
          acc += p.text
          onDelta(p.text, acc)
          lastCumulative = acc
        }
      }
    }
  }
  if (!acc && lastCumulative) {
    acc = lastCumulative
  }
  if (!acc) {
    throw new Error('Empty Gemini stream')
  }
  return acc
}

/**
 * One-shot text explanation of draft suggestions (no image). Keeps app copy grounded in passed context.
 */
export async function generateDraftNarration(apiKey: string, contextText: string): Promise<string> {
  const body = {
    contents: [
      {
        parts: [
          {
            text: `You are a League of Legends draft coach. The block below is structured data from a local app (heuristic suggestions + LCU/vision). Summarize in under 120 words: team comps, the player role, and the top 1–2 pick ideas. Do not invent stats. Plain text, short bullets.\n\n${contextText}`
          }
        ]
      }
    ],
    generationConfig: {
      maxOutputTokens: 500,
      temperature: 0.4
    }
  }

  const json = await callGenerateContent(apiKey, body)
  const text = firstCandidateText(json)
  if (!text) {
    const reason = json.candidates?.[0]?.finishReason
    throw new Error(`Empty Gemini response${reason ? ` (finish: ${reason})` : ''}`)
  }
  return text
}

export async function generateCoachingText(apiKey: string, req: GeminiImageRequest): Promise<string> {
  const body = {
    contents: [
      {
        parts: [
          { text: buildPrompt(req.dataDragonVersion) },
          { inline_data: { mime_type: 'image/png', data: req.imageBase64 } }
        ]
      }
    ],
    generationConfig: {
      maxOutputTokens: 900,
      temperature: 0.35
    }
  }

  const json = await callGenerateContent(apiKey, body)
  const text = firstCandidateText(json)
  if (!text) {
    const reason = json.candidates?.[0]?.finishReason
    throw new Error(`Empty Gemini response${reason ? ` (finish: ${reason})` : ''}`)
  }
  return text
}

export async function testGeminiApiKey(apiKey: string): Promise<void> {
  const body = {
    contents: [
      {
        parts: [{ text: 'Reply with exactly one word: OK' }]
      }
    ],
    generationConfig: {
      maxOutputTokens: 32,
      temperature: 0
    }
  }

  const json = await callGenerateContent(apiKey, body)
  const text = firstCandidateText(json)
  if (!text) {
    const reason = json.candidates?.[0]?.finishReason
    throw new Error(`Empty Gemini response${reason ? ` (finish: ${reason})` : ''}`)
  }
}
