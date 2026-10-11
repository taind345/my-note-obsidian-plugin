import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { VaultFileItem, EditorMode } from '../types/notebook'
import { isTauri } from '../utils/tauriFs'
import {
  Folder,
  FolderOpen,
  FileText,
  BookOpen,
  Code,
  Image as ImageIcon,
  ChevronRight,
  ChevronDown,
  Plus,
  Search,
  RefreshCw,
  FolderPlus,
  Trash2,
  Edit2,
  FolderSync,
  X,
  Settings,
} from 'lucide-react'

interface ObsidianSidebarProps {
  currentVaultPath: string
  activeFilePath: string | null
  items: VaultFileItem[]
  isLoading: boolean
  onOpenFile: (path: string, mode?: EditorMode) => void
  onOpenFolder: (path: string) => Promise<boolean>
  onCreateItem: (parentDir: string, type: 'file' | 'dir', name: string, isMyNote?: boolean) => void
  onDeleteItem: (path: string) => void
  onRenameItem: (oldPath: string, newPath: string) => void
  onRefresh: () => void
  onOpenSettings?: () => void
}

export function ObsidianSidebar({
  currentVaultPath,
  activeFilePath,
  items,
  isLoading,
  onOpenFile,
  onOpenFolder,
  onCreateItem,
  onDeleteItem,
  onRenameItem,
  onRefresh,
  onOpenSettings,
}: ObsidianSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('mybook_expanded_folders')
      if (stored) return new Set(JSON.parse(stored))
    } catch {}
    return new Set()
  })
  const [isFolderPickerOpen, setIsFolderPickerOpen] = useState(false)
  const [customVaultInput, setCustomVaultInput] = useState(currentVaultPath)
  const [vaultError, setVaultError] = useState('')

  const openFolderPicker = () => {
    setCustomVaultInput(currentVaultPath)
    setVaultError('')
    setIsFolderPickerOpen(true)
  }

  const handleSubmitVault = async (e: React.FormEvent) => {
    e.preventDefault()
    setVaultError('')
    const clean = customVaultInput.trim()
    if (!clean) {
      setVaultError('Nhập đường dẫn thư mục trên máy.')
      return
    }
    const ok = await onOpenFolder(clean)
    if (ok) {
      setIsFolderPickerOpen(false)
    } else {
      setVaultError(`Không mở được "${clean}". Kiểm tra lại đường dẫn có tồn tại.`)
    }
  }

  // Chọn thư mục bằng hộp thoại native của hệ điều hành (chỉ app Tauri desktop)
  const handleBrowseVault = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const picked = await open({ directory: true, multiple: false, title: 'Chọn thư mục Vault' })
      if (typeof picked === 'string' && picked) {
        setCustomVaultInput(picked)
        setVaultError('')
      }
    } catch {
      setVaultError('Trình duyệt web không hỗ trợ chọn thư mục — hãy nhập đường dẫn tay.')
    }
  }

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    item: VaultFileItem
  } | null>(null)

  // Inline creation state
  type CreationKind = 'markdown' | 'mynote' | 'code' | 'folder'
  const [creationKind, setCreationKind] = useState<CreationKind>(() => {
    const p = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
    const c = p?.get('create') as CreationKind | null
    return c && ['markdown', 'mynote', 'code', 'folder'].includes(c) ? c : 'markdown'
  })
  const [codeExt, setCodeExt] = useState<string>('.py')
  const [creationModal, setCreationModal] = useState<{
    isOpen: boolean
    type: 'file' | 'dir'
    parentDir: string
    isMyNote?: boolean
  }>(() => {
    const p = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
    const c = p?.get('create') as CreationKind | null
    if (c && ['markdown', 'mynote', 'code', 'folder'].includes(c)) {
      return {
        isOpen: true,
        type: c === 'folder' ? 'dir' : 'file',
        parentDir: currentVaultPath,
        isMyNote: c === 'mynote',
      }
    }
    return {
      isOpen: false,
      type: 'file',
      parentDir: currentVaultPath,
      isMyNote: false,
    }
  })
  const [newItemName, setNewItemName] = useState(() => {
    const p = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
    const c = p?.get('create') as CreationKind | null
    if (c === 'code') return 'main'
    if (c === 'mynote') return 'Topic'
    if (c === 'folder') return 'New Folder'
    return 'Untitled'
  })

  // Rename modal
  const [renameTarget, setRenameTarget] = useState<VaultFileItem | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const sidebarRef = useRef<HTMLDivElement | null>(null)

  // Auto-expand first level on initial load
  useEffect(() => {
    setCustomVaultInput(currentVaultPath)
  }, [currentVaultPath])

  // Close context menu on outside click
  useEffect(() => {
    const handleOutsideClick = () => {
      if (contextMenu) {
        setContextMenu(null)
      }
    }
    window.addEventListener('click', handleOutsideClick)
    return () => window.removeEventListener('click', handleOutsideClick)
  }, [contextMenu])

  const toggleFolder = (folderPath: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(folderPath)) {
        next.delete(folderPath)
      } else {
        next.add(folderPath)
      }
      try {
        localStorage.setItem('mybook_expanded_folders', JSON.stringify(Array.from(next)))
      } catch {}
      return next
    })
  }

  const handleItemClick = (item: VaultFileItem, e: React.MouseEvent) => {
    if (item.isDirectory) {
      toggleFolder(item.path, e)
    } else {
      onOpenFile(item.path)
    }
  }

  const handleContextMenu = (e: React.MouseEvent, item: VaultFileItem) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      item,
    })
  }

  const handleStartCreation = (
    kindOrType: 'file' | 'dir' | CreationKind = 'markdown',
    isMyNote = false,
    parentDir = currentVaultPath
  ) => {
    let resolvedKind: CreationKind = 'markdown'
    if (kindOrType === 'dir' || kindOrType === 'folder') {
      resolvedKind = 'folder'
    } else if (kindOrType === 'mynote' || isMyNote) {
      resolvedKind = 'mynote'
    } else if (kindOrType === 'code') {
      resolvedKind = 'code'
    } else {
      resolvedKind = 'markdown'
    }

    setCreationKind(resolvedKind)
    setCreationModal({
      isOpen: true,
      type: resolvedKind === 'folder' ? 'dir' : 'file',
      parentDir,
      isMyNote: resolvedKind === 'mynote',
    })
    setNewItemName(
      resolvedKind === 'mynote'
        ? 'Untitled'
        : resolvedKind === 'folder'
        ? 'New Folder'
        : resolvedKind === 'code'
        ? 'script'
        : 'Untitled'
    )
  }

  const handleConfirmCreation = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newItemName.trim()) return

    let finalName = newItemName.trim()
    let type: 'file' | 'dir' = 'file'
    let isMyNote = false

    if (creationKind === 'folder') {
      type = 'dir'
    } else if (creationKind === 'mynote') {
      isMyNote = true
      if (!finalName.endsWith('.mynote.md') && !finalName.endsWith('.md')) {
        finalName += '.mynote.md'
      }
    } else if (creationKind === 'markdown') {
      if (!finalName.endsWith('.md')) {
        finalName += '.md'
      }
    } else if (creationKind === 'code') {
      if (!finalName.includes('.')) {
        finalName += codeExt
      }
    }

    onCreateItem(
      creationModal.parentDir,
      type,
      finalName,
      isMyNote
    )
    setCreationModal({ ...creationModal, isOpen: false })
    setNewItemName('')
  }

  const handleStartRename = (item: VaultFileItem) => {
    setRenameTarget(item)
    setRenameValue(item.name)
    setContextMenu(null)
  }

  const handleConfirmRename = (e: React.FormEvent) => {
    e.preventDefault()
    if (!renameTarget || !renameValue.trim() || renameValue === renameTarget.name) {
      setRenameTarget(null)
      return
    }
    const parentDir = renameTarget.path.substring(0, renameTarget.path.lastIndexOf('/'))
    const newPath = `${parentDir}/${renameValue.trim()}`
    onRenameItem(renameTarget.path, newPath)
    setRenameTarget(null)
  }

  const vaultName = currentVaultPath.split('/').filter(Boolean).pop() || 'Vault'

  // Recursive item renderer
  const renderItem = (item: VaultFileItem, depth = 0) => {
    const isExpanded = expandedFolders.has(item.path)
    const isSelected = activeFilePath === item.path
    const isMyNote =
      item.name.endsWith('.mynote.md') ||
      item.name.endsWith('.excalidraw.md') ||
      item.name.endsWith('.mynote')

    // Filter by search query if present
    if (searchQuery.trim()) {
      const match = item.name.toLowerCase().includes(searchQuery.toLowerCase())
      if (!match && !item.isDirectory) return null
    }

    return (
      <div key={item.path} className="vault-tree-node">
        <div
          className={`vault-tree-item ${isSelected ? 'active' : ''} ${item.isDirectory ? 'is-dir' : 'is-file'}`}
          style={{ paddingLeft: `${depth * 14 + 10}px` }}
          onClick={(e) => handleItemClick(item, e)}
          onContextMenu={(e) => handleContextMenu(e, item)}
          title={item.path}
        >
          {item.isDirectory ? (
            <span className="folder-chevron" onClick={(e) => toggleFolder(item.path, e)}>
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
          ) : (
            <span className="file-indent-space" />
          )}

          <span className="item-icon">
            {item.isDirectory ? (
              isExpanded ? (
                <FolderOpen size={14} className="color-folder-open" />
              ) : (
                <Folder size={14} className="color-folder" />
              )
            ) : isMyNote ? (
              <BookOpen size={14} className="color-mynote" />
            ) : item.ext === '.md' ? (
              <FileText size={14} className="color-md" />
            ) : ['.png', '.jpg', '.jpeg', '.gif', '.svg'].includes(item.ext) ? (
              <ImageIcon size={14} className="color-img" />
            ) : (
              <Code size={14} className="color-code" />
            )}
          </span>

          <span className="item-label">{item.name}</span>
        </div>

        {/* Recursive Children if folder is expanded */}
        {item.isDirectory && isExpanded && item.children && (
          <div className="vault-subtree">
            {item.children.length === 0 ? (
              <div
                className="vault-empty-folder-hint"
                style={{ paddingLeft: `${(depth + 1) * 14 + 16}px` }}
              >
                (Empty folder)
              </div>
            ) : (
              item.children.map((child) => renderItem(child, depth + 1))
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <aside className="obsidian-sidebar-container" ref={sidebarRef}>
      {/* 1. Vault Header */}
      <div className="vault-header">
        <div
          className="vault-name-badge"
          onClick={openFolderPicker}
          title="Click to open or change folder"
        >
          <FolderSync size={14} className="vault-icon" />
          <span className="vault-title">{vaultName}</span>
          <ChevronDown size={12} className="vault-dropdown-arrow" />
        </div>

        {/* Action icons like Obsidian */}
        <div className="vault-actions-group">
          {/* New Note */}
          <button
            type="button"
            className="vault-action-icon-btn"
            onClick={() => handleStartCreation('markdown')}
            title="New Markdown Note (.md)"
          >
            <Plus size={14} />
          </button>

          {/* New MyNote */}
          <button
            type="button"
            className="vault-action-icon-btn highlight-mynote"
            onClick={() => handleStartCreation('mynote')}
            title="New MyNote (Vở viết vật lý)"
          >
            <BookOpen size={14} />
          </button>

          {/* New Code File */}
          <button
            type="button"
            className="vault-action-icon-btn highlight-code"
            onClick={() => handleStartCreation('code')}
            title="New Code File (.js, .ts, .py, etc.)"
          >
            <Code size={14} />
          </button>

          {/* New Folder */}
          <button
            type="button"
            className="vault-action-icon-btn"
            onClick={() => handleStartCreation('folder')}
            title="New Folder"
          >
            <FolderPlus size={14} />
          </button>

          {/* Refresh */}
          <button
            type="button"
            className={`vault-action-icon-btn ${isLoading ? 'spinning' : ''}`}
            onClick={onRefresh}
            title="Refresh files"
          >
            <RefreshCw size={13} />
          </button>

          {/* Settings & Shortcuts */}
          {onOpenSettings && (
            <button
              type="button"
              className="vault-action-icon-btn settings-sidebar-btn"
              onClick={onOpenSettings}
              title="Settings & Shortcuts (Ctrl+,)"
            >
              <Settings size={14} />
            </button>
          )}

          {/* Nút collapse đã bỏ — dùng nút sidebar duy nhất trên thanh tab */}

        </div>
      </div>

      {/* 2. Quick Search Bar */}
      <div className="vault-search-box">
        <Search size={13} className="search-icon" />
        <input
          type="text"
          className="search-input"
          placeholder="Filter files..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button
            type="button"
            className="search-clear-btn"
            onClick={() => setSearchQuery('')}
            title="Clear filter"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* 3. Folder Tree List */}
      <div className="vault-file-tree">
        {isLoading && items.length === 0 ? (
          <div className="vault-loading-state">
            <RefreshCw size={16} className="spin-icon" />
            <span>Loading vault...</span>
          </div>
        ) : items.length === 0 ? (
          <div className="vault-empty-state">
            <p>No files found in folder.</p>
            <button
              type="button"
              className="open-sample-btn"
              onClick={() =>
                onOpenFolder('/home/ti/Desktop/DATA_DESKTOP/0_Obsidian notebook/red')
              }
            >
              Open 'red' Vault
            </button>
          </div>
        ) : (
          items.map((item) => renderItem(item, 0))
        )}
      </div>

      {/* Doodle cây chân sidebar giống ảnh demo/theme1 (cây to + quote viết tay) */}
      <div className="sidebar-pastel-doodle" aria-hidden="true">
        <img src="/doodles/plant-sidebar.png" alt="" draggable={false} />
        <span>
          Small steps
          <br />
          make big progress ♡
        </span>
      </div>

      {/* 4. Vault Folder Picker Modal */}
      {isFolderPickerOpen &&
        createPortal(
          <div
            className="folder-picker-overlay"
            onClick={() => setIsFolderPickerOpen(false)}
          >
            <div className="folder-picker-modal" onClick={(e) => e.stopPropagation()}>
              <form onSubmit={handleSubmitVault}>
              <div className="modal-header">
                <h3>Open Folder / Vault</h3>
                <button
                  type="button"
                  className="modal-close"
                  onClick={() => setIsFolderPickerOpen(false)}
                >
                  <X size={15} />
                </button>
              </div>
              <div className="modal-body">
                <label>Folder Path on Computer:</label>
                <div className="vault-path-row">
                  <input
                    type="text"
                    className="folder-path-input"
                    value={customVaultInput}
                    onChange={(e) => {
                      setCustomVaultInput(e.target.value)
                      setVaultError('')
                    }}
                    placeholder="/path/to/your/obsidian/notes"
                    autoFocus
                  />
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleBrowseVault}
                    title="Chọn thư mục bằng hộp thoại hệ thống (app desktop)"
                    style={{ display: isTauri() ? undefined : 'none' }}
                  >
                    Browse...
                  </button>
                </div>
                {vaultError && <div className="vault-error-banner">{vaultError}</div>}

                <div className="quick-presets">
                  <span className="preset-label">Quick Access Folders:</span>
                  <button
                    type="button"
                    className="preset-btn"
                    onClick={() =>
                      setCustomVaultInput(
                        '/home/ti/Desktop/DATA_DESKTOP/0_Obsidian notebook/red'
                      )
                    }
                  >
                    📁 red (Obsidian Notebook Root)
                  </button>
                  <button
                    type="button"
                    className="preset-btn"
                    onClick={() =>
                      setCustomVaultInput(
                        '/home/ti/Desktop/DATA_DESKTOP/0_Obsidian notebook/red/portswigger'
                      )
                    }
                  >
                    📁 red / portswigger
                  </button>
                  <button
                    type="button"
                    className="preset-btn"
                    onClick={() =>
                      setCustomVaultInput(
                        '/home/ti/Desktop/DATA_DESKTOP/0_Obsidian notebook/red/ctf'
                      )
                    }
                  >
                    📁 red / ctf
                  </button>
                  <button
                    type="button"
                    className="preset-btn"
                    onClick={() =>
                      setCustomVaultInput(
                        '/home/ti/Desktop/DATA_DESKTOP/0_Obsidian notebook/red/1-kiến thức bên lề'
                      )
                    }
                  >
                    📁 red / 1-kiến thức bên lề
                  </button>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setIsFolderPickerOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                >
                  Open Vault
                </button>
              </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* 5. Create Item Modal */}
      {creationModal.isOpen &&
        createPortal(
          <div
            className="folder-picker-overlay"
            onClick={() => setCreationModal({ ...creationModal, isOpen: false })}
          >
            <div className="folder-picker-modal creation-modal-card" onClick={(e) => e.stopPropagation()}>
              <form onSubmit={handleConfirmCreation}>
                <div className="modal-header">
                  <h3>
                    {creationKind === 'folder'
                      ? '📁 New Folder'
                      : creationKind === 'mynote'
                      ? '📖 New MyNote (Vở viết vật lý)'
                      : creationKind === 'code'
                      ? '💻 New Code File'
                      : '📝 New Markdown Note'}
                  </h3>
                  <button
                    type="button"
                    className="modal-close"
                    onClick={() => setCreationModal({ ...creationModal, isOpen: false })}
                  >
                    <X size={15} />
                  </button>
                </div>

                {/* Kind Tabs */}
                <div className="creation-kind-tabs">
                  <button
                    type="button"
                    className={`kind-tab-btn ${creationKind === 'markdown' ? 'active md' : ''}`}
                    onClick={() => {
                      setCreationKind('markdown')
                      if (!newItemName || newItemName === 'Untitled' || newItemName === 'script' || newItemName === 'New Folder') {
                        setNewItemName('Untitled')
                      }
                    }}
                  >
                    <FileText size={14} />
                    <span>Markdown</span>
                  </button>

                  <button
                    type="button"
                    className={`kind-tab-btn ${creationKind === 'mynote' ? 'active mynote' : ''}`}
                    onClick={() => {
                      setCreationKind('mynote')
                      if (!newItemName || newItemName === 'Untitled' || newItemName === 'script' || newItemName === 'New Folder') {
                        setNewItemName('Untitled')
                      }
                    }}
                  >
                    <BookOpen size={14} />
                    <span>MyNote</span>
                  </button>

                  <button
                    type="button"
                    className={`kind-tab-btn ${creationKind === 'code' ? 'active code' : ''}`}
                    onClick={() => {
                      setCreationKind('code')
                      if (!newItemName || newItemName === 'Untitled' || newItemName === 'script' || newItemName === 'New Folder') {
                        setNewItemName('script')
                      }
                    }}
                  >
                    <Code size={14} />
                    <span>Code</span>
                  </button>

                  <button
                    type="button"
                    className={`kind-tab-btn ${creationKind === 'folder' ? 'active folder' : ''}`}
                    onClick={() => {
                      setCreationKind('folder')
                      if (!newItemName || newItemName === 'Untitled' || newItemName === 'script' || newItemName === 'New Folder') {
                        setNewItemName('New Folder')
                      }
                    }}
                  >
                    <FolderPlus size={14} />
                    <span>Folder</span>
                  </button>
                </div>

                <div className="modal-body">
                  {/* Target Directory hint */}
                  <div className="creation-location-row">
                    <span className="location-label">Destination Folder:</span>
                    <span className="location-path" title={creationModal.parentDir}>
                      📁 {creationModal.parentDir.split('/').slice(-2).join('/') || creationModal.parentDir}
                    </span>
                  </div>

                  {/* Code Extension Presets if code is selected */}
                  {creationKind === 'code' && (
                    <div className="code-ext-selection-group">
                      <span className="ext-presets-label">File Type / Extension:</span>
                      <div className="code-ext-chips">
                        {[
                          { ext: '.js', label: 'JavaScript' },
                          { ext: '.ts', label: 'TypeScript' },
                          { ext: '.py', label: 'Python' },
                          { ext: '.html', label: 'HTML' },
                          { ext: '.css', label: 'CSS' },
                          { ext: '.json', label: 'JSON' },
                          { ext: '.sql', label: 'SQL' },
                          { ext: '.sh', label: 'Shell' },
                          { ext: '.cpp', label: 'C++' },
                          { ext: '.rs', label: 'Rust' },
                          { ext: '.go', label: 'Go' },
                        ].map((item) => (
                          <button
                            key={item.ext}
                            type="button"
                            className={`ext-chip-btn ${codeExt === item.ext ? 'active' : ''}`}
                            onClick={() => setCodeExt(item.ext)}
                          >
                            {item.label} <span className="chip-ext">{item.ext}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Name Input with Live Badge */}
                  <label className="creation-name-label">
                    {creationKind === 'folder' ? 'Folder Name:' : 'File Name:'}
                  </label>
                  <div className="creation-input-wrapper">
                    <input
                      type="text"
                      className="folder-path-input creation-name-input"
                      value={newItemName}
                      onChange={(e) => setNewItemName(e.target.value)}
                      autoFocus
                      placeholder={
                        creationKind === 'folder'
                          ? 'folder-name'
                          : creationKind === 'code'
                          ? 'filename'
                          : creationKind === 'mynote'
                          ? 'Topic'
                          : 'Note-title'
                      }
                    />
                    {creationKind !== 'folder' && (
                      <span className="creation-ext-badge">
                        {creationKind === 'mynote'
                          ? (newItemName.endsWith('.mynote.md') || newItemName.endsWith('.md') ? '' : '.mynote.md')
                          : creationKind === 'markdown'
                          ? (newItemName.endsWith('.md') ? '' : '.md')
                          : creationKind === 'code'
                          ? (newItemName.includes('.') ? '' : codeExt)
                          : ''}
                      </span>
                    )}
                  </div>
                </div>

                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn-cancel"
                    onClick={() => setCreationModal({ ...creationModal, isOpen: false })}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary">
                    <Plus size={14} /> Create {creationKind === 'folder' ? 'Folder' : 'File'}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* 6. Rename Modal */}
      {renameTarget &&
        createPortal(
          <div
            className="folder-picker-overlay"
            onClick={() => setRenameTarget(null)}
          >
            <div className="folder-picker-modal" onClick={(e) => e.stopPropagation()}>
              <form onSubmit={handleConfirmRename}>
                <div className="modal-header">
                  <h3>Rename {renameTarget.isDirectory ? 'Folder' : 'File'}</h3>
                  <button
                    type="button"
                    className="modal-close"
                    onClick={() => setRenameTarget(null)}
                  >
                    <X size={15} />
                  </button>
                </div>
                <div className="modal-body">
                  <label>New Name:</label>
                  <input
                    type="text"
                    className="folder-path-input"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn-cancel"
                    onClick={() => setRenameTarget(null)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary">
                    Rename
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* 7. Right Click Context Menu */}
      {contextMenu && (
        <div
          className="vault-context-menu"
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          onClick={(e) => e.stopPropagation()}
        >
          {!contextMenu.item.isDirectory && (
            <button
              type="button"
              className="context-menu-item"
              onClick={() => {
                onOpenFile(contextMenu.item.path)
                setContextMenu(null)
              }}
            >
              <FileText size={14} />
              <span>Open in Editor</span>
            </button>
          )}

          {contextMenu.item.isDirectory && (
            <>
              <button
                type="button"
                className="context-menu-item"
                onClick={() => {
                  handleStartCreation('markdown', false, contextMenu.item.path)
                  setContextMenu(null)
                }}
              >
                <Plus size={14} />
                <span>New Note Here (.md)</span>
              </button>

              <button
                type="button"
                className="context-menu-item highlight"
                onClick={() => {
                  handleStartCreation('mynote', true, contextMenu.item.path)
                  setContextMenu(null)
                }}
              >
                <BookOpen size={14} />
                <span>New MyNote Here</span>
              </button>

              <button
                type="button"
                className="context-menu-item"
                onClick={() => {
                  handleStartCreation('code', false, contextMenu.item.path)
                  setContextMenu(null)
                }}
              >
                <Code size={14} />
                <span>New Code File Here</span>
              </button>

              <button
                type="button"
                className="context-menu-item"
                onClick={() => {
                  handleStartCreation('folder', false, contextMenu.item.path)
                  setContextMenu(null)
                }}
              >
                <FolderPlus size={14} />
                <span>New Folder Here</span>
              </button>

              <button
                type="button"
                className="context-menu-item"
                onClick={() => {
                  onOpenFolder(contextMenu.item.path)
                  setContextMenu(null)
                }}
              >
                <FolderSync size={14} className="color-folder" />
                <span>Set as Vault Root</span>
              </button>
            </>
          )}

          <button
            type="button"
            className="context-menu-item"
            onClick={() => handleStartRename(contextMenu.item)}
          >
            <Edit2 size={14} />
            <span>Rename</span>
          </button>

          <button
            type="button"
            className="context-menu-item danger"
            onClick={() => {
              if (
                window.confirm(
                  `Are you sure you want to delete "${contextMenu.item.name}"?`
                )
              ) {
                onDeleteItem(contextMenu.item.path)
              }
              setContextMenu(null)
            }}
          >
            <Trash2 size={14} />
            <span>Delete</span>
          </button>
        </div>
      )}
    </aside>
  )
}
