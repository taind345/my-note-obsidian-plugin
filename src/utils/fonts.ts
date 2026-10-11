/** Font chữ dùng trong app — mặc định tất cả là Cascadia Code */
export const FONT_OPTIONS = [
  { value: 'cascadia', label: 'Cascadia Code' },
  { value: 'handwriting', label: 'Comic Handwriting' },
  { value: 'sans', label: 'Clean Sans-Serif' },
  { value: 'mono', label: 'JetBrains Mono' },
  { value: 'serif', label: 'Georgia Serif' },
]

export const FONT_STACKS: Record<string, string> = {
  cascadia: `'Cascadia Code', 'Cascadia Mono', Consolas, 'Courier New', monospace`,
  handwriting: `'Patrick Hand', 'Virgil', 'Comic Sans MS', cursive, sans-serif`,
  sans: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`,
  mono: `'JetBrains Mono', 'Fira Code', Consolas, monospace`,
  serif: `Georgia, 'Times New Roman', serif`,
}

export function fontStack(name: string): string {
  return FONT_STACKS[name] || FONT_STACKS.cascadia
}

export type FontKind = 'markdown' | 'mynote' | 'code'

export function loadFont(kind: FontKind): string {
  try {
    return localStorage.getItem(`mybook_font_${kind}`) || 'cascadia'
  } catch {
    return 'cascadia'
  }
}

export function saveFont(kind: FontKind, value: string): void {
  try {
    localStorage.setItem(`mybook_font_${kind}`, value)
  } catch {}
}
