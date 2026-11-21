import { useEffect, useMemo, useRef, useState } from 'react'
import { loadItemCatalog, type CatalogItem } from '@shared/dataDragon'
import {
  buildSeedRevision,
  bundledChampionByKeyOrName,
  currentBuildSeed,
  diffEnemyPurchases,
  ensureBuildPathDetails,
  isLiveGameStatus,
  mergePurchaseFeed,
  subscribeBuildSeed,
  type EnemyPurchase,
  type LiveGameSnapshot,
  type LiveGameStatus
} from '@shared/draft'

/**
 * Re-render when build data changes: the full paths finishing their lazy load, or a newer
 * seed from the live public-data refresh.
 */
export function useBuildSeedRevision(): number {
  const [revision, setRevision] = useState(buildSeedRevision)
  useEffect(() => {
    const un = subscribeBuildSeed(() => setRevision(buildSeedRevision()))
    void ensureBuildPathDetails()
    return un
  }, [])
  return revision
}

/**
 * Data Dragon version for images. Falls back to the version the build seed was generated
 * against, so icons render before the main window finishes loading Data Dragon.
 */
export function usableDdragonVersion(version: string | null | undefined): string {
  return version && version[0] !== '(' ? version : currentBuildSeed().patch
}

/** Full item catalog (recipes, stats, transforms) for the in-game advisor and item names. */
export function useItemCatalog(version: string | null | undefined): Map<number, CatalogItem> | null {
  const resolved = usableDdragonVersion(version)
  const [catalog, setCatalog] = useState<{ version: string; items: Map<number, CatalogItem> } | null>(null)
  useEffect(() => {
    let cancelled = false
    loadItemCatalog(resolved)
      .then((items) => {
        if (!cancelled) {
          setCatalog({ version: resolved, items })
        }
      })
      .catch(() => {
        /* offline: build paths still render from ids, just without names/recipes */
      })
    return () => {
      cancelled = true
    }
  }, [resolved])
  return catalog?.items ?? null
}

type ChampionRef = { id: number; name: string; key?: string }

/** Live Client only gives names/keys; attach numeric ids from Data Dragon or the bundled table. */
export function resolveLiveChampionIds(status: LiveGameStatus, champions: readonly ChampionRef[] | null | undefined): LiveGameStatus {
  if (!status.snapshot) {
    return status
  }
  const byKey = new Map<string, number>()
  const byName = new Map<string, number>()
  for (const champion of champions ?? []) {
    if (champion.key) byKey.set(champion.key.toLowerCase(), champion.id)
    byName.set(champion.name.toLowerCase(), champion.id)
  }
  return {
    ...status,
    snapshot: {
      ...status.snapshot,
      players: status.snapshot.players.map((player) => {
        const key = player.championKey?.toLowerCase() ?? ''
        const id =
          byKey.get(key) ??
          byName.get(player.championName.toLowerCase()) ??
          bundledChampionByKeyOrName(player.championKey)?.id ??
          bundledChampionByKeyOrName(player.championName)?.id ??
          null
        return { ...player, championId: id }
      })
    }
  }
}

/** Desktop only: the main process polls Riot's Live Client Data API and pushes updates. */
export function useLiveGame(champions: readonly ChampionRef[] | null | undefined): LiveGameStatus | null {
  const [raw, setRaw] = useState<LiveGameStatus | null>(null)
  useEffect(() => {
    const bridge = (window as Window & { drafter?: Window['drafter'] }).drafter
    if (!bridge?.onLiveGameUpdate || !bridge.getLiveGame) {
      return
    }
    let cancelled = false
    const accept = (status: unknown) => {
      if (!cancelled && isLiveGameStatus(status)) {
        setRaw(status)
      }
    }
    void bridge.getLiveGame().then(accept).catch(() => {
      /* main process may still be starting */
    })
    const un = bridge.onLiveGameUpdate(accept)
    return () => {
      cancelled = true
      un()
    }
  }, [])
  return useMemo(() => (raw ? resolveLiveChampionIds(raw, champions) : null), [raw, champions])
}

/**
 * Running list of what the enemy team buys, diffed from each live update (~2s). Keep it in an
 * always-mounted component so purchases made while the overlay is hidden still land.
 */
export function useEnemyPurchases(status: LiveGameStatus | null, catalog: ReadonlyMap<number, CatalogItem> | null): EnemyPurchase[] {
  const prevRef = useRef<LiveGameSnapshot | null>(null)
  const [feed, setFeed] = useState<EnemyPurchase[]>([])
  useEffect(() => {
    if (!status || status.state === 'no-game') {
      prevRef.current = null
      setFeed((current) => (current.length ? [] : current))
      return
    }
    const snap = status.state === 'in-game' ? status.snapshot : null
    if (!snap) {
      return
    }
    const prev = prevRef.current
    prevRef.current = snap
    if (prev && snap.gameTime < prev.gameTime) {
      setFeed([])
      return
    }
    if (!prev || !catalog) {
      return
    }
    const fresh = diffEnemyPurchases(prev, snap, catalog)
    if (fresh.length) {
      setFeed((current) => mergePurchaseFeed(current, fresh))
    }
  }, [status, catalog])
  return feed
}
