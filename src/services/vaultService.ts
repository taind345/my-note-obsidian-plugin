import type { VaultFileItem, EditorMode } from '../types/notebook'
import { isTauri } from '../utils/tauriFs'

export const DEFAULT_VAULT_PATH = '/home/ti/Desktop/DATA_DESKTOP/0_Obsidian notebook/red'

/** Backend filesystem cắm được: web (/api/fs) · Tauri (plugin-fs) · Obsidian (Vault API) */
export interface VaultBackend {
  listVault(dirPath: string): Promise<{ dir: string; items: VaultFileItem[] }>
  readFile(filePath: string): Promise<{ content: string; name: string; ext: string }>
  writeFile(filePath: string, content: string): Promise<boolean>
  createItem(targetPath: string, type: 'file' | 'dir', content?: string): Promise<boolean>
  deleteItem(targetPath: string): Promise<boolean>
  renameItem(oldPath: string, newPath: string): Promise<boolean>
}

let customBackend: VaultBackend | null = null

/** Plugin Obsidian (hoặc host khác) đăng ký backend riêng trước khi mount App */
export function setVaultBackend(backend: VaultBackend | null): void {
  customBackend = backend
}

export function hasCustomBackend(): boolean {
  return customBackend !== null
}

// ---- Tauri (desktop app) backend: truy cập fs thật qua plugin-fs ----
async function tauriListVault(dirPath: string): Promise<{ dir: string; items: VaultFileItem[] }> {
  const fs = await import('@tauri-apps/plugin-fs')
  const p = await import('@tauri-apps/api/path')
  const clean = dirPath.trim().replace(/\/+$/, '') || '/'
  if (!(await fs.exists(clean))) {
    throw new Error(`Directory does not exist: ${clean}`)
  }

  const extOf = (name: string) => {
    const i = name.lastIndexOf('.')
    return i >= 0 ? name.slice(i).toLowerCase() : ''
  }

  const walk = async (dir: string, depth: number, maxDepth: number): Promise<VaultFileItem[]> => {
    if (depth > maxDepth) return []
    let entries: import('@tauri-apps/plugin-fs').DirEntry[] = []
    try {
      entries = await fs.readDir(dir)
    } catch {
      return []
    }
    const out: VaultFileItem[] = []
    for (const e of entries) {
      const name = e.name ?? dir.split('/').pop() ?? 'unknown'
      if (name.startsWith('.') || name === 'node_modules') continue
      const isDirectory = !!e.isDirectory
      const fullPath = await p.join(dir, name)
      out.push({
        name,
        path: fullPath,
        isDirectory,
        ext: isDirectory ? '' : extOf(name),
        size: 0,
        children: isDirectory ? await walk(fullPath, depth + 1, maxDepth) : undefined,
      })
    }
    out.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1
      if (!a.isDirectory && b.isDirectory) return 1
      return a.name.localeCompare(b.name, undefined, { numeric: true })
    })
    return out
  }

  return { dir: clean, items: await walk(clean, 0, 6) }
}

async function tauriReadFile(filePath: string): Promise<{ content: string; name: string; ext: string }> {
  const fs = await import('@tauri-apps/plugin-fs')
  const p = await import('@tauri-apps/api/path')
  if (!(await fs.exists(filePath))) throw new Error(`File does not exist: ${filePath}`)
  const content = await fs.readTextFile(filePath)
  const name = await p.basename(filePath)
  const ext = await p.extname(filePath)
  return { content, name, ext: ext.toLowerCase() }
}

async function tauriWriteFile(filePath: string, content: string): Promise<boolean> {
  const fs = await import('@tauri-apps/plugin-fs')
  const p = await import('@tauri-apps/api/path')
  const dir = await p.dirname(filePath)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeTextFile(filePath, content ?? '')
  return true
}

async function tauriCreateItem(targetPath: string, type: 'file' | 'dir', content = ''): Promise<boolean> {
  const fs = await import('@tauri-apps/plugin-fs')
  const p = await import('@tauri-apps/api/path')
  if (await fs.exists(targetPath)) throw new Error('File or folder already exists')
  if (type === 'dir') {
    await fs.mkdir(targetPath, { recursive: true })
  } else {
    await fs.mkdir(await p.dirname(targetPath), { recursive: true })
    await fs.writeTextFile(targetPath, content)
  }
  return true
}

async function tauriDeleteItem(targetPath: string): Promise<boolean> {
  const fs = await import('@tauri-apps/plugin-fs')
  if (!(await fs.exists(targetPath))) throw new Error('Path does not exist')
  await fs.remove(targetPath, { recursive: true })
  return true
}

