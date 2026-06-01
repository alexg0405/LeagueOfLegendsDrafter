export function isTauriBuild(): boolean {
  return import.meta.env.VITE_NEXUS_TAURI === '1'
}

export async function invokeTauriCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(command, args)
}

export async function emitTauriEvent<T>(event: string, payload: T): Promise<void> {
  const { emit } = await import('@tauri-apps/api/event')
  await emit(event, payload)
}

export function listenTauriEvent<T>(event: string, cb: (payload: T) => void): () => void {
  let disposed = false
  let unlisten: (() => void) | null = null
  void import('@tauri-apps/api/event')
    .then(({ listen }) => listen<T>(event, (payload) => cb(payload.payload)))
    .then((nextUnlisten) => {
      if (disposed) {
        nextUnlisten()
      } else {
        unlisten = nextUnlisten
      }
    })
    .catch(() => {
      /* bridge listeners are best-effort; commands still report direct failures */
    })
  return () => {
    disposed = true
    if (unlisten) {
      unlisten()
      unlisten = null
    }
  }
}
