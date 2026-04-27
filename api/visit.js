const COUNTER_URL = 'https://countapi.mileshilliard.com/api/v1/hit/nexusdraft-lol-visits'

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', 'GET, POST')
    res.status(405).json({ error: 'GET or POST only' })
    return
  }

  try {
    const response = await fetch(COUNTER_URL, {
      headers: { Accept: 'application/json' }
    })
    const data = await response.json()
    if (!response.ok || typeof data.value !== 'number') {
      res.status(502).json({ error: 'Visitor counter unavailable' })
      return
    }

    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json({
      totalCount: data.value
    })
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : String(error) })
  }
}
