import type { ReactNode } from 'react'
import { ddragonRuneImageUrl, ddragonSummonerSpellImageUrl, type CatalogItem } from '@shared/dataDragon'
import { runeInfo, statShardName, summonerSpellInfo, type ChampionBuildPath } from '@shared/draft'
import { BuildItemIcon } from './BuildItemIcon'
import { itemName, ROLE_LABEL } from './buildLabels'
import { NexusInfoTip } from './NexusInfoTip'

const RANK_LABEL: Record<string, string> = {
  emerald_plus: 'Emerald+',
  platinum_plus: 'Platinum+',
  overall: 'All ranks'
}

function compact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) {
    return '--'
  }
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

function Row({ label, tip, children }: { label: string; tip?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-2 flex w-[52px] shrink-0 items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em] text-nexus-muted">
        {label}
        {tip ? <NexusInfoTip label={`About ${label}`}>{tip}</NexusInfoTip> : null}
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-start gap-1.5">{children}</div>
    </div>
  )
}

function Arrow() {
  return (
    <span className="mt-2.5 font-mono text-[10px] text-nexus-lime/70" aria-hidden>
      ›
    </span>
  )
}

/** Count duplicates so "Health Potion, Health Potion" shows as one icon with x2. */
function stacked(ids: readonly number[]): { itemId: number; count: number }[] {
  const out: { itemId: number; count: number }[] = []
  for (const id of ids) {
    const row = out.find((entry) => entry.itemId === id)
    if (row) {
      row.count += 1
    } else {
      out.push({ itemId: id, count: 1 })
    }
  }
  return out
}

function SkillOrder({ skills }: { skills: NonNullable<ChampionBuildPath['skills']> }) {
  const firstThree = skills.order.slice(0, 3)
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs">
      {skills.priority.length ? (
        <span className="inline-flex items-center gap-1">
          {skills.priority.map((key, idx) => (
            <span key={`${key}-${idx}`} className="inline-flex items-center gap-1">
              <span className="inline-flex h-6 w-6 items-center justify-center border border-nexus-lime/60 bg-nexus-lime/10 font-bold text-nexus-lime">
                {key}
              </span>
              {idx < skills.priority.length - 1 ? <span className="text-nexus-muted">&gt;</span> : null}
            </span>
          ))}
        </span>
      ) : null}
      {firstThree.length ? (
        <span className="text-[10px] uppercase tracking-[0.1em] text-nexus-muted">
          Lv1-3 <span className="text-nexus-text/90">{firstThree.join(' ')}</span>
        </span>
      ) : null}
      {skills.order.length >= 6 ? (
        <NexusInfoTip label="Full skill order">
          <span className="block font-mono tracking-[0.18em]">{skills.order.join(' ')}</span>
          <span className="mt-1 block">Levels 1-{skills.order.length}. R at 6, 11, 16.</span>
        </NexusInfoTip>
      ) : null}
    </div>
  )
}

function Runes({ runes }: { runes: NonNullable<ChampionBuildPath['runes']> }) {
  const keystone = runeInfo(runes.perks[0])
  const primary = runeInfo(runes.primary)
  const sub = runeInfo(runes.sub)
  const minors = runes.perks.slice(1).map((id) => runeInfo(id)).filter((r): r is { name: string; icon: string } => r != null)
  return (
    <div className="flex min-w-0 items-center gap-2">
      {keystone ? (
        <img
          className="h-8 w-8 shrink-0 rounded-full border border-nexus-line/70 bg-nexus-bg/60"
          src={ddragonRuneImageUrl(keystone.icon)}
          alt=""
          width={32}
          height={32}
          loading="lazy"
        />
      ) : null}
      <div className="min-w-0 font-mono text-[11px] leading-snug">
        <div className="truncate font-bold text-nexus-text/95">{keystone?.name ?? 'Keystone'}</div>
        <div className="truncate text-[10px] text-nexus-muted">
          {primary?.name ?? '?'} / {sub?.name ?? '?'}
        </div>
      </div>
      <NexusInfoTip label="Full rune page">
        <span className="block">
          <b>{primary?.name}</b>: {minors.slice(0, 3).map((r) => r.name).join(', ')}
        </span>
        <span className="mt-1 block">
          <b>{sub?.name}</b>: {minors.slice(3).map((r) => r.name).join(', ')}
        </span>
        {runes.shards.length ? <span className="mt-1 block">Shards: {runes.shards.map(statShardName).join(' / ')}</span> : null}
      </NexusInfoTip>
    </div>
  )
}

function Spells({ spells, version }: { spells: number[]; version: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {spells.map((id) => {
        const info = summonerSpellInfo(id)
        return info ? (
          <img
            key={id}
            className="h-7 w-7 border border-nexus-line/70"
            src={ddragonSummonerSpellImageUrl(version, info.key)}
            alt={info.name}
            title={info.name}
            width={28}
            height={28}
            loading="lazy"
          />
        ) : null
      })}
    </span>
  )
}

