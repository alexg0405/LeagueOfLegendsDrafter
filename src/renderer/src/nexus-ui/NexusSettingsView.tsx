import { useEffect, type ReactNode } from 'react'
import { THEMES, useTheme } from '../theme'
import { useOverlayLayout } from '../builds/useOverlayLayout'
import { DraftOverlayEditor } from './DraftOverlayEditor'
import { NexusInfoTip } from './NexusInfoTip'
import { OverlayControls, type OverlayControlsProps } from './OverlayControls'
import { OverlayLayoutEditor } from './OverlayLayoutEditor'

function SettingsCard({ title, tip, children }: { title: string; tip: string; children: ReactNode }) {
  return (
    <section className="border border-nexus-line bg-nexus-surface-2 px-3 py-2.5">
      <h2 className="m-0 mb-2 flex items-center gap-1.5 font-mono text-xs font-bold uppercase tracking-[0.14em] text-nexus-lime/90">
        {title}
        <NexusInfoTip label={`About ${title}`}>{tip}</NexusInfoTip>
      </h2>
      {children}
    </section>
  )
}

/** Main window → Setup: overlay keys, what it shows in champ select and in game, theme. Detail lives in ⓘ tips. */
export function NexusSettingsView(overlay: OverlayControlsProps) {
  const [theme, setTheme] = useTheme()
  const { state, setLayout, setArranging } = useOverlayLayout()

  // Leaving Setup must not leave placeholder boxes on screen.
  useEffect(() => () => setArranging(false), [setArranging])

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-2.5 p-3">
      <SettingsCard title="Overlay" tip="Keys for the overlay and recovery tools if you cannot see it.">
        <OverlayControls {...overlay} />
      </SettingsCard>

      <SettingsCard
        title="Champ select overlay"
        tip="What the overlay shows while you draft. Out of the box it lists your top picks for your role and nothing else; turn on whatever else you want."
      >
        <DraftOverlayEditor prefs={state.layout.draft} onChange={(draft) => setLayout({ ...state.layout, draft })} />
      </SettingsCard>

      <SettingsCard
        title="In-game layout"
        tip="What the overlay shows in game, and which parts get their own box: a small window you drag anywhere on screen."
      >
        <OverlayLayoutEditor layout={state.layout} arranging={state.arranging} onChange={setLayout} onArrange={setArranging} />
      </SettingsCard>

      <SettingsCard title="Theme" tip="Recolors every window: this one, the overlay and your boxes.">
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Theme">
          {THEMES.map((t) => {
            const on = theme === t.id
            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={on}
                title={t.note}
                className={[
                  'nexus-focus flex items-center gap-2 border px-2 py-1.5 text-left font-mono text-xs',
                  on ? 'border-nexus-lime bg-nexus-lime/10 text-nexus-text' : 'border-nexus-line text-nexus-muted hover:text-nexus-text'
                ].join(' ')}
                onClick={() => setTheme(t.id)}
              >
                <span className="flex shrink-0 overflow-hidden border border-nexus-line" aria-hidden>
                  {t.swatch.map((color) => (
                    <span key={color} className="h-5 w-3" style={{ background: color }} />
                  ))}
                </span>
                {t.label}
              </button>
            )
          })}
        </div>
      </SettingsCard>
    </div>
  )
}
