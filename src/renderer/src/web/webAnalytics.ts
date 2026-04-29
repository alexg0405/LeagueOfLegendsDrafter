import { track } from '@vercel/analytics'

/**
 * Fires on the hosted build only; @vercel/analytics no-ops when not configured.
 */
export function nexusWebTrack(
  name:
    | 'ocr_autofill'
    | 'copy_suggestions'
    | 'ocr_undo'
    | 'draft_persist'
    | 'keyboard_shortcut'
    | 'open_request'
    | 'copy_request',
  data?: Record<string, string | number | boolean>
): void {
  if (import.meta.env.VITE_NEXUS_WEB !== '1') {
    return
  }
  try {
    track(name, data ?? {})
  } catch {
    // ignore
  }
}
