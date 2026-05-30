import type { ChampionLite, ItemLite } from '@shared/dataDragon'

const DB_NAME = 'nexusdraft-web-v1'
const DB_VERSION = 2
const CHAMPION_STORE = 'dd-champions'
const ITEM_STORE = 'dd-items'
const keyFor = (version: string) => `v:${version}`

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(CHAMPION_STORE)) {
        db.createObjectStore(CHAMPION_STORE)
      }
      if (!db.objectStoreNames.contains(ITEM_STORE)) {
        db.createObjectStore(ITEM_STORE)
      }
    }
  })
}

async function idbGetRows<T>(store: string, version: string): Promise<T[] | null> {
  if (typeof indexedDB === 'undefined') {
    return null
  }
  try {
    const db = await openDb()
    return await new Promise((resolve) => {
      const tx = db.transaction(store, 'readonly')
      tx.oncomplete = () => {
        try {
          db.close()
        } catch {
          // ignore
        }
      }
      const g = tx.objectStore(store).get(keyFor(version))
      g.onsuccess = () => {
        const val = g.result
        resolve(!Array.isArray(val) || val.length === 0 ? null : (val as T[]))
      }
      g.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

async function idbSetRows<T>(store: string, version: string, rows: T[]): Promise<void> {
  if (typeof indexedDB === 'undefined' || rows.length === 0) {
    return
  }
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      const st = tx.objectStore(store)
      st.put(rows, keyFor(version))
    })
    db.close()
  } catch {
    // ignore
  }
}

export async function idbGetChampions(version: string): Promise<ChampionLite[] | null> {
  return idbGetRows<ChampionLite>(CHAMPION_STORE, version)
}

export async function idbSetChampions(version: string, champions: ChampionLite[]): Promise<void> {
  return idbSetRows(CHAMPION_STORE, version, champions)
}

export async function idbGetItems(version: string): Promise<ItemLite[] | null> {
  return idbGetRows<ItemLite>(ITEM_STORE, version)
}

export async function idbSetItems(version: string, items: ItemLite[]): Promise<void> {
  return idbSetRows(ITEM_STORE, version, items)
}
