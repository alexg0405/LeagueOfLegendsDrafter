import { useEffect, useState, type ReactNode } from 'react'

export type WebRoute = 'draft' | 'suggestions'

const VISITOR_COUNTER_URL = '/api/visit'

/** Solid dark fill + [color-scheme:dark] so native selects/inputs do not render as light system panels. */
export const webFieldClass =
  'nexus-focus w-full rounded-md border border-white/[0.1] bg-[#0b1c16] text-[#e8f3ee] [color-scheme:dark] font-mono text-sm py-2.5 px-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] placeholder:text-nexus-muted/55 focus:border-nexus-lime/40 focus:outline-none focus:ring-1 focus:ring-nexus-lime/15 disabled:opacity-45'
export const webFieldClassCompact = `${webFieldClass} py-2 text-xs`
export const buttonClass =
  'nexus-focus inline-flex items-center justify-center font-display text-xs sm:text-sm tracking-[0.16em] uppercase px-5 py-2.5 border border-nexus-lime bg-nexus-lime text-nexus-bg border-nexus-lime/90 shadow-[0_0_24px_rgba(35,213,176,0.18)] hover:brightness-110 active:brightness-95 disabled:opacity-40'
export const solidGlitchCtaClass = `${buttonClass} nexus-glitch-cta nexus-glitch-cta--solid`
export const outlineGlitchCtaClass =
  'nexus-focus nexus-glitch-cta nexus-glitch-cta--outline inline-flex items-center justify-center border border-nexus-line px-5 py-2.5 font-display text-xs sm:text-sm tracking-[0.16em] uppercase text-nexus-lime/90 hover:border-nexus-lime/60 hover:bg-nexus-lime/10'

export function readWebRoute(): WebRoute {
  if (typeof window === 'undefined') {
    return 'draft'
  }
  const path = window.location.pathname.replace(/\/+$/, '')
  return path.endsWith('/ask') || path.endsWith('/suggestions') ? 'suggestions' : 'draft'
}

export function WebPageShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen overflow-hidden [color-scheme:dark] bg-[radial-gradient(circle_at_20%_0%,rgba(35,213,176,0.14),transparent_32%),radial-gradient(circle_at_80%_10%,rgba(83,166,255,0.1),transparent_28%),linear-gradient(180deg,var(--nexus-bg),#03100c)] text-nexus-text font-body antialiased flex flex-col">
      <div className="nexus-noise fixed inset-0 pointer-events-none opacity-60" aria-hidden />
      <div className="pointer-events-none fixed inset-x-0 top-0 h-px bg-nexus-lime/70 shadow-[0_0_24px_rgba(35,213,176,0.7)]" aria-hidden />
      {children}
    </div>
  )
}

export function VisitorCounter({ dataLine, legalLine }: { dataLine?: string | null; legalLine?: string }) {
  const [count, setCount] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const domain = typeof window === 'undefined' ? 'nexus-draft' : window.location.hostname || 'nexus-draft'
    const body = {
      domain,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      page_path: typeof window === 'undefined' ? '/' : window.location.pathname,
      page_title: typeof document === 'undefined' ? 'Nexus Draft' : document.title,
      referrer: typeof document === 'undefined' ? '' : document.referrer
    }
    void fetch(VISITOR_COUNTER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`visitor counter ${res.status}`)
        }
        return res.json() as Promise<{ totalCount?: number; todayCount?: number }>
      })
      .then((data) => {
        setCount(typeof data.totalCount === 'number' ? data.totalCount : null)
      })
      .catch(() => {
        setFailed(true)
      })
  }, [])

  return (
    <div className="border-t border-nexus-line bg-nexus-surface-2/90 px-4 py-3 font-mono text-xs text-nexus-muted">
      <div className="mx-auto max-w-6xl">
        {dataLine ? (
          <p className="m-0 mb-2 text-[11px] leading-relaxed text-nexus-muted/95" title="Riot client patch (Data Dragon) and recommendation engine label.">
            {dataLine}
          </p>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <span>Nexus Draft web</span>
          <span className="text-nexus-lime/85" title="Total page visits recorded for this hosted web app.">
            Total visits: {count != null ? count.toLocaleString() : failed ? 'unavailable' : 'loading'}
          </span>
        </div>
        {legalLine ? <p className="m-0 mt-2 max-w-3xl text-[10px] leading-relaxed text-nexus-muted/80">{legalLine}</p> : null}
      </div>
    </div>
  )
}
