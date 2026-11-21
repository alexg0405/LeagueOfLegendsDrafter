import { BrowserWindow, screen, type Rectangle, type WebContents, type WebPreferences } from 'electron'
import type { LiveBlock, OverlayLayout } from '../shared/overlayLayout'

/**
 * Floating overlay boxes: one small frameless always-on-top window per box, each showing the
 * sections the player put in it. Boxes are dragged independently, remember their spot, size
 * their height to their content, and never take focus from the game.
 */

export type OverlayBoxDeps = {
  webPreferences(): WebPreferences
  loadBox(win: BrowserWindow, boxId: string): void
  wireWindow(win: BrowserWindow, label: string): void
  savedBounds(boxId: string): Rectangle | null
  saveBounds(boxId: string, bounds: Rectangle): void
  clamp(bounds: Rectangle): Rectangle
  iconPath: string
  log(...args: unknown[]): void
}

const BOX_WIDTH = 300
const BOX_MIN_WIDTH = 220
const BOX_MAX_WIDTH = 640
const BOX_MIN_HEIGHT = 36
const BOX_MAX_HEIGHT = 900
const SAVE_DEBOUNCE_MS = 400
/** Typical in-game height of each section, for placing a new box before it has rendered. */
const BLOCK_HEIGHT: Record<LiveBlock, number> = { next: 96, build: 40, adapt: 64, enemy: 200 }
const BOX_CHROME_HEIGHT = 40
const TOPMOST_REASSERT_MS = 2000

export class OverlayBoxManager {
  private readonly windows = new Map<string, BrowserWindow>()
  private readonly saveTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private visible = false
  private reassertTimer: ReturnType<typeof setInterval> | null = null
  /** Last layout synced, so a box window that got closed can be rebuilt when boxes show again. */
  private layout: OverlayLayout | null = null

  constructor(private readonly deps: OverlayBoxDeps) {}

  get size(): number {
    return this.windows.size
  }

  isVisible(): boolean {
    return this.visible && this.windows.size > 0
  }

  /** Create/destroy windows so there is exactly one per box in the layout. */
  sync(layout: OverlayLayout): void {
    this.layout = layout
    const wanted = new Set(layout.boxes.map((box) => box.id))
    for (const [id, win] of Array.from(this.windows)) {
      if (!wanted.has(id)) {
        this.windows.delete(id)
        if (!win.isDestroyed()) {
          win.destroy()
        }
      }
    }
    for (const box of layout.boxes) {
      if (!this.windows.has(box.id)) {
        this.create(box.id, box.blocks)
      }
    }
    this.applyVisibility()
  }

  setVisible(on: boolean): void {
    // A box window that was closed somehow comes back the next time boxes should show.
    if (on && this.layout && this.windows.size < this.layout.boxes.length) {
      this.sync(this.layout)
    }
    if (on !== this.visible) {
      this.deps.log(`[boxes] ${on ? 'show' : 'hide'} (${this.windows.size})`)
    }
    this.visible = on
    this.applyVisibility()
  }

  /** The box renderer reports its content height; grow/shrink the window to match. */
  fit(sender: WebContents, contentHeight: number): void {
    const win = Array.from(this.windows.values()).find((w) => !w.isDestroyed() && w.webContents.id === sender.id)
    if (!win || !Number.isFinite(contentHeight)) {
      return
    }
    const [width, height] = win.getContentSize()
    const next = Math.max(BOX_MIN_HEIGHT, Math.min(BOX_MAX_HEIGHT, Math.ceil(contentHeight)))
    // Always grow (a box clips its bottom edge otherwise); ignore 1px shrinks.
    if (next > (height ?? 0) || (height ?? 0) - next > 1) {
      win.setContentSize(width ?? BOX_WIDTH, next)
    }
  }

  closeAll(): void {
    this.stopReassert()
    for (const win of Array.from(this.windows.values())) {
      if (!win.isDestroyed()) {
        win.destroy()
      }
    }
    this.windows.clear()
  }

