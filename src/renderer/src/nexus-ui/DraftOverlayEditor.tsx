import type { ReactNode } from 'react'
import {
  DRAFT_EXTRAS,
  DRAFT_EXTRA_LABELS,
  DRAFT_PICK_COUNTS,
  DRAFT_SECTIONS,
  DRAFT_SECTION_LABELS,
  PICK_DETAILS,
  PICK_DETAIL_LABELS,
  normalizeDraftOverlay,
  type DraftExtra,
  type DraftOverlayPrefs,
  type DraftSection,
  type PickDetail
} from '@shared/overlayLayout'
import { NexusInfoTip } from './NexusInfoTip'

const chip = (on: boolean) =>
  [
    'nexus-focus border px-1.5 py-[2px] font-mono text-[10px] uppercase tracking-[0.1em]',
    on ? 'border-nexus-lime bg-nexus-lime/15 text-nexus-lime' : 'border-nexus-line text-nexus-muted hover:text-nexus-text'
  ].join(' ')

const PICK_DETAIL_HINTS: Record<PickDetail, string> = {
  delta: 'How much the pick changes your win chance in this lobby, with a Great / Good / Meh / Risky label',
  score: "The draft model's raw score",
  beats: 'Enemy picks it does well against',
  pairs: 'Teammates it combos with',
  runes: 'Recommended keystone',
  tips: 'How to play it (hover the badge)',
  build: 'Item build, opens on click'
}

const SECTION_HINTS: Record<DraftSection, string> = {
  board: 'Ally and enemy picks so far',
  matchups: 'How your locked champion does against each enemy',
  intel: 'Game plan: summoner spells, starting item, build',
  lookup: "Search any champion and see its score for this lobby",
  coaching: 'Written coaching notes, when there are any'
}

const EXTRA_HINTS: Record<DraftExtra, string> = {
  tabs: 'Draft and Build tabs at the top, to see your build path during champ select',
  dataStatus: 'When the champion stats were last refreshed',
  hotkeys: 'Your hide and peek keys, at the bottom',
  engine: 'List order (best or worst first) and lookahead',
  tables: 'Buttons for the full ranked table and the item table'
}

function Row({ label, tip, children }: { label: string; tip: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start gap-1.5">
      <span className="inline-flex w-[118px] shrink-0 items-center gap-1 pt-[3px] text-nexus-text/90">
        {label}
        <NexusInfoTip label={`About ${label}`}>{tip}</NexusInfoTip>
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">{children}</div>
    </div>
  )
}

/**
 * Setup → Champ select overlay: what the Draft tab shows (just the top picks by default) and
 * whether the overlay opens and closes with champ select.
 */
export function DraftOverlayEditor({
  prefs,
  onChange
}: {
  prefs: DraftOverlayPrefs
  onChange: (next: DraftOverlayPrefs) => void
}) {
  const flipSection = (key: DraftSection) => onChange({ ...prefs, sections: { ...prefs.sections, [key]: !prefs.sections[key] } })
  const flipDetail = (key: PickDetail) => onChange({ ...prefs, pickDetails: { ...prefs.pickDetails, [key]: !prefs.pickDetails[key] } })
  const flipExtra = (key: DraftExtra) => onChange({ ...prefs, extras: { ...prefs.extras, [key]: !prefs.extras[key] } })

  return (
    <div className="space-y-1.5 font-mono text-[11px] leading-4">
      <Row label="Picks listed" tip="How many of your best champions the list shows.">
        {DRAFT_PICK_COUNTS.map((count) => (
          <button
            key={count}
            type="button"
            className={`${chip(prefs.picks === count)} min-w-7`}
            aria-pressed={prefs.picks === count}
            onClick={() => onChange({ ...prefs, picks: count })}
          >
            {count}
          </button>
        ))}
      </Row>

      <Row label="Each pick" tip="Every pick always shows its portrait and name. Add anything else you want next to it.">
        {PICK_DETAILS.map((key) => (
          <button
            key={key}
            type="button"
            className={chip(prefs.pickDetails[key])}
            aria-pressed={prefs.pickDetails[key]}
            title={PICK_DETAIL_HINTS[key]}
            onClick={() => flipDetail(key)}
          >
            {PICK_DETAIL_LABELS[key]}
          </button>
        ))}
      </Row>

      <Row label="Sections" tip="Extra panels under the pick list.">
        {DRAFT_SECTIONS.map((key) => (
          <button
            key={key}
            type="button"
            className={chip(prefs.sections[key])}
            aria-pressed={prefs.sections[key]}
            title={SECTION_HINTS[key]}
            onClick={() => flipSection(key)}
          >
            {DRAFT_SECTION_LABELS[key]}
          </button>
        ))}
      </Row>

      <Row label="Also show" tip="Controls and status lines around the list.">
        {DRAFT_EXTRAS.map((key) => (
          <button
            key={key}
            type="button"
            className={chip(prefs.extras[key])}
            aria-pressed={prefs.extras[key]}
            title={EXTRA_HINTS[key]}
            onClick={() => flipExtra(key)}
          >
            {DRAFT_EXTRA_LABELS[key]}
          </button>
        ))}
      </Row>

      <Row
        label="Open / close"
        tip={
          <>
            <b>Open</b>: the overlay appears when champ select starts. <b>Close</b>: it hides when champ select ends (the game
            starts, or someone dodges). In game, your peek key or toggle key brings it back.
          </>
        }
      >
        <button
          type="button"
          className={chip(prefs.openOnChampSelect)}
          aria-pressed={prefs.openOnChampSelect}
          onClick={() => onChange({ ...prefs, openOnChampSelect: !prefs.openOnChampSelect })}
        >
          Open at champ select
        </button>
        <button
          type="button"
          className={chip(prefs.closeAfterChampSelect)}
          aria-pressed={prefs.closeAfterChampSelect}
          onClick={() => onChange({ ...prefs, closeAfterChampSelect: !prefs.closeAfterChampSelect })}
        >
          Close when it ends
        </button>
      </Row>

      <button type="button" className={`${chip(false)} w-full py-1`} onClick={() => onChange(normalizeDraftOverlay(null))}>
        Back to simple
      </button>
    </div>
  )
}