async function tauriRenameItem(oldPath: string, newPath: string): Promise<boolean> {
  const fs = await import('@tauri-apps/plugin-fs')
  if (!oldPath || !newPath || !(await fs.exists(oldPath))) throw new Error('Invalid path')
  await fs.rename(oldPath, newPath)
  return true
}

// ---- Web dev-server backend (/api/fs) ----
async function webListVault(dirPath: string): Promise<{ dir: string; items: VaultFileItem[] }> {
  const res = await fetch(`/api/fs/list?dir=${encodeURIComponent(dirPath)}`)
  if (!res.ok) throw new Error(`HTTP error ${res.status}`)
  const data = await res.json()
  return { dir: data.dir || dirPath, items: data.items || [] }
}

// ---- Public API (ưu tiên backend cắm ngoài, rồi Tauri, rồi web) ----
export async function listVault(dirPath: string = DEFAULT_VAULT_PATH): Promise<{ dir: string; items: VaultFileItem[] }> {
  if (customBackend) return customBackend.listVault(dirPath)
  if (isTauri()) return await tauriListVault(dirPath)
  return await webListVault(dirPath)
}

export async function readFileFromVault(filePath: string): Promise<{ content: string; name: string; ext: string }> {
  if (customBackend) return customBackend.readFile(filePath)
  if (isTauri()) return tauriReadFile(filePath)
  const res = await fetch(`/api/fs/read?path=${encodeURIComponent(filePath)}`)
  if (!res.ok) {
    throw new Error(`Failed to read file ${filePath}: ${res.statusText}`)
  }
  const data = await res.json()
  return {
    content: data.content ?? '',
    name: data.name || filePath.split('/').pop() || 'Untitled',
    ext: data.ext || '',
  }
}

export async function writeFileToVault(filePath: string, content: string): Promise<boolean> {
  if (customBackend) return customBackend.writeFile(filePath, content)
  if (isTauri()) return tauriWriteFile(filePath, content)
  const res = await fetch('/api/fs/write', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: filePath, content }),
  })
  if (!res.ok) throw new Error(`Failed to write file ${filePath}`)
  const data = await res.json()
  return data.success === true
}

export async function createVaultItem(
  targetPath: string,
  type: 'file' | 'dir',
  content = ''
): Promise<boolean> {
  if (customBackend) return customBackend.createItem(targetPath, type, content)
  if (isTauri()) return tauriCreateItem(targetPath, type, content)
  const res = await fetch('/api/fs/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: targetPath, type, content }),
  })
  if (!res.ok) throw new Error(`Failed to create item ${targetPath}`)
  const data = await res.json()
  return data.success === true
}

export async function deleteVaultItem(targetPath: string): Promise<boolean> {
  if (customBackend) return customBackend.deleteItem(targetPath)
  if (isTauri()) return tauriDeleteItem(targetPath)
  const res = await fetch('/api/fs/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: targetPath }),
  })
  if (!res.ok) throw new Error(`Failed to delete item ${targetPath}`)
  const data = await res.json()
  return data.success === true
}

export async function renameVaultItem(oldPath: string, newPath: string): Promise<boolean> {
  if (customBackend) return customBackend.renameItem(oldPath, newPath)
  if (isTauri()) return tauriRenameItem(oldPath, newPath)
  const res = await fetch('/api/fs/rename', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oldPath, newPath }),
  })
  if (!res.ok) throw new Error(`Failed to rename item ${oldPath}`)
  const data = await res.json()
  return data.success === true
}

export function detectEditorMode(filePath: string, content?: string): EditorMode {
  const lower = filePath.toLowerCase()

  // MyNote physical notebook format:
  if (
    lower.endsWith('.mynote.md') ||
    lower.endsWith('.excalidraw.md') ||
    lower.endsWith('.mynote') ||
    lower.endsWith('.excalidraw')
  ) {
    return 'mynote'
  }

  // If content contains our digital notebook marker (mybook mới, excalidraw cũ):
  if (
    content &&
    (content.includes('mybook-plugin:') ||
      content.includes('excalidraw-plugin:') ||
      content.includes('Digital Notebook Excalidraw Data') ||
      content.includes('# Excalidraw Data'))
  ) {
    return 'mynote'
  }

  // Code extensions:
  const codeExts = [
    '.js',
    '.ts',
    '.jsx',
    '.tsx',
    '.py',
    '.json',
    '.css',
    '.scss',
    '.html',
    '.sh',
    '.bash',
    '.sql',
    '.c',
    '.cpp',
    '.h',
    '.hpp',
    '.rs',
    '.go',
    '.yaml',
    '.yml',
    '.xml',
    '.java',
    '.php',
  ]
  if (codeExts.some((ext) => lower.endsWith(ext))) {
    return 'code'
  }

  // Markdown default
  return 'markdown'
}
