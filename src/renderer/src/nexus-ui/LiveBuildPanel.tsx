import { useMemo, useState, type ReactNode } from 'react'
import type { CatalogItem } from '@shared/dataDragon'
import {
  bestBuildRoleForChampion,
  buildLiveAdvice,
  formatGameClock,
  getChampionBuildPath,
  liveNeedLabel,
  type ChampionBuildPath,
  type DraftRole,
  type EnemyPurchase,
  type LiveBuildAdvice,
  type LiveGamePlayer,
  type LiveGameSnapshot,
  type LiveGameStatus,
  type LiveThreat
} from '@shared/draft'
import { DEFAULT_OVERLAY_LAYOUT, type LiveBlock, type OverlayLayout } from '@shared/overlayLayout'
import { useBuildSeedRevision } from '../builds/useBuildData'
import { BuildItemIcon } from './BuildItemIcon'
import { itemName, ROLE_LABEL } from './buildLabels'
import { ChampionBuildPathView } from './ChampionBuildPathView'
import { NexusInfoTip } from './NexusInfoTip'

/**
 * In-game glance view, split into sections ("blocks") the player places in the main overlay
 * or in floating boxes. Each block is a line or two so a one-second peek needs no scrolling.
 */

/** Purchases this recent get highlighted on the enemy's item row. */
const FRESH_PURCHASE_SECONDS = 90
/** Purchases this recent show as chips next to the Enemy label. */
const NEW_BUY_CHIP_SECONDS = 180

type IconUrl = (id: number | null | undefined) => string | null
type Catalog = ReadonlyMap<number, CatalogItem> | null

export type LiveView = {
  snapshot: LiveGameSnapshot
  me: LiveGamePlayer | null
  onRift: boolean
  role: DraftRole | null
  path: ChampionBuildPath | null
  advice: LiveBuildAdvice | null
  freshByChampion: Map<string, Set<number>>
  recentBuys: EnemyPurchase[]
}

