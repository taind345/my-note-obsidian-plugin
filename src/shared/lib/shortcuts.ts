/**
 * So khớp KeyboardEvent với chuỗi shortcut dạng "ctrl+o", "ctrl+,", "ctrl+shift+s".
 * Pure — dùng chung cho app + test.
 */
export function matchShortcut(e: KeyboardEvent, shortcutStr: string): boolean {
  if (!shortcutStr) return false
  const parts = shortcutStr.toLowerCase().split('+')
  const hasCtrl = parts.includes('ctrl')
  const hasAlt = parts.includes('alt')
  const hasShift = parts.includes('shift')
  const keyPart = parts[parts.length - 1]

  if (hasCtrl && !(e.ctrlKey || e.metaKey)) return false
  if (!hasCtrl && (e.ctrlKey || e.metaKey)) return false
  if (hasAlt && !e.altKey) return false
  if (!hasAlt && e.altKey) return false
  if (hasShift && !e.shiftKey) return false
  if (!hasShift && e.shiftKey) return false

  return e.key.toLowerCase() === keyPart || (keyPart === 'space' && e.key === ' ')
}
