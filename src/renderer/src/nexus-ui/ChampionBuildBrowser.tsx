import { useEffect, useMemo, useState } from 'react'
import type { CatalogItem } from '@shared/dataDragon'
import {
  bestBuildRoleForChampion,
  buildRolesForChampion,
  getChampionBuildPath,
  nameMatchesChampionQuery,
  type BuildSeedRole,
  type DraftRole
} from '@shared/draft'
import { useBuildSeedRevision } from '../builds/useBuildData'
import { ROLE_LABEL } from './buildLabels'
import { ChampionBuildPathView } from './ChampionBuildPathView'

export type BrowserChampion = { id: number; name: string; key?: string }

/**
 * Pick any champion + role and see its build path. Follows `focusChampionId` (your locked pick
 * or in-game champion) until the user searches for someone else.
 */
export function ChampionBuildBrowser({
  champions,
  focusChampionId,
  preferredRole,
  version,
  catalog,
  iconUrl,
  dense = true
}: {
  champions: readonly BrowserChampion[]
  focusChampionId: number | null
  preferredRole: DraftRole | null
  version: string
  catalog: ReadonlyMap<number, CatalogItem> | null
  iconUrl: (id: number | null | undefined) => string | null
  /** Overlay: tight list. Web: roomier grid. */
  dense?: boolean
}) {
  const [query, setQuery] = useState('')
  const [pickedId, setPickedId] = useState<number | null>(null)
  const [pickedRole, setPickedRole] = useState<BuildSeedRole | null>(null)
  const championId = pickedId ?? focusChampionId
  const champion = useMemo(() => champions.find((c) => c.id === championId) ?? null, [champions, championId])

  // A new focus (locked a different champion, new game) resets a stale manual role.
  useEffect(() => {
    setPickedRole(null)
  }, [championId])

  // Full paths load lazily and can be swapped by a live refresh; the revision re-runs these memos.
  const seedRevision = useBuildSeedRevision()
  const roles = useMemo(
    () => (championId != null ? buildRolesForChampion(championId) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [championId, seedRevision]
  )
  const role = pickedRole ?? (championId != null ? bestBuildRoleForChampion(championId, preferredRole) : null)
  const path = useMemo(
    () => (championId != null && role ? getChampionBuildPath(championId, role, catalog) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [championId, role, catalog, seedRevision]
  )

  const matches = useMemo(() => {
    const q = query.trim()
    if (!q) {
      return []
    }
    return champions.filter((c) => nameMatchesChampionQuery(c.name, q)).slice(0, dense ? 6 : 10)
  }, [champions, query, dense])

  const choose = (id: number) => {
    setPickedId(id)
    setPickedRole(null)
    setQuery('')
  }

  return (
    <div className="space-y-2.5">
      <div className="relative">
        <input
          type="text"
          className="nexus-focus w-full border border-nexus-line bg-nexus-bg px-2.5 py-1.5 font-mono text-sm text-nexus-text placeholder:text-nexus-muted/70"
          placeholder={champion ? `Search (showing ${champion.name})…` : 'Search a champion…'}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && matches[0]) {
              event.preventDefault()
              choose(matches[0].id)
            }
            if (event.key === 'Escape') {
              setQuery('')
            }
          }}
          aria-label="Champion build search"
        />
        {matches.length ? (
          <ul className="absolute left-0 right-0 top-full z-30 m-0 mt-1 list-none border border-nexus-line bg-nexus-surface-2 p-0 shadow-[0_12px_32px_rgba(0,0,0,0.45)]">
            {matches.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-left font-mono text-sm text-nexus-text hover:bg-nexus-lime/10"
                  onClick={() => choose(c.id)}
                >
                  {iconUrl(c.id) ? <img className="h-6 w-6 border border-nexus-line/70" src={iconUrl(c.id)!} alt="" width={24} height={24} /> : null}
                  {c.name}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {champion && roles.length ? (
        <div className="flex flex-wrap items-center gap-2">
          {iconUrl(champion.id) ? (
            <img className="h-9 w-9 border border-nexus-line/80" src={iconUrl(champion.id)!} alt="" width={36} height={36} />
          ) : null}
          <span className="font-mono text-sm font-bold text-nexus-lime/95">{champion.name}</span>
          {pickedId != null && focusChampionId != null && pickedId !== focusChampionId ? (
            <button
              type="button"
              className="nexus-focus border border-nexus-line px-1.5 py-[1px] font-mono text-[10px] uppercase tracking-[0.1em] text-nexus-muted hover:text-nexus-text"
              onClick={() => setPickedId(null)}
              title={`Back to ${champions.find((c) => c.id === focusChampionId)?.name ?? 'the previous champion'}`}
            >
              ↺ Back
            </button>
          ) : null}
          <span className="ml-auto flex flex-wrap gap-1" role="tablist" aria-label="Role">
            {roles.map((row) => {
              const on = row.role === role
              return (
                <button
                  key={row.role}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  className={[
                    'nexus-focus border px-1.5 py-[1px] font-mono text-[10px] uppercase tracking-[0.08em]',
                    on ? 'border-nexus-lime bg-nexus-lime/15 text-nexus-lime' : 'border-nexus-line text-nexus-muted hover:text-nexus-text',
                    (row.rolePct ?? 0) < 3 && !on ? 'opacity-60' : ''
                  ].join(' ')}
                  title={row.rolePct != null ? `${row.rolePct}% of ${champion.name} games` : undefined}
                  onClick={() => setPickedRole(row.role)}
                >
                  {ROLE_LABEL[row.role] ?? row.role}
                  {row.rolePct != null && row.rolePct >= 3 ? <span className="ml-1 text-nexus-muted">{Math.round(row.rolePct)}%</span> : null}
                </button>
              )
            })}
          </span>
        </div>
      ) : null}

      {path && champion ? (
        <ChampionBuildPathView path={path} version={version} catalog={catalog} championName={champion.name} />
      ) : (
        <p className="m-0 font-mono text-xs text-nexus-muted">
          {championId == null ? 'Lock in a champion or search one to see its build.' : 'No build tracked for this champion yet.'}
        </p>
      )}
    </div>
  )
}