/** Everything the blocks need, computed once per live update. */
export function useLiveView(status: LiveGameStatus | null, catalog: Catalog, purchases: readonly EnemyPurchase[]): LiveView | null {
  const snapshot = status?.state === 'in-game' ? status.snapshot : null
  const me = snapshot?.players.find((p) => p.isActive) ?? null
  const onRift = snapshot?.mapNumber == null || snapshot.mapNumber === 11
  const role = me ? (me.role !== 'unknown' ? me.role : me.championId != null ? bestBuildRoleForChampion(me.championId) : null) : null
  // The full paths load lazily (and can be replaced by a live refresh): recompute when they land.
  const seedRevision = useBuildSeedRevision()
  const path = useMemo(
    () => (me?.championId != null && role && onRift ? getChampionBuildPath(me.championId, role, catalog) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [me?.championId, role, onRift, catalog, seedRevision]
  )
  const advice = useMemo(
    () => (snapshot && catalog && onRift ? buildLiveAdvice({ snapshot, path, catalog }) : null),
    [snapshot, path, catalog, onRift]
  )
  return useMemo(() => {
    if (!snapshot) {
      return null
    }
    const freshByChampion = new Map<string, Set<number>>()
    for (const purchase of purchases) {
      if (snapshot.gameTime - purchase.gameTime <= FRESH_PURCHASE_SECONDS) {
        const set = freshByChampion.get(purchase.championName) ?? new Set<number>()
        set.add(purchase.itemId)
        freshByChampion.set(purchase.championName, set)
      }
    }
    const recentBuys = purchases.filter((p) => snapshot.gameTime - p.gameTime <= NEW_BUY_CHIP_SECONDS)
    return { snapshot, me, onRift, role, path, advice, freshByChampion, recentBuys }
  }, [snapshot, me, onRift, role, path, advice, purchases])
}

function gold(n: number): string {
  return `${Math.round(n).toLocaleString('en-US')}g`
}

/** Left-hand label column, like the build path rows, so sections need no title lines. */
function Line({ label, aside, children }: { label: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[46px] shrink-0 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-nexus-lime/90">{label}</span>
      <div className="flex min-w-0 flex-1 items-center gap-1">{children}</div>
      {aside ? <span className="shrink-0 font-mono text-[10px] tabular-nums text-nexus-muted">{aside}</span> : null}
    </div>
  )
}

function NextBuy({ advice, version, catalog }: { advice: LiveBuildAdvice; version: string; catalog: Catalog }) {
  const next = advice.next
  if (!next) {
    return (
      <div className="border border-nexus-lime/50 bg-nexus-lime/10 px-2 py-1.5 font-mono text-xs text-nexus-lime">
        Build complete — sell your starter, or buy the swap below.
      </div>
    )
  }
  const have = Math.min(next.gold, next.remainingCost)
  const pct = next.remainingCost > 0 ? Math.round((have / next.remainingCost) * 100) : 100
  const buyingWhole = next.buyNow.length === 1 && next.buyNow[0]!.itemId === next.itemId
  const usesTip = next.ownedComponents.length ? ` Uses your ${next.ownedComponents.map((id) => itemName(catalog, id)).join(', ')}.` : ''
  return (
    <div
      className={[
        'border px-2 py-1.5',
        next.affordable ? 'border-nexus-lime/70 bg-nexus-lime/10 shadow-[0_0_14px_color-mix(in_srgb,var(--nexus-lime)_18%,transparent)]' : 'border-nexus-yellow/55 bg-nexus-yellow/[0.07]'
      ].join(' ')}
      title={`${itemName(catalog, next.itemId)}: ${gold(next.remainingCost)} left to pay.${usesTip}`}
    >
      <div className="flex items-center gap-2">
        <BuildItemIcon itemId={next.itemId} version={version} catalog={catalog} size={30} state="next" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5 font-mono">
            <span className="shrink-0 text-[10px] uppercase tracking-[0.12em] text-nexus-muted">{next.affordable ? 'Buy' : 'Next'}</span>
            <span className="min-w-0 truncate text-sm font-bold text-nexus-text">{itemName(catalog, next.itemId)}</span>
            <span className={['ml-auto shrink-0 text-[11px] tabular-nums', next.affordable ? 'text-nexus-lime' : 'text-nexus-muted'].join(' ')}>
              {next.affordable ? 'affordable' : `${gold(next.gold)} / ${gold(next.remainingCost)}`}
            </span>
          </div>
          <div className="mt-1 h-1 w-full bg-nexus-bg/70" aria-hidden>
            <div className={['h-full', next.affordable ? 'bg-nexus-lime' : 'bg-nexus-yellow/80'].join(' ')} style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
      {(!buyingWhole && next.buyNow.length > 0) || next.thenItemId != null ? (
        <div className="mt-1 flex items-center gap-1 font-mono text-[10px] text-nexus-muted">
          {!buyingWhole && next.buyNow.length > 0 ? (
            <>
              <span className="uppercase tracking-[0.1em] text-nexus-lime/85">Buy now</span>
              {next.buyNow.map((row) => (
                <BuildItemIcon
                  key={`buy-${row.itemId}`}
                  itemId={row.itemId}
                  version={version}
                  catalog={catalog}
                  size={18}
                  title={`${itemName(catalog, row.itemId)} (${gold(row.cost)})`}
                />
              ))}
              <span className="tabular-nums">{gold(next.buyNow.reduce((sum, row) => sum + row.cost, 0))}</span>
            </>
          ) : null}
          {next.thenItemId != null ? (
            <span className="ml-auto flex min-w-0 items-center gap-1">
              <span className="uppercase tracking-[0.1em]">Then</span>
              <BuildItemIcon itemId={next.thenItemId} version={version} catalog={catalog} size={18} />
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function damageTone(damage: LiveThreat['damage']): string {
  return damage === 'AD'
    ? 'border-orange-300/60 text-orange-200'
    : damage === 'AP'
      ? 'border-sky-300/60 text-sky-200'
      : damage === 'tank'
        ? 'border-nexus-muted/50 text-nexus-muted'
        : 'border-violet-300/60 text-violet-200'
}

/** One enemy on one line: portrait, KDA, damage type, fed flag, items (new ones glow), gold. */
function EnemyLine({
  threat,
  version,
  catalog,
  iconUrl,
  freshItems
}: {
  threat: LiveThreat
  version: string
  catalog: Catalog
  iconUrl: IconUrl
  freshItems?: ReadonlySet<number>
}) {
  const icon = iconUrl(threat.championId)
  const tip = [threat.championName, `${threat.kills}/${threat.deaths}/${threat.assists}`, `Lv ${threat.level}`, ...threat.notes].join(' · ')
  return (
    <li
      className={['flex items-center gap-1.5 border px-1 py-[2px]', threat.fed ? 'border-nexus-red/60 bg-nexus-red/10' : 'border-nexus-line/60 bg-nexus-bg/25'].join(' ')}
      title={tip}
    >
      {icon ? (
        <img className="h-6 w-6 shrink-0 border border-nexus-line/70 object-cover" src={icon} alt={threat.championName} width={24} height={24} />
      ) : (
        <span className="w-14 shrink-0 truncate font-mono text-[10px] text-nexus-text">{threat.championName}</span>
      )}
      <span className="w-[42px] shrink-0 font-mono text-[11px] tabular-nums text-nexus-text/90">
        {threat.kills}/{threat.deaths}/{threat.assists}
      </span>
      <span className={['shrink-0 border px-[3px] font-mono text-[9px] uppercase leading-[13px]', damageTone(threat.damage)].join(' ')}>
        {threat.damage}
      </span>
      {threat.fed ? (
        <span className="shrink-0 border border-nexus-red/70 px-[3px] font-mono text-[9px] uppercase leading-[13px] text-nexus-red">Fed</span>
      ) : null}
      <span className="flex min-w-0 flex-1 items-center gap-[2px] overflow-hidden">
        {threat.items.slice(0, 6).map((id, idx) => (
          <BuildItemIcon
            key={`${threat.championName}-${id}-${idx}`}
            itemId={id}
            version={version}
            catalog={catalog}
            size={16}
            isNew={freshItems?.has(id) ?? false}
          />
        ))}
      </span>
      <span className="shrink-0 font-mono text-[10px] tabular-nums text-nexus-muted">{(threat.itemGold / 1000).toFixed(1)}k</span>
    </li>
  )
}

/** Latest enemy buys as compact chips; hover for "Zed finished Edge of Night at 18:00". */
function NewBuys({ purchases, version, catalog, iconUrl }: { purchases: readonly EnemyPurchase[]; version: string; catalog: Catalog; iconUrl: IconUrl }) {
  return (
    <span className="flex min-w-0 items-center gap-1 overflow-hidden">
      {purchases.slice(0, 3).map((purchase) => {
        const champ = iconUrl(purchase.championId)
        return (
          <span
            key={purchase.id}
            className="inline-flex shrink-0 items-center border border-nexus-yellow/50 bg-nexus-yellow/[0.08] p-[1px]"
            title={`${purchase.championName} ${purchase.finished ? 'finished' : 'bought'} ${itemName(catalog, purchase.itemId)} at ${formatGameClock(purchase.gameTime)}`}
          >
            {champ ? <img className="h-4 w-4" src={champ} alt="" width={16} height={16} /> : null}
            <BuildItemIcon itemId={purchase.itemId} version={version} catalog={catalog} size={14} title={itemName(catalog, purchase.itemId)} />
          </span>
        )
      })}
    </span>
  )
}

/** Clock, champion, level, skill order and gold on one line. */
export function LiveStatusLine({ view, showSkills, onCustomize }: { view: LiveView; showSkills: boolean; onCustomize?: () => void }) {
  const { snapshot, me, role, advice } = view
  return (
    <div className="flex items-center gap-1.5 font-mono text-[11px]">
      <span className="inline-flex items-center gap-1 border border-nexus-red/60 bg-nexus-red/10 px-1 uppercase tracking-[0.12em] text-nexus-red">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-nexus-red" aria-hidden />
        Live
      </span>
      <span className="tabular-nums text-nexus-text/90">{formatGameClock(snapshot.gameTime)}</span>
      {me ? (
        <span className="min-w-0 truncate text-nexus-muted">
          {me.championName}
          {role ? ` ${ROLE_LABEL[role] ?? role}` : ''} · Lv {snapshot.activeLevel ?? me.level}
        </span>
      ) : (
        <span className="text-nexus-muted">Spectating</span>
      )}
      {showSkills && advice?.skillPriority.length ? (
        <span className="shrink-0 border border-nexus-lime/40 px-1 font-bold tracking-[0.12em] text-nexus-lime" title="Skill max order">
          {advice.skillPriority.join('>')}
        </span>
      ) : null}
      {snapshot.activeGold != null ? <span className="ml-auto shrink-0 font-bold tabular-nums text-nexus-yellow">{gold(snapshot.activeGold)}</span> : null}
      {onCustomize ? (
        <button
          type="button"
          className={[
            'nexus-focus shrink-0 border border-nexus-line px-1 text-[11px] leading-[16px] text-nexus-muted hover:border-nexus-lime/50 hover:text-nexus-text',
            snapshot.activeGold == null ? 'ml-auto' : ''
          ].join(' ')}
          title="Choose what shows, in the overlay or in your own boxes"
          aria-label="Customize in-game view"
          onClick={onCustomize}
        >
          ⚙
        </button>
      ) : null}
    </div>
  )
}

/** Renders the given sections in order. Shared by the main overlay and the floating boxes. */
export function LiveBlocks({
  view,
  blocks,
  showNewBuys,
  version,
  catalog,
  iconUrl
}: {
  view: LiveView
  blocks: readonly LiveBlock[]
  showNewBuys: boolean
  version: string
  catalog: Catalog
  iconUrl: IconUrl
}) {
  const { snapshot, path, advice, freshByChampion, recentBuys, me, onRift } = view
  const render = (block: LiveBlock): ReactNode => {
    switch (block) {
      case 'next':
        return advice ? <NextBuy key="next" advice={advice} version={version} catalog={catalog} /> : null
      case 'build':
        return advice ? (
          <Line key="build" label="Build" aside={`${advice.completedCount}/6`}>
            {advice.build.map((slot) => (
              <BuildItemIcon
                key={`slot-${slot.itemId}`}
                itemId={slot.itemId}
                version={version}
                catalog={catalog}
                size={24}
                state={slot.status}
                swapped={Boolean(slot.swapReason)}
                badge={slot.status === 'owned' ? '✓' : undefined}
                title={`${itemName(catalog, slot.itemId)}${slot.status === 'owned' ? ' — owned' : slot.status === 'building' ? ' — components owned' : ''}${slot.offPath ? ' (your pick)' : ''}${slot.swapReason ? ` — ${slot.swapReason}` : ''}`}
              />
            ))}
            {!path ? <span className="truncate font-mono text-[10px] text-nexus-muted">no tracked build</span> : null}
          </Line>
        ) : null
      case 'adapt':
        return advice && advice.swaps.length ? (
          <div key="adapt" className="space-y-1">
            {advice.swaps.map((swap, idx) => (
              <Line key={`swap-${swap.need}-${swap.itemId}`} label={idx === 0 ? 'Adapt' : ''}>
                <span
                  className="flex min-w-0 flex-1 items-center gap-1.5 border border-nexus-yellow/40 bg-nexus-yellow/[0.06] px-1 py-[2px] font-mono text-[11px]"
                  title={`${swap.detail}.${swap.replaces != null ? ` Instead of ${itemName(catalog, swap.replaces)}.` : ' Already in your build: get it sooner.'}`}
                >
                  <BuildItemIcon itemId={swap.itemId} version={version} catalog={catalog} size={18} swapped />
                  <span className="min-w-0 truncate">
                    <b className="text-nexus-text">{itemName(catalog, swap.itemId)}</b>
                    <span className="text-nexus-yellow"> {liveNeedLabel(swap.need).toLowerCase()}</span>
                    {swap.because.length ? <span className="text-nexus-muted"> vs {swap.because.join(', ')}</span> : null}
                  </span>
                  {swap.rushComponent != null ? (
                    <span className="ml-auto flex shrink-0 items-center gap-0.5 text-[10px] text-nexus-lime/90" title={`Rush ${itemName(catalog, swap.rushComponent)}`}>
                      rush
                      <BuildItemIcon itemId={swap.rushComponent} version={version} catalog={catalog} size={14} />
                    </span>
                  ) : null}
                </span>
              </Line>
            ))}
          </div>
        ) : advice ? (
          <Line key="adapt" label="Adapt">
            <span className="font-mono text-[10px] text-nexus-muted">No swaps needed yet</span>
          </Line>
        ) : null
      case 'enemy':
        return (
          <div key="enemy">
            <div className="mb-1 flex items-center gap-1.5">
              <span className="w-[46px] shrink-0 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-nexus-lime/90">Enemy</span>
              {advice ? (
                <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[10px] tabular-nums text-nexus-muted">
                  {Math.round(advice.enemyDamage.ad * 100)}% AD
                  <NexusInfoTip label="About the enemy read">
                    Their damage split, items, KDA and gold come from the live scoreboard (what holding Tab shows) and update
                    every couple of seconds. Items they bought in the last 90 seconds glow; the chips on the right are their
                    latest buys (potions, wards and trinkets left out).
                  </NexusInfoTip>
                </span>
              ) : null}
              {showNewBuys && recentBuys.length ? (
                <span className="ml-auto flex min-w-0 items-center gap-1">
                  <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.1em] text-nexus-yellow/90">New</span>
                  <NewBuys purchases={recentBuys} version={version} catalog={catalog} iconUrl={iconUrl} />
                </span>
              ) : null}
            </div>
            <ul className="m-0 list-none space-y-[3px] p-0">
              {(advice?.threats ?? []).map((threat) => (
                <EnemyLine
                  key={`threat-${threat.championName}`}
                  threat={threat}
                  version={version}
                  catalog={catalog}
                  iconUrl={iconUrl}
                  freshItems={freshByChampion.get(threat.championName)}
                />
              ))}
              {!advice
                ? snapshot.players
                    .filter((p) => (snapshot.activeTeam ? p.team !== snapshot.activeTeam : p.team === 'CHAOS'))
                    .map((p) => (
                      <li key={`enemy-${p.championName}`} className="font-mono text-xs text-nexus-muted">
                        {p.championName} {p.kills}/{p.deaths}/{p.assists}
                      </li>
                    ))
                : null}
            </ul>
          </div>
        )
    }
  }
  return (
    <>
      {!advice && me && onRift ? <p className="m-0 font-mono text-[11px] text-nexus-muted">Loading item data…</p> : null}
      {blocks.map(render)}
    </>
  )
}

/** The main overlay's in-game view: status line, its sections, and the optional extras. */
export function LiveBuildPanel({
  status,
  version,
  catalog,
  iconUrl,
  purchases = [],
  lookup,
  layout = DEFAULT_OVERLAY_LAYOUT,
  onCustomize
}: {
  status: LiveGameStatus
  version: string
  catalog: Catalog
  iconUrl: IconUrl
  /** Enemy purchases diffed from successive live updates (newest first). */
  purchases?: readonly EnemyPurchase[]
  /** "Other champion" lookup, shown only when asked for. */
  lookup?: ReactNode
  layout?: OverlayLayout
  /** Opens the layout customizer. */
  onCustomize?: () => void
}) {
  const view = useLiveView(status, catalog, purchases)
  const [more, setMore] = useState<'build' | 'lookup' | null>(null)
  if (status.state === 'loading') {
    return <p className="m-0 font-mono text-xs text-nexus-muted">Game is loading… build help appears once you are on the map.</p>
  }
  if (!view) {
    return null
  }
  const { snapshot, me, path, onRift } = view
  const inBoxes = layout.boxes.reduce((sum, box) => sum + box.blocks.length, 0)
  return (
    <div className="space-y-1.5">
      <LiveStatusLine view={view} showSkills={layout.showSkills} onCustomize={onCustomize} />
      {!onRift ? (
        <p className="m-0 border border-nexus-line/70 bg-nexus-bg/25 px-2 py-1 font-mono text-[11px] text-nexus-muted">
          {snapshot.gameMode}: build paths are for Summoner&apos;s Rift, so only the enemy read is shown.
        </p>
      ) : null}
      <LiveBlocks view={view} blocks={layout.main} showNewBuys={layout.showNewBuys} version={version} catalog={catalog} iconUrl={iconUrl} />
      {layout.main.length === 0 ? (
        <p className="m-0 font-mono text-[11px] text-nexus-muted">
          {inBoxes ? 'Shown in your boxes' : 'All sections hidden'} · ⚙ to change
        </p>
      ) : null}

      {path || lookup ? (
        <div className="flex gap-1.5">
          {path ? (
            <button
              type="button"
              aria-expanded={more === 'build'}
              className={[
                'nexus-focus flex-1 border px-2 py-[3px] font-mono text-[10px] uppercase tracking-[0.12em]',
                more === 'build' ? 'border-nexus-lime bg-nexus-lime/10 text-nexus-lime' : 'border-nexus-line text-nexus-muted hover:text-nexus-text'
              ].join(' ')}
              onClick={() => setMore((m) => (m === 'build' ? null : 'build'))}
            >
              Full {me?.championName ?? ''} build {more === 'build' ? '▴' : '▾'}
            </button>
          ) : null}
          {lookup ? (
            <button
              type="button"
              aria-expanded={more === 'lookup'}
              className={[
                'nexus-focus flex-1 border px-2 py-[3px] font-mono text-[10px] uppercase tracking-[0.12em]',
                more === 'lookup' ? 'border-nexus-lime bg-nexus-lime/10 text-nexus-lime' : 'border-nexus-line text-nexus-muted hover:text-nexus-text'
              ].join(' ')}
              onClick={() => setMore((m) => (m === 'lookup' ? null : 'lookup'))}
            >
              Other champion {more === 'lookup' ? '▴' : '▾'}
            </button>
          ) : null}
        </div>
      ) : null}
      {more === 'build' && path ? (
        <ChampionBuildPathView path={path} version={version} catalog={catalog} championName={me?.championName ?? 'Champion'} />
      ) : null}
      {more === 'lookup' ? lookup : null}
    </div>
  )
}
