import { useMemo, useState } from 'react'
import {
  getPublicMetaStatsPatch,
  publicMetaMatchupsAgainstRole,
  publicMetaPrimaryRoleForChampion,
  type RoleKey
} from '../../../shared/draft'
import { MicroLabel } from './NexusTick'
import { NexusPanel } from './NexusPanel'

export type MatchupChampionOption = {
  id: number
  name: string
  key?: string
}

type SortMode = 'worst' | 'best'

const ROLE_OPTIONS: Array<{ id: RoleKey; label: string }> = [
  { id: 'top', label: 'Top' },
  { id: 'jungle', label: 'Jungle' },
  { id: 'middle', label: 'Mid' },
  { id: 'bottom', label: 'Bot' },
  { id: 'support', label: 'Support' }
]

type Props = {
  champions: MatchupChampionOption[]
  ddragonVersion?: string | null
}

function formatPct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`
}

export function NexusMatchupExplorer({ champions, ddragonVersion }: Props) {
  const [query, setQuery] = useState('Ahri')
  const [selectedId, setSelectedId] = useState<number | null>(103)
  const [myRole, setMyRole] = useState<RoleKey>('middle')
  const [opposingRole, setOpposingRole] = useState<RoleKey>('middle')
  const [sortMode, setSortMode] = useState<SortMode>('worst')

  const championById = useMemo(() => new Map(champions.map((c) => [c.id, c] as const)), [champions])

  const suggestions = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) {
      return champions.slice(0, 8)
    }
    return champions
      .filter((c) => c.name.toLowerCase().includes(needle) || String(c.id) === needle)
      .slice(0, 8)
  }, [champions, query])

  const selected = selectedId != null ? championById.get(selectedId) ?? null : null
  const patch = getPublicMetaStatsPatch()

  const rows = useMemo(() => {
    if (selectedId == null) {
      return []
    }
    const list = publicMetaMatchupsAgainstRole(selectedId, myRole, opposingRole)
    return sortMode === 'worst' ? list : [...list].reverse()
  }, [selectedId, myRole, opposingRole, sortMode])

  const iconUrl = (championId: number): string | null => {
    const champ = championById.get(championId)
    const key = champ?.key
    if (!key || !ddragonVersion || ddragonVersion[0] === '(') {
      return null
    }
    return `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/champion/${key}.png`
  }

  const selectChampion = (champion: MatchupChampionOption) => {
    setSelectedId(champion.id)
    setQuery(champion.name)
    const primary = publicMetaPrimaryRoleForChampion(champion.id)
    if (primary) {
      setMyRole(primary)
      setOpposingRole(primary)
    }
  }

  return (
    <NexusPanel kicker={`meta // patch ${patch}`} title="Champion matchups" accent>
      <p className="mb-4 font-mono text-xs sm:text-sm text-nexus-muted">
        Pick your champion and an opposing role. Win rates come from the Emerald+ public counter seed (same data the
        draft scorer uses).
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] gap-4">
        <div className="space-y-3">
          <label className="block">
            <MicroLabel className="mb-1.5 block">Your champion</MicroLabel>
            <input
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                const exact = champions.find((c) => c.name.toLowerCase() === event.target.value.trim().toLowerCase())
                if (exact) {
                  selectChampion(exact)
                }
              }}
              className="nexus-focus w-full border border-nexus-line bg-nexus-bg/60 px-3 py-2 font-mono text-sm text-nexus-text"
              placeholder="Search champions"
              autoComplete="off"
            />
          </label>

          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((champion) => {
                const active = champion.id === selectedId
                return (
                  <button
                    key={champion.id}
                    type="button"
                    onClick={() => selectChampion(champion)}
                    className={[
                      'nexus-focus inline-flex items-center gap-1.5 border px-2 py-1 font-mono text-xs uppercase tracking-[0.08em]',
                      active
                        ? 'border-nexus-lime/70 bg-nexus-lime/15 text-nexus-lime'
                        : 'border-nexus-line text-nexus-muted hover:border-nexus-lime/40 hover:text-nexus-text'
                    ].join(' ')}
                  >
                    {champion.name}
                  </button>
                )
              })}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <MicroLabel className="mb-1.5 block">Your role</MicroLabel>
              <select
                value={myRole}
                onChange={(event) => setMyRole(event.target.value as RoleKey)}
                className="nexus-focus w-full border border-nexus-line bg-nexus-bg/60 px-3 py-2 font-mono text-sm text-nexus-text"
              >
                {ROLE_OPTIONS.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <MicroLabel className="mb-1.5 block">Enemy role</MicroLabel>
              <select
                value={opposingRole}
                onChange={(event) => setOpposingRole(event.target.value as RoleKey)}
                className="nexus-focus w-full border border-nexus-line bg-nexus-bg/60 px-3 py-2 font-mono text-sm text-nexus-text"
              >
                {ROLE_OPTIONS.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            {(['worst', 'best'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setSortMode(mode)}
                className={[
                  'nexus-focus border px-3 py-1.5 font-mono text-xs uppercase tracking-[0.12em]',
                  sortMode === mode
                    ? 'border-nexus-lime/70 bg-nexus-lime/15 text-nexus-lime'
                    : 'border-nexus-line text-nexus-muted'
                ].join(' ')}
              >
                {mode === 'worst' ? 'Worst for you' : 'Best for you'}
              </button>
            ))}
          </div>
        </div>

        <div className="border border-nexus-line bg-nexus-bg/35 min-h-[220px]">
          <div className="flex items-center justify-between gap-2 border-b border-nexus-line px-3 py-2">
            <MicroLabel>
              {selected ? `${selected.name} · ${myRole} vs ${opposingRole}` : 'Select a champion'}
            </MicroLabel>
            <span className="font-mono text-[11px] text-nexus-muted tabular-nums">{rows.length} matchups</span>
          </div>
          <ul className="max-h-[360px] overflow-auto divide-y divide-nexus-line/50">
            {rows.length === 0 && (
              <li className="px-3 py-6 font-mono text-sm text-nexus-muted">
                {selectedId == null
                  ? 'Choose a champion to load Emerald+ lane matchups.'
                  : 'No counter samples for this role pair in the current public seed.'}
              </li>
            )}
            {rows.map((row) => {
              const enemy = championById.get(row.enemyId)
              const src = iconUrl(row.enemyId)
              const favorable = row.winRate >= 0.5
              return (
                <li key={row.enemyId} className="flex items-center gap-3 px-3 py-2">
                  {src ? (
                    <img src={src} alt="" className="h-8 w-8 border border-nexus-line/70 bg-nexus-surface object-cover" />
                  ) : (
                    <span className="h-8 w-8 border border-nexus-line/70 bg-nexus-surface" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-sm text-nexus-text">
                      {enemy?.name ?? `Champion ${row.enemyId}`}
                      {!row.candidate && <span className="ml-2 text-[10px] uppercase text-nexus-muted">flex</span>}
                    </div>
                    <div className="font-mono text-[11px] text-nexus-muted tabular-nums">{row.games} games</div>
                  </div>
                  <div
                    className={[
                      'font-mono text-sm tabular-nums',
                      favorable ? 'text-nexus-lime' : 'text-nexus-yellow'
                    ].join(' ')}
                    title={`Raw ${formatPct(row.rawWinRate)}`}
                  >
                    {formatPct(row.winRate)}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </NexusPanel>
  )
}
