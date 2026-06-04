import type { ReactNode } from 'react'
import { WebPageShell } from './webUi'

export function WebDraftLabPage({ children }: { children: ReactNode }) {
  return <WebPageShell>{children}</WebPageShell>
}
