import { useState, type ReactNode } from 'react'
import {
  PEEK_KEY_LABELS,
  PEEK_KEYS,
  isPeekKey,
  type OverlayShortcutStatusResult,
  type PeekSettingsPatch,
  type PeekStatus
} from '@shared/desktopInterop'
import { acceleratorFromKeyEvent } from './hotkeys'
import { NexusInfoTip } from './NexusInfoTip'

const chip = (on = false) =>
  [
    'nexus-focus border px-2 py-[3px] font-mono text-[11px] uppercase tracking-[0.1em] disabled:cursor-not-allowed disabled:opacity-40',
    on ? 'border-nexus-lime bg-nexus-lime/15 text-nexus-lime' : 'border-nexus-line text-nexus-muted hover:border-nexus-lime/50 hover:text-nexus-text'
  ].join(' ')
const primary =
  'nexus-focus border border-nexus-lime bg-nexus-lime px-2 py-[3px] font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-nexus-bg hover:brightness-110 active:brightness-95'
const keyBox = 'border border-nexus-line/70 bg-nexus-bg px-1.5 py-[2px] font-mono text-[11px] text-nexus-text/90'

/** Label column + controls, matching the in-game layout rows below it. */
function Row({ label, tip, children }: { label: string; tip: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="flex w-[118px] shrink-0 items-center gap-1.5 text-nexus-text/90">
        {label}
        <NexusInfoTip label={`About the ${label.toLowerCase()}`}>{tip}</NexusInfoTip>
      </span>
      {children}
    </div>
  )
}

export type OverlayControlsProps = {
  overlayStatusLine?: string | null
  overlayError?: string | null
  overlayShortcutStatus?: OverlayShortcutStatusResult | null
  /** Rendered verbatim when the user asks why the overlay is hidden. */
  overlayDiagnosticsText?: string | null
  onToggleOverlay: () => void
  onResetOverlay?: () => void
  onShowOverlayDiagnostics?: () => void
  /** Pass an empty array to restore the default Insert / F9 / F10 bindings. */
  onSetOverlayHotkey?: (accelerators: string[]) => void
  /** In-game peek key (Caps Lock by default) that shows the overlay's Build tab. */
  peekStatus?: PeekStatus | null
  onSetPeek?: (patch: PeekSettingsPatch) => void
}

