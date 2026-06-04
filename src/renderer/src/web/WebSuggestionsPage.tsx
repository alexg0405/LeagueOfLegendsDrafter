import { useMemo, useState, type FormEvent as ReactFormEvent } from 'react'
import type { DraftRole } from '@shared/draft'
import { MicroLabel, NexusPanel } from '../nexus-ui'
import { nexusWebTrack } from './webAnalytics'
import {
  outlineGlitchCtaClass,
  solidGlitchCtaClass,
  VisitorCounter,
  WebPageShell,
  webFieldClass
} from './webUi'

const ROLES: Exclude<DraftRole, 'unknown'>[] = ['top', 'jungle', 'middle', 'bottom', 'support']
const GITHUB_REPO_URL = 'https://github.com/alexg0405/NexusDraftFeedback'
const GITHUB_ISSUE_URL = `${GITHUB_REPO_URL}/issues/new`

const SUGGESTION_CATEGORIES = [
  { value: 'draft_advice', label: 'Draft advice' },
  { value: 'feature_idea', label: 'Feature idea' },
  { value: 'bug_report', label: 'Bug report' },
  { value: 'data_fix', label: 'Champion data fix' },
  { value: 'other', label: 'Other' }
] as const

type SuggestionCategory = (typeof SUGGESTION_CATEGORIES)[number]['value']

type SuggestionForm = {
  category: SuggestionCategory
  role: Exclude<DraftRole, 'unknown'>
  rank: string
  summoner: string
  contact: string
  message: string
  context: string
}

const EMPTY_SUGGESTION_FORM: SuggestionForm = {
  category: 'draft_advice',
  role: 'middle',
  rank: 'Diamond+',
  summoner: '',
  contact: '',
  message: '',
  context: ''
}

function roleLabel(role: DraftRole): string {
  if (role === 'bottom') {
    return 'adc'
  }
  if (role === 'middle') {
    return 'mid'
  }
  return role
}

function suggestionCategoryLabel(value: SuggestionCategory): string {
  return SUGGESTION_CATEGORIES.find((category) => category.value === value)?.label ?? 'Suggestion'
}

