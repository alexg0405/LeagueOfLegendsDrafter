import { useEffect, useMemo, useState } from 'react'
import { ddragonChampionImageUrl, getLatestDDragonVersion } from '@shared/dataDragon'
import { bundledChampionByKeyOrName, bundledChampions, buildSeedInfo } from '@shared/draft'
import { MicroLabel, NexusPanel } from '../nexus-ui'
import { ChampionBuildBrowser } from '../nexus-ui/ChampionBuildBrowser'
import { usableDdragonVersion, useBuildSeedRevision, useItemCatalog } from '../builds/useBuildData'
import { outlineGlitchCtaClass, solidGlitchCtaClass, WebPageShell } from './webUi'

/** `/builds?champion=Ahri` opens straight on a champion (key or display name). */
function championFromUrl(): number | null {
  if (typeof window === 'undefined') {
    return null
  }
  const raw = new URLSearchParams(window.location.search).get('champion')
  return bundledChampionByKeyOrName(raw)?.id ?? null
}

export function WebBuildsPage({
  onNavigateDraft,
  exeUrl,
  exeFile
}: {
  onNavigateDraft: () => void
  exeUrl: string
  exeFile: string
}) {
  const [ddVersion, setDdVersion] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    void getLatestDDragonVersion()
      .then((v) => {
        if (!cancelled) setDdVersion(v)
      })
      .catch(() => {
        /* bundled seed version is the fallback */
      })
    return () => {
      cancelled = true
    }
  }, [])
  useBuildSeedRevision()
  const version = usableDdragonVersion(ddVersion)
  const catalog = useItemCatalog(ddVersion)
  const champions = useMemo(() => bundledChampions().slice().sort((a, b) => a.name.localeCompare(b.name)), [])
  const keyById = useMemo(() => new Map(champions.map((c) => [c.id, c.key] as const)), [champions])
  const [initialChampion] = useState(championFromUrl)
  const info = buildSeedInfo()
  const iconUrl = (id: number | null | undefined) => {
    const key = id != null ? keyById.get(id) : undefined
    return key ? ddragonChampionImageUrl(version, key) : null
  }

  return (
    <WebPageShell>
      <main id="nexus-web-main" className="relative mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:px-6 lg:px-8">
        <section className="nexus-command-deck relative mb-5 overflow-hidden border border-nexus-line bg-nexus-surface-2/90 p-5 shadow-[0_20px_80px_rgba(0,0,0,0.28)]">
          <div className="absolute inset-0 bg-[linear-gradient(110deg,color-mix(in_srgb,var(--nexus-lime)_12%,transparent),transparent_35%,color-mix(in_srgb,var(--nexus-blue)_8%,transparent))]" aria-hidden />
          <div className="relative">
            <MicroLabel className="text-nexus-lime/80">builds // patch {info.statsPatch}</MicroLabel>
            <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h1 className="font-display text-5xl leading-none tracking-[0.06em] text-nexus-text drop-shadow-[0_0_18px_color-mix(in_srgb,var(--nexus-text)_10%,transparent)] sm:text-7xl">
                  BUILD <span className="text-nexus-lime">PATHS</span>
                </h1>
                <p className="mt-3 max-w-2xl font-mono text-sm leading-relaxed text-nexus-muted">
                  What to build on every champion this patch: core items in buy order, the best 4th-6th items with their
                  win rates, skill order and runes.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  className={outlineGlitchCtaClass}
                  data-glitch-label="Draft Lab"
                  href="/"
                  onClick={(event) => {
                    event.preventDefault()
                    onNavigateDraft()
                  }}
                >
                  Draft Lab
                </a>
                <a className={solidGlitchCtaClass} data-glitch-label="Get the Windows app" href={exeUrl} download={exeFile}>
                  Get the Windows app
                </a>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <NexusPanel kicker="champion" title="Build path" accent>
            <ChampionBuildBrowser
              champions={champions}
              focusChampionId={initialChampion ?? 103}
              preferredRole={null}
              version={version}
              catalog={catalog}
              iconUrl={iconUrl}
              dense={false}
            />
          </NexusPanel>
          <div>
            <NexusPanel kicker="in game" title="Live build help">
              <p className="m-0 font-mono text-xs leading-relaxed text-nexus-muted">
                The Windows app reads your game through Riot&apos;s Live Client Data API. Open the overlay mid-game to see the
                next item to buy with the gold you have, your build with owned items ticked, and swaps for what the enemy
                team is building: anti-heal into healers, penetration into armor or MR stacking, defense against whoever is fed.
              </p>
            </NexusPanel>
            <NexusPanel kicker="data" title="Source">
              <p className="m-0 font-mono text-xs leading-relaxed text-nexus-muted">
                U.GG public stats, world Emerald+, patch {info.statsPatch}
                {info.updatedAt ? `, refreshed ${info.updatedAt}` : ''}. Roles with few games fall back to Platinum+ or all ranks
                and are flagged. Not endorsed by Riot Games.
              </p>
            </NexusPanel>
          </div>
        </div>
      </main>
    </WebPageShell>
  )
}
