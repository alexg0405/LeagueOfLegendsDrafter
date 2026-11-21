/**
 * In-game peek: a key (Caps Lock by default) shows the overlay on its Build tab.
 *
 * - hold:   visible while the key is down; releasing puts things back the way they were.
 * - toggle: each press shows or hides it.
 *
 * Pure state machine — the key reader, overlay and timers are injected — so the rules are
 * unit-tested without Electron or Win32.
 */

export type PeekKeyReader = {
  /** Physical state of the configured peek key. Must not consume the key. */
  keyDown(): boolean
  /** Alt/Ctrl/Win held: Alt+Tab and friends are window switching, not a peek. */
  modifierDown(): boolean
  /** League's game window is in front (not a browser, Discord, the Nexus main window...). */
  leagueForeground(): boolean
}

export type PeekDeps = {
  reader: PeekKeyReader
  isEnabled(): boolean
  isInGame(): boolean
  mode(): 'hold' | 'toggle'
  overlayVisible(): boolean
  /** Show without taking focus, so the game keeps receiving the key release. */
  showOverlay(): void
  hideOverlay(): void
  /** Tell the overlay renderer to switch to (or back from) the Build tab. */
  notify(active: boolean): void
}

export class PeekController {
  private active = false
  /** True when the peek opened the overlay, so ending the peek should close it again. */
  private openedByPeek = false
  /** Raw key state on the previous tick, for press edges in toggle mode. */
  private wasDown = false

  constructor(private readonly deps: PeekDeps) {}

  get isActive(): boolean {
    return this.active
  }

  /** One poll. Cheap enough to run every ~35 ms during a game. */
  tick(): void {
    const { reader } = this.deps
    if (!this.deps.isEnabled() || !this.deps.isInGame()) {
      this.wasDown = false
      if (this.active) {
        this.end()
      }
      return
    }
    const down = reader.keyDown() && !reader.modifierDown()
    const pressed = down && !this.wasDown
    this.wasDown = down

    if (this.deps.mode() === 'toggle') {
      // Only League's own key press counts: typing in other apps mid-game must not flip it.
      if (pressed && reader.leagueForeground()) {
        if (this.deps.overlayVisible()) {
          if (this.active) {
            this.end()
          } else {
            this.deps.hideOverlay()
          }
        } else {
          this.start()
        }
      }
      return
    }

    if (down && !this.active) {
      if (reader.leagueForeground()) {
        this.start()
      }
      return
    }
    if (!down && this.active) {
      this.end()
    }
  }

  /**
   * The user toggled the overlay by hand mid-peek (hotkey or ✕): their choice wins, so
   * ending the peek must not undo it.
   */
  userToggled(): void {
    this.openedByPeek = false
    if (this.active && this.deps.mode() === 'toggle') {
      this.active = false
      this.deps.notify(false)
    }
  }

  /** Stop immediately (game ended, feature turned off, app quitting). */
  cancel(): void {
    this.wasDown = false
    if (this.active) {
      this.end()
    }
  }

  private start(): void {
    this.active = true
    this.openedByPeek = !this.deps.overlayVisible()
    if (this.openedByPeek) {
      this.deps.showOverlay()
    }
    this.deps.notify(true)
  }

  private end(): void {
    this.active = false
    if (this.openedByPeek && this.deps.overlayVisible()) {
      this.deps.hideOverlay()
    }
    this.openedByPeek = false
    this.deps.notify(false)
  }
}
