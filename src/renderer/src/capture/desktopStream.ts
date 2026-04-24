/**
 * Request a screen/window stream from Electron (Chromium) using a source id
 * from `desktopCapturer.getSources`. Minimal constraints only (extra keys have caused native crashes on some GPUs).
 */
export async function getDesktopStream(sourceId: string): Promise<MediaStream> {
  // Electron-only constraints (not in lib.dom).
  // Defer so the main thread isn't in a tight re-entrancy path right after a click.
  await new Promise<void>((r) => setTimeout(r, 0))
  // https://www.electronjs.org/docs/latest/api/desktop-capturer
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return await (navigator.mediaDevices as any).getUserMedia({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: sourceId
      }
    }
  })
}

export function stopDesktopStream(stream: MediaStream) {
  for (const t of stream.getTracks()) {
    t.stop()
  }
}