function compactValue(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function suggestionRequestText(form: SuggestionForm): string {
  const lines = [
    `Category: ${suggestionCategoryLabel(form.category)}`,
    `Role: ${roleLabel(form.role)}`,
    `Rank / queue: ${compactValue(form.rank) || 'Not specified'}`,
    `Summoner / region: ${compactValue(form.summoner) || 'Not specified'}`,
    `Contact: ${compactValue(form.contact) || 'Not specified'}`,
    '',
    'Suggestion:',
    form.message.trim() || 'Not specified',
    '',
    'Draft context:',
    form.context.trim() || 'Not specified'
  ]
  return lines.join('\n')
}

function suggestionIssueUrl(form: SuggestionForm): string {
  const message = compactValue(form.message)
  const titleSeed = message ? message.slice(0, 78) : suggestionCategoryLabel(form.category)
  const title = `[${suggestionCategoryLabel(form.category)}] ${titleSeed}`
  const body = [
    '## Nexus Draft suggestion',
    '',
    `**Category:** ${suggestionCategoryLabel(form.category)}`,
    `**Role:** ${roleLabel(form.role)}`,
    `**Rank / queue:** ${compactValue(form.rank) || 'Not specified'}`,
    `**Summoner / region:** ${compactValue(form.summoner) || 'Not specified'}`,
    `**Contact:** ${compactValue(form.contact) || 'Not specified'}`,
    '',
    '## Suggestion',
    '',
    form.message.trim() || 'Not specified',
    '',
    '## Draft context',
    '',
    form.context.trim() || 'Not specified'
  ].join('\n')

  const params = new URLSearchParams({ title, body, labels: 'feedback' })
  return `${GITHUB_ISSUE_URL}?${params.toString()}`
}

export function WebSuggestionsPage({ onNavigateDraft }: { onNavigateDraft: () => void }) {
  const [form, setForm] = useState<SuggestionForm>({ ...EMPTY_SUGGESTION_FORM })
  const [status, setStatus] = useState('')
  const requestText = useMemo(() => suggestionRequestText(form), [form])
  const issueUrl = useMemo(() => suggestionIssueUrl(form), [form])
  const canOpenRequest = form.message.trim().length >= 12

  const setField = <K extends keyof SuggestionForm>(key: K, value: SuggestionForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleOpenRequest = (event: ReactFormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canOpenRequest) {
      setStatus('Add a little more detail before opening Suggestions.')
      return
    }
    nexusWebTrack('open_request', { category: form.category })
    window.open(issueUrl, '_blank', 'noopener,noreferrer')
    setStatus('Suggestion opened in GitHub.')
  }

  const copyRequest = async () => {
    if (!canOpenRequest) {
      setStatus('Add a little more detail before copying this suggestion.')
      return
    }
    try {
      await navigator.clipboard.writeText(requestText)
      nexusWebTrack('copy_request', { category: form.category })
      setStatus('Suggestion copied to clipboard.')
    } catch {
      setStatus('Copy failed. You can still select the preview text.')
    }
  }

  return (
    <WebPageShell>
      <a
        href="#nexus-web-main"
        className="nexus-focus absolute -left-[9999px] z-[200] h-px w-px overflow-hidden focus:fixed focus:left-4 focus:top-4 focus:h-auto focus:w-auto focus:overflow-visible focus:rounded focus:border focus:border-nexus-lime/60 focus:bg-nexus-bg focus:px-3 focus:py-2 focus:font-mono focus:text-sm focus:text-nexus-lime"
      >
        Skip to main
      </a>
      <main id="nexus-web-main" className="relative mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:px-6 lg:px-8">
        <section className="nexus-command-deck relative mb-5 overflow-hidden border border-nexus-line bg-nexus-surface-2/90 p-5 shadow-[0_20px_80px_rgba(0,0,0,0.28)]">
          <div className="absolute inset-0 bg-[linear-gradient(110deg,rgba(35,213,176,0.12),transparent_35%,rgba(83,166,255,0.08))]" aria-hidden />
          <div className="relative">
            <MicroLabel className="text-nexus-lime/80">suggestions // feedback</MicroLabel>
            <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h1 className="font-display text-5xl leading-none tracking-[0.06em] text-nexus-text drop-shadow-[0_0_18px_rgba(231,255,245,0.10)] sm:text-7xl">
                  SUGGEST<span className="text-nexus-lime">IONS</span>
                </h1>
                <p className="mt-3 max-w-2xl font-mono text-sm text-nexus-muted leading-relaxed">
                  Send draft questions, champion data corrections, bug reports, or feature ideas for Nexus Draft.
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
                <a className={solidGlitchCtaClass} data-glitch-label="GitHub" href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer">
                  GitHub
                </a>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_390px]">
          <NexusPanel kicker="suggestions" title="Suggest or report" accent>
            <form className="space-y-4" onSubmit={handleOpenRequest}>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-1.5">
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-nexus-lime/85">Category</span>
                  <select
                    className={webFieldClass}
                    value={form.category}
                    onChange={(event) => setField('category', event.target.value as SuggestionCategory)}
                  >
                    {SUGGESTION_CATEGORIES.map((category) => (
                      <option key={category.value} value={category.value}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-nexus-lime/85">Role</span>
                  <select
                    className={webFieldClass}
                    value={form.role}
                    onChange={(event) => setField('role', event.target.value as Exclude<DraftRole, 'unknown'>)}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {roleLabel(r)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <label className="flex flex-col gap-1.5">
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-nexus-lime/85">Rank / queue</span>
                  <input
                    className={webFieldClass}
                    value={form.rank}
                    onChange={(event) => setField('rank', event.target.value)}
                    placeholder="Diamond+, ranked solo"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-nexus-lime/85">Summoner / region</span>
                  <input
                    className={webFieldClass}
                    value={form.summoner}
                    onChange={(event) => setField('summoner', event.target.value)}
                    placeholder="optional"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-nexus-lime/85">Contact</span>
                  <input
                    className={webFieldClass}
                    value={form.contact}
                    onChange={(event) => setField('contact', event.target.value)}
                    placeholder="optional"
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1.5">
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-nexus-lime/85">Suggestion</span>
                <textarea
                  className={`${webFieldClass} min-h-36 resize-y`}
                  value={form.message}
                  onChange={(event) => setField('message', event.target.value)}
                  placeholder="What should Nexus Draft answer, fix, or add?"
                  required
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-nexus-lime/85">Draft context</span>
                <textarea
                  className={`${webFieldClass} min-h-28 resize-y`}
                  value={form.context}
                  onChange={(event) => setField('context', event.target.value)}
                  placeholder="Team comps, hovered champs, screenshot notes, matchup, or anything weird you saw."
                />
              </label>

              <div className="flex flex-wrap items-center gap-2">
                <button className={solidGlitchCtaClass} data-glitch-label="Open Suggestion" type="submit" disabled={!canOpenRequest}>
                  Open Suggestion
                </button>
                <button
                  type="button"
                  className="nexus-focus inline-flex items-center justify-center border border-nexus-line px-5 py-2.5 font-display text-xs sm:text-sm tracking-[0.16em] uppercase text-nexus-lime/90 hover:border-nexus-lime/60 hover:bg-nexus-lime/10 disabled:opacity-40"
                  onClick={copyRequest}
                  disabled={!canOpenRequest}
                >
                  Copy Text
                </button>
                <button
                  type="button"
                  className="nexus-focus inline-flex items-center justify-center border border-nexus-line/70 px-5 py-2.5 font-display text-xs sm:text-sm tracking-[0.16em] uppercase text-nexus-muted hover:border-nexus-lime/40 hover:text-nexus-lime/90"
                  onClick={() => {
                    setForm({ ...EMPTY_SUGGESTION_FORM })
                    setStatus('')
                  }}
                >
                  Clear
                </button>
              </div>
              <p className="m-0 min-h-5 font-mono text-xs text-nexus-lime/85" aria-live="polite">
                {status}
              </p>
            </form>
          </NexusPanel>

          <aside className="min-w-0">
            <NexusPanel kicker="preview" title="Prepared suggestion" className="lg:sticky lg:top-5">
              <pre className="nexus-allow-select m-0 max-h-[30rem] overflow-auto whitespace-pre-wrap border border-nexus-line bg-nexus-bg/55 p-3 font-mono text-xs leading-relaxed text-nexus-muted">
                {requestText}
              </pre>
              <div className="mt-4 border-t border-nexus-line/50 pt-3 font-mono text-xs leading-relaxed text-nexus-muted">
                <p className="m-0">Opening a suggestion uses a prefilled GitHub issue so nothing gets lost.</p>
                <a className="mt-3 inline-flex text-nexus-lime/90 hover:text-nexus-lime" href={GITHUB_ISSUE_URL} target="_blank" rel="noopener noreferrer">
                  View existing suggestion posts
                </a>
              </div>
            </NexusPanel>
          </aside>
        </div>
      </main>
      <VisitorCounter
        dataLine="Nexus Draft suggestions page."
        legalLine="Nexus Draft is a fan project and is not affiliated with or endorsed by Riot Games, Inc. League of Legends and Riot Games are trademarks of Riot Games, Inc."
      />
    </WebPageShell>
  )
}