/**
 * A champion's build path: start, core in buy order, 4th-6th item options with win rates,
 * skills, runes and spells. Compact enough for the 380px overlay.
 */
export function ChampionBuildPathView({
  path,
  version,
  catalog,
  championName
}: {
  path: ChampionBuildPath
  version: string
  catalog: ReadonlyMap<number, CatalogItem> | null
  championName: string
}) {
  const coreWr = path.coreWinRate != null ? `${path.coreWinRate.toFixed(1)}% WR` : null
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] uppercase tracking-[0.1em] text-nexus-muted">
        <span className="text-nexus-lime/90">Patch {path.patch}</span>
        <span className="text-nexus-line">|</span>
        <span>{RANK_LABEL[path.rank] ?? path.rank}</span>
        {path.winRate != null ? (
          <>
            <span className="text-nexus-line">|</span>
            <span className="tabular-nums text-nexus-text/90">{path.winRate.toFixed(1)}% WR</span>
          </>
        ) : null}
        <span className="text-nexus-line">|</span>
        <span className="tabular-nums">{compact(path.matches)} games</span>
        {path.sourceType === 'ugg' || path.sourceType === 'pinned' ? (
          <a
            className="nexus-focus ml-auto text-nexus-lime/80 underline-offset-2 hover:text-nexus-lime hover:underline"
            href={path.sourceUrl}
            target="_blank"
            rel="noreferrer"
            title={`Open ${championName} ${ROLE_LABEL[path.role] ?? path.role} on U.GG`}
          >
            U.GG ↗
          </a>
        ) : null}
      </div>
      {path.lowSample ? (
        <p className="m-0 border border-nexus-yellow/40 bg-nexus-yellow/10 px-2 py-1 font-mono text-[10px] text-nexus-yellow">
          Few games of {championName} {ROLE_LABEL[path.role] ?? path.role} this patch — treat as a rough guide.
        </p>
      ) : null}

      {path.startSet.length ? (
        <Row label="Start">
          {stacked(path.startSet).map(({ itemId, count }) => (
            <BuildItemIcon
              key={`start-${itemId}`}
              itemId={itemId}
              version={version}
              catalog={catalog}
              size={24}
              badge={count > 1 ? `x${count}` : undefined}
            />
          ))}
        </Row>
      ) : null}

      <Row
        label="Core"
        tip={
          <>
            The most-bought first three items, in the order players finish them
            {path.coreMatches ? ` (${compact(path.coreMatches)} games` : ''}
            {coreWr ? `, ${coreWr})` : path.coreMatches ? ')' : ''}.
          </>
        }
      >
        {path.core.map((itemId, idx) => (
          <span key={`core-${itemId}`} className="inline-flex items-start gap-1.5">
            <BuildItemIcon itemId={itemId} version={version} catalog={catalog} caption={idx === 0 ? '1st' : idx === 1 ? '2nd' : '3rd'} />
            {idx < path.core.length - 1 ? <Arrow /> : null}
          </span>
        ))}
        {coreWr ? <span className="mt-2 font-mono text-[10px] tabular-nums text-nexus-muted">{coreWr}</span> : null}
      </Row>

      {path.slots.map((slot) => (
        <Row
          key={`slot-${slot.slot}`}
          label={`${slot.slot}th`}
          tip={slot.slot === 4 ? 'Most bought options for this item slot, with their win rate and games.' : undefined}
        >
          {slot.options.slice(0, 3).map((option) => (
            <BuildItemIcon
              key={`slot-${slot.slot}-${option.itemId}`}
              itemId={option.itemId}
              version={version}
              catalog={catalog}
              size={24}
              caption={`${Math.round(option.winRate)}%`}
              title={`${itemName(catalog, option.itemId)}: ${option.winRate.toFixed(1)}% WR over ${compact(option.matches)} games`}
            />
          ))}
        </Row>
      ))}

      <Row label="Final" tip="Recommended six-item end state: the core, then the most-bought 4th-6th items.">
        {path.fullBuild.map((itemId) => (
          <BuildItemIcon key={`full-${itemId}`} itemId={itemId} version={version} catalog={catalog} size={24} />
        ))}
      </Row>

      {path.skills ? (
        <Row label="Skills">
          <SkillOrder skills={path.skills} />
        </Row>
      ) : null}

      {path.runes || path.spells.length ? (
        <Row label="Runes">
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            {path.runes ? <Runes runes={path.runes} /> : <span />}
            {path.spells.length ? <Spells spells={path.spells} version={version} /> : null}
          </div>
        </Row>
      ) : null}
    </div>
  )
}
