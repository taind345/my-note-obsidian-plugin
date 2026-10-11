import { convertFileSrc } from '@tauri-apps/api/core'

/** true khi chạy trong app Tauri (desktop), false khi chạy web dev/preview */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/**
 * Index tên file -> đường dẫn tuyệt đối trong vault (do App duy trì từ vaultItems).
 * Dùng để resolve `![[image.png]]` sang file thật trong chế độ Tauri
 * (thay cho endpoint /api/fs/raw của web dev server).
 */
const fileIndexByName = new Map<string, string>()

export function setVaultFileIndex(files: { name: string; path: string }[]): void {
  fileIndexByName.clear()
  for (const f of files) {
    const key = f.name.toLowerCase()
    if (!fileIndexByName.has(key)) fileIndexByName.set(key, f.path)
  }
}

function baseNameOf(p: string): string {
  const clean = p.replace(/\\/g, '/')
  const i = clean.lastIndexOf('/')
  return i >= 0 ? clean.slice(i + 1) : clean
}

/** Resolve tên file vault -> absolute path (Tauri). Trả null nếu không đoán được. */
export function resolveVaultAsset(
  rawPath: string,
  fileDir?: string,
  vaultDir?: string
): string | null {
  const raw = (rawPath || '').trim()
  if (!raw) return null
  if (raw.startsWith('/')) return raw
  const clean = raw.replace(/^\.\//, '')
  const hit =
    fileIndexByName.get(baseNameOf(clean).toLowerCase()) ??
    fileIndexByName.get(clean.toLowerCase())
  if (hit) return hit
  const dir = (fileDir || vaultDir || '').replace(/\/+$/, '')
  if (dir) return `${dir}/${clean}`
  return null
}

/** Absolute path -> URL hiển thị được trong <img> khi chạy Tauri */
export function tauriAssetUrl(absPath: string): string {
  return convertFileSrc(absPath)
}
