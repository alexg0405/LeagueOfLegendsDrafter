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
  const id = store.get('captureSourceId', null)
  return typeof id === 'string' && id.trim() ? id : null
}

export function setCaptureSourceId(id: unknown) {
  store.set('captureSourceId', typeof id === 'string' && id.trim() ? id : null)
}
