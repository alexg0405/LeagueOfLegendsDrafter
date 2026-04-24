import Store from 'electron-store'

type SettingsSchema = {
  captureSourceId: string | null
}

const store = new Store<SettingsSchema>({
  name: 'league-drafter-settings',
  defaults: {
    captureSourceId: null
  }
})

export function getCaptureSourceId(): string | null {
  return store.get('captureSourceId', null) ?? null
}

export function setCaptureSourceId(id: string | null) {
  store.set('captureSourceId', id)
}

/** Gemini key is never persisted; optional env for dev/CI. */
export function getGeminiKeyFromEnv(): string | null {
  const k = process.env['GEMINI_API_KEY']?.trim()
  return k || null
}
