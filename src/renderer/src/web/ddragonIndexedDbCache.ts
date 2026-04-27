import type { ChampionLite } from '@shared/dataDragon'

const DB_NAME = 'nexusdraft-web-v1'
const DB_VERSION = 1
const STORE = 'dd-champions'
const keyFor = (version: string) => `v:${version}`

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE)
      }
    }
  })
}

export async function idbGetChampions(version: string): Promise<ChampionLite[] | null> {
  if (typeof indexedDB === 'undefined') {
    return null
  }
  try {
    const db = await openDb()
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly')
      tx.oncomplete = () => {
        try {
          db.close()
        } catch {
          // ignore
        }
      }
      const g = tx.objectStore(STORE).get(keyFor(version))
      g.onsuccess = () => {
        const val = g.result
        resolve(!Array.isArray(val) || val.length === 0 ? null : (val as ChampionLite[]))
      }
      g.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

export async function idbSetChampions(version: string, champions: ChampionLite[]): Promise<void> {
  if (typeof indexedDB === 'undefined' || champions.length === 0) {
    return
  }
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      const st = tx.objectStore(STORE)
      st.put(champions, keyFor(version))
    })
    db.close()
  } catch {
    // ignore
  }
}