/** Overlay keys and recovery tools (Setup page). One line per setting; detail lives in ⓘ tips. */
export function OverlayControls({
  overlayStatusLine,
  overlayError,
  overlayShortcutStatus,
  overlayDiagnosticsText,
  onToggleOverlay,
  onResetOverlay,
  onShowOverlayDiagnostics,
  onSetOverlayHotkey,
  peekStatus,
  onSetPeek
}: OverlayControlsProps) {
  const [hotkeyCapture, setHotkeyCapture] = useState(false)
  const peekOn = Boolean(peekStatus?.enabled && peekStatus.available)

  return (
    <div className="space-y-1.5 font-mono text-[11px] leading-4">
      {overlayShortcutStatus?.failed.length ? (
        <p className="m-0 flex items-center gap-1.5 text-nexus-yellow/90">
          Hotkey unavailable: {overlayShortcutStatus.failed.join(', ')}
          <NexusInfoTip label="Why a hotkey fails" tone="lime">
            Another running app already owns that key, so Windows refused it. Pick another below; Toggle overlay always
            works.
          </NexusInfoTip>
        </p>
      ) : null}

      {onSetOverlayHotkey ? (
        <Row
          label="Toggle key"
          tip={
            <>
              Shows/hides the overlay. Click <b>Change</b>, then press a key (Ctrl/Alt/Shift combos work). If Windows refuses it,
              another app owns it. Use Borderless or Windowed League: exclusive fullscreen covers overlays.
            </>
          }
        >
          {hotkeyCapture ? (
            <input
              autoFocus
              readOnly
              aria-label="Press the key you want to use for the overlay"
              className={`${keyBox} nexus-focus w-[190px] border-nexus-lime/60 placeholder:text-nexus-muted focus:outline-none`}
              value=""
              placeholder="Press a key (Esc cancels)"
              onKeyDown={(event) => {
                event.preventDefault()
                const accelerator = acceleratorFromKeyEvent(event)
                if (accelerator === 'Escape') {
                  setHotkeyCapture(false)
                  return
                }
                if (!accelerator) {
                  return
                }
                setHotkeyCapture(false)
                onSetOverlayHotkey([accelerator])
              }}
              onBlur={() => setHotkeyCapture(false)}
            />
          ) : (
            <kbd className={keyBox}>
              {overlayShortcutStatus?.registered.length ? overlayShortcutStatus.registered.join(' / ') : 'none'}
            </kbd>
          )}
          <button
            type="button"
            className={chip(hotkeyCapture)}
            aria-pressed={hotkeyCapture}
            // Keep focus in the capture box, or its blur would cancel and this click would reopen it.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setHotkeyCapture((v) => !v)}
          >
            {hotkeyCapture ? 'Cancel' : 'Change'}
          </button>
          <button
            type="button"
            className={chip()}
            title="Restore Insert / F9 / F10"
            aria-label="Restore the default toggle keys"
            onClick={() => {
              setHotkeyCapture(false)
              onSetOverlayHotkey([])
            }}
          >
            ↺
          </button>
        </Row>
      ) : null}

      {onSetPeek && peekStatus ? (
        <Row
          label="Peek key"
          tip={
            <>
              In a game, <b>{peekStatus.mode === 'hold' ? 'hold' : 'press'} {PEEK_KEY_LABELS[peekStatus.key]}</b> to see the
              overlay&apos;s Build tab
              {peekStatus.mode === 'hold' ? '; let go to hide it' : '; press again to hide it'}. League still gets the key: Nexus
              Draft only reads whether it is down while League is in front, and never presses keys or hooks input.
              {peekStatus.key === 'capslock' ? (
                <span className="mt-1 block">Caps Lock still flips capitals. Abilities don&apos;t care, but chat will.</span>
              ) : null}
              {peekStatus.key === 'tab' ? (
                <span className="mt-1 block">Tab also opens League&apos;s scoreboard, so both show together.</span>
              ) : null}
            </>
          }
        >
          <button
            type="button"
            role="switch"
            aria-checked={peekStatus.enabled}
            aria-label="Peek key"
            disabled={!peekStatus.available}
            className={chip(peekOn)}
            onClick={() => onSetPeek({ enabled: !peekStatus.enabled })}
          >
            {peekOn ? 'On' : 'Off'}
          </button>
          {peekStatus.available ? (
            <>
              <select
                aria-label="Which peek key"
                className="nexus-focus border border-nexus-line bg-nexus-bg px-1 py-[3px] font-mono text-[11px] text-nexus-text disabled:opacity-40"
                value={peekStatus.key}
                disabled={!peekStatus.enabled}
                onChange={(event) => {
                  if (isPeekKey(event.target.value)) {
                    onSetPeek({ key: event.target.value })
                  }
                }}
              >
                {PEEK_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {PEEK_KEY_LABELS[key]}
                  </option>
                ))}
              </select>
              <span className="inline-flex" role="radiogroup" aria-label="Peek mode">
                {(['hold', 'toggle'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={peekStatus.mode === mode}
                    disabled={!peekStatus.enabled}
                    className={`${chip(peekStatus.mode === mode)} ${mode === 'toggle' ? '-ml-px' : ''}`}
                    onClick={() => onSetPeek({ mode })}
                  >
                    {mode === 'hold' ? 'Hold' : 'Toggle'}
                  </button>
                ))}
              </span>
            </>
          ) : peekStatus.reason ? (
            <span className="text-[10px] text-nexus-muted">{peekStatus.reason}</span>
          ) : null}
        </Row>
      ) : null}

      {overlayStatusLine ? <p className="m-0 text-nexus-text/80">{overlayStatusLine}</p> : null}
      {overlayError ? <p className="m-0 text-nexus-red">{overlayError}</p> : null}

      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        <button type="button" className={primary} onClick={onToggleOverlay}>
          Toggle overlay
        </button>
        {onResetOverlay ? (
          <button type="button" className={chip()} onClick={onResetOverlay} title="Rebuild the overlay at its default spot">
            Reset overlay
          </button>
        ) : null}
        {onShowOverlayDiagnostics ? (
          <button type="button" className={chip()} onClick={onShowOverlayDiagnostics}>
            Why can&apos;t I see it?
          </button>
        ) : null}
      </div>

      {overlayDiagnosticsText ? (
        <pre className="nexus-allow-select m-0 max-h-56 overflow-auto whitespace-pre-wrap border border-nexus-line/70 bg-nexus-bg/60 p-2 text-[11px] leading-snug text-nexus-muted">
          {overlayDiagnosticsText}
        </pre>
      ) : null}
    </div>
  )
}
