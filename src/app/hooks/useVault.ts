import { useCallback, useEffect, useMemo, useState } from 'react'
import type { VaultFileItem } from '@/shared/types/notebook'
import { DEFAULT_VAULT_PATH, listVault } from '@/services/vaultService'
import { setVaultFileIndex } from '@/shared/lib/tauriFs'

/**
 * Vault state: đường dẫn root + cây file + loading + refresh.
 * Giữ nguyên semantics App.tsx: cache localStorage, clean trailing slash,
 * trả boolean để modal báo lỗi, flatten + setVaultFileIndex cho Tauri.
 */
export function useVault() {
  const [currentVaultPath, setCurrentVaultPath] = useState(
    () => localStorage.getItem('mybook_vault_path') || DEFAULT_VAULT_PATH
  )
  const [vaultItems, setVaultItems] = useState<VaultFileItem[]>(() => {
    try {
      const cached = localStorage.getItem('mybook_cached_vault_items')
      if (cached) return JSON.parse(cached)
    } catch {}
    return []
  })
  const [isLoadingVault, setIsLoadingVault] = useState(false)

  const refreshVault = useCallback(async (dirPath = ''): Promise<boolean> => {
    const target = (dirPath || localStorage.getItem('mybook_vault_path') || DEFAULT_VAULT_PATH)
      .trim()
      .replace(/\/+$/, '') || '/'
    setIsLoadingVault(true)
    try {
      const data = await listVault(target)
      setCurrentVaultPath(target)
      setVaultItems(data.items)
      localStorage.setItem('mybook_vault_path', target)
      localStorage.setItem('mybook_cached_vault_items', JSON.stringify(data.items))
      return true
    } catch (err) {
      console.error('Failed to load vault items:', err)
      return false
    } finally {
      setIsLoadingVault(false)
    }
  }, [])

  useEffect(() => {
    refreshVault(currentVaultPath)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentVaultPath])

  const vaultFiles = useMemo(() => {
    const out: Array<{ name: string; path: string }> = []
    const walk = (items: VaultFileItem[]) => {
      for (const it of items) {
        if (!it.isDirectory) out.push({ name: it.name, path: it.path })
        if (it.children) walk(it.children)
      }
    }
    walk(vaultItems)
    return out
  }, [vaultItems])

  useEffect(() => {
    setVaultFileIndex(vaultFiles)
  }, [vaultFiles])

  return { currentVaultPath, vaultItems, isLoadingVault, vaultFiles, refreshVault }
}