  /**
   * First free spot for a new box: down the left edge below the boxes already there, then a
   * new column to the right. The right side is left for the main overlay.
   */
  private freeSpot(blocks: readonly LiveBlock[]): Rectangle {
    const work = screen.getPrimaryDisplay().workArea
    const height = BOX_CHROME_HEIGHT + blocks.reduce((sum, block) => sum + BLOCK_HEIGHT[block], 0)
    const column = BOX_WIDTH + 24
    const taken = Array.from(this.windows.values())
      .filter((win) => !win.isDestroyed())
      .map((win) => win.getBounds())
    for (let col = 0; col < 4; col += 1) {
      const x = work.x + 16 + col * column
      let y = work.y + 80
      for (const b of taken.filter((r) => Math.abs(r.x - x) < column / 2).sort((a, b2) => a.y - b2.y)) {
        y = Math.max(y, b.y + b.height + 10)
      }
      if (y + height <= work.y + work.height - 8) {
        return { x, y, width: BOX_WIDTH, height }
      }
    }
    return { x: work.x + 16, y: work.y + 80, width: BOX_WIDTH, height }
  }

  private create(id: string, blocks: readonly LiveBlock[]): void {
    const bounds = this.deps.clamp(this.deps.savedBounds(id) ?? this.freeSpot(blocks))
    const win = new BrowserWindow({
      ...bounds,
      title: 'Nexus Draft box',
      frame: false,
      transparent: false,
      backgroundColor: '#0f131a',
      resizable: true,
      minWidth: BOX_MIN_WIDTH,
      maxWidth: BOX_MAX_WIDTH,
      minHeight: BOX_MIN_HEIGHT,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      // Clicking a box (or dragging it) must never pull keyboard focus away from the game.
      // Boxes have no inputs; dragging works through the drag strip without focus.
      focusable: false,
      show: false,
      icon: this.deps.iconPath,
      webPreferences: this.deps.webPreferences()
    })
    win.setAlwaysOnTop(true, 'screen-saver')
    this.deps.wireWindow(win, `box:${id}`)
    win.on('moved', () => this.queueSave(id))
    win.on('resize', () => this.queueSave(id))
    win.on('closed', () => {
      // Still in the map means nobody here closed it on purpose (sync/closeAll remove first).
      if (this.windows.get(id) === win) {
        this.windows.delete(id)
        this.deps.log(`[boxes] ${id} window closed; it comes back the next time boxes show`)
      }
    })
    win.webContents.once('did-finish-load', () => this.applyVisibility())
    this.deps.loadBox(win, id)
    this.windows.set(id, win)
    this.deps.log(`[boxes] created ${id}`, bounds)
  }

  private queueSave(id: string): void {
    const pending = this.saveTimers.get(id)
    if (pending) {
      clearTimeout(pending)
    }
    this.saveTimers.set(
      id,
      setTimeout(() => {
        this.saveTimers.delete(id)
        const win = this.windows.get(id)
        if (win && !win.isDestroyed()) {
          this.deps.saveBounds(id, win.getBounds())
        }
      }, SAVE_DEBOUNCE_MS)
    )
  }

  private applyVisibility(): void {
    for (const win of Array.from(this.windows.values())) {
      if (win.isDestroyed()) {
        continue
      }
      if (this.visible) {
        win.setAlwaysOnTop(true, 'screen-saver')
        if (!win.isVisible()) {
          win.showInactive()
        }
      } else if (win.isVisible()) {
        win.hide()
      }
    }
    if (this.visible && this.windows.size > 0) {
      this.startReassert()
    } else {
      this.stopReassert()
    }
  }

  /** League taking focus can bury a topmost window; keep boxes above it while shown. */
  private startReassert(): void {
    if (this.reassertTimer) {
      return
    }
    this.reassertTimer = setInterval(() => {
      for (const win of Array.from(this.windows.values())) {
        if (!win.isDestroyed() && win.isVisible() && !win.isAlwaysOnTop()) {
          win.setAlwaysOnTop(true, 'screen-saver')
        }
      }
    }, TOPMOST_REASSERT_MS)
    this.reassertTimer.unref?.()
  }

  private stopReassert(): void {
    if (this.reassertTimer) {
      clearInterval(this.reassertTimer)
      this.reassertTimer = null
    }
  }
}
