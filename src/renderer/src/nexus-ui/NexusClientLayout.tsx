import type { ReactNode } from 'react'
import { NexusBottomActionBar } from './NexusBottomActionBar'
import { NexusRightColumn } from './NexusRightColumn'
import { NexusSidebar, type NexusNavId } from './NexusSidebar'
import { NexusTopBar } from './NexusTopBar'

type Props = {
  /** Current main route */
  nav: NexusNavId
  onNavigate: (id: NexusNavId) => void
  top: {
    runnerId: string
    region: string
    dataVersion: string
    build: string
    networkStatus: string
    link?: string
    resourceLine?: string
    onCloseApp?: () => void
    onMinimizeApp?: () => void
  }
  right: {
    lcuState: string
    draftSource: string
    hasDraftBoard: boolean
    modelLabel: string
    queueLine?: string
  }
  bottom: {
    primaryLabel: string
    onPrimary?: () => void
    secondaryLabel?: string
    onSecondary?: () => void
    statusLine: string
    estWait?: string
    platform: string
  }
  children: ReactNode
}

export function NexusClientLayout({ nav, onNavigate, top, right, bottom, children }: Props) {
  return (
    <div className="h-full min-h-0 flex bg-nexus-bg text-nexus-text font-body text-base antialiased relative overflow-hidden">
      <div className="nexus-noise pointer-events-none absolute inset-0 z-0" aria-hidden />
      <NexusSidebar active={nav} onNavigate={onNavigate} />
      <div className="flex-1 min-w-0 min-h-0 flex flex-col relative z-10">
        <NexusTopBar
          runnerId={top.runnerId}
          region={top.region}
          dataVersion={top.dataVersion}
          build={top.build}
          networkStatus={top.networkStatus}
          link={top.link}
          resourceLine={top.resourceLine}
          onMinimizeApp={top.onMinimizeApp}
          onCloseApp={top.onCloseApp}
        />
        <div className="flex-1 min-h-0 flex">
          <main className="flex-1 min-w-0 min-h-0 overflow-y-auto nexus-ops-scroll bg-nexus-bg" role="main">
            {children}
          </main>
          <NexusRightColumn
            lcuState={right.lcuState}
            draftSource={right.draftSource}
            hasDraftBoard={right.hasDraftBoard}
            modelLabel={right.modelLabel}
            queueLine={right.queueLine}
          />
        </div>
        <NexusBottomActionBar
          primaryLabel={bottom.primaryLabel}
          onPrimary={bottom.onPrimary}
          secondaryLabel={bottom.secondaryLabel}
          onSecondary={bottom.onSecondary}
          statusLine={bottom.statusLine}
          estWait={bottom.estWait}
          platform={bottom.platform}
        />
      </div>
    </div>
  )
}
