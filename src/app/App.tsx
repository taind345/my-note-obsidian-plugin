import { useState, useEffect, useRef, useCallback } from 'react'
import { X } from 'lucide-react'
import type {
  PageData,
  NotebookMetadata,
  ToolType,
  DrawingElement,
  TextBoxData,
  PageImageData,
  PaperPattern,
  ViewSpreadMode,
  EditorTab,
  EditorMode,
  VaultFileItem,
} from '@/shared/types/notebook'
import {
  loadNotebookMeta,
  saveNotebookMeta,
  loadPage,
  savePage,
  deletePageData,
  getDefaultFallbackNotebook,
  getEmptyNotebook,
} from '@/services/storage'
import {
  exportNotebookToMarkdown,
  importNotebookFromMarkdown,
  downloadMarkdownFile,
  readMarkdownFile,
} from '@/services/markdownFile'
import {
  readFileFromVault,
  writeFileToVault,
  createVaultItem,
  deleteVaultItem,
  renameVaultItem,
  detectEditorMode,
} from '@/services/vaultService'
import { ExportPdfModal } from '@/shared/ui/ExportPdfModal'
import { ObsidianSidebar } from '@/features/vault/components/ObsidianSidebar'
import { TabBar } from '@/features/workspace/components/TabBar'
import { PureMarkdownEditor } from '@/features/markdown/components/PureMarkdownEditor'
import { CodeEditor } from '@/features/markdown/components/CodeEditor'
import { NewFileLinkModal } from '@/features/workspace/components/NewFileLinkModal'
import { SettingsModal, DEFAULT_SHORTCUTS, type AppShortcuts, type AppTheme } from '@/shared/ui/SettingsModal'
import { debounce } from '@/shared/lib/debounce'
import { loadFont, saveFont } from '@/shared/lib/fonts'
import { SplitMynotePane } from '@/features/notebook/components/SplitMynotePane'
import { QuickOpenModal } from '@/features/workspace/components/QuickOpenModal'
import { SplitPicker } from '@/features/workspace/components/SplitPicker'
import '@/App.css'
import { matchShortcut } from '@/shared/lib/shortcuts'
import { useNotebookHistory } from '@/features/notebook/hooks/useNotebookHistory'
import { useVault } from './hooks/useVault'
import { MynoteWorkspace } from './components/MynoteWorkspace'

/** Chuẩn hóa path vault để so khớp tab (tránh lệch trailing slash) */
function normalizeVaultPath(p: string): string {
  return (p || '').trim().replace(/\/+$/, '')
}

/**
 * Tab trắng tinh tái dùng được khi mở file (kiểu transient tab của Obsidian):
 * chưa gắn file + chưa dirty + chưa có nội dung người dùng. Tab fallback có
 * sẵn nội dung mẫu nên không bao giờ lọt vào đây → không mất dữ liệu.
 */
function isPristineTab(tab: EditorTab): boolean {
  if (tab.path || tab.isDirty) return false
  if (tab.mode === 'mynote') {
    const pages = tab.notebookData?.pages ?? []
    return pages.every(
      (p) =>
        (p.textBoxes?.length ?? 0) === 0 &&
        (p.drawings?.length ?? 0) === 0 &&
        ((p.images ?? []).length ?? 0) === 0
    )
  }
  return !(tab.content || '').trim()
}

export default function App() {
  const initialFallback = getDefaultFallbackNotebook()

  // App color theme (Mặc định / Pastel "Better Notes")
  const [appTheme, setAppTheme] = useState<AppTheme>(() => {
    try {
      return localStorage.getItem('mybook_app_theme') === 'pastel' ? 'pastel' : 'default'
    } catch {
      return 'default'
    }
  })

  const handleChangeTheme = (theme: AppTheme) => {
    setAppTheme(theme)
    try {
      localStorage.setItem('mybook_app_theme', theme)
    } catch {}
  }

  // Settings & Shortcuts state
  const [isSettingsOpen, setIsSettingsOpen] = useState(() => {
    const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
    return params?.get('settings') === '1'
  })
  const [shortcuts, setShortcuts] = useState<AppShortcuts>(() => {
    try {
      const saved = localStorage.getItem('mybook_custom_shortcuts')
      if (saved) return { ...DEFAULT_SHORTCUTS, ...JSON.parse(saved) }
    } catch {}
    return DEFAULT_SHORTCUTS
  })

  const handleUpdateShortcuts = (newShortcuts: AppShortcuts) => {
    setShortcuts(newShortcuts)
    try {
      localStorage.setItem('mybook_custom_shortcuts', JSON.stringify(newShortcuts))
    } catch {}
  }

  // 1. Sidebar & Vault State (vault logic nằm ở hooks/useVault)
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
    return params?.get('sidebar') === '0' ? false : true
  })
  const { currentVaultPath, vaultItems, isLoadingVault, vaultFiles, refreshVault } = useVault()

  // 2. Tabs State
  const [tabs, setTabs] = useState<EditorTab[]>(() => {
    const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
    const queryMode = params?.get('mode')
    if (queryMode === 'markdown') {
      return [
        {
          id: 'initial_md_tab',
          path: '',
          title: 'Demo Note.md',
          mode: 'markdown',
          isDirty: false,
          content: `# Kiến Thức Bên Lề\n\nĐây là file ghi chú Markdown thuần giống như Obsidian.\n\n## 1. Tính năng nổi bật\n- Trải nghiệm gõ cuộn 1 trang truyền thống mượt mà.\n- Hỗ trợ đầy đủ cú pháp Obsidian Markdown:\n  - [x] Checkbox công việc trực quan\n  - ==Đoạn văn bản highlight màu vàng==\n  - [[Liên kết hai chiều Wikilink]]\n  - Bảng biểu (Tables) và khối mã code (Code blocks)\n\n## 2. Hình ảnh đính kèm (Embedded Vault Image)\n![[Pasted image 20260812134936.png|450]]\n\n## 3. Bảng tổng hợp mẫu\n| Thành phần | Trạng thái | Ghi chú |\n| :--- | :--- | :--- |\n| Pure Markdown | Hoàn tất | Cuộn 1 trang kiểu Obsidian |\n| Physical Notebook | Hoàn tất | Bút mực calligraphy mượt mà |\n| File Manager | Hoàn tất | Sidebar đóng/mở tiện lợi |\n`,
        },
      ]
    }
    return [
      {
        id: 'default_notebook_tab',
        path: '',
        title: 'Physical Notebook',
        mode: 'mynote',
        isDirty: false,
        notebookData: {
          meta: initialFallback.meta,
          pages: initialFallback.pages,
        },
      },
    ]
  })
  const [activeTabId, setActiveTabId] = useState<string>(() => {
    const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
    return params?.get('mode') === 'markdown' ? 'initial_md_tab' : 'default_notebook_tab'
  })

  // 3. New File Link Modal State
  const [newFileModal, setNewFileModal] = useState<{
    isOpen: boolean
    targetName: string
  }>({
    isOpen: false,
    targetName: '',
  })

  // 4. Active Notebook State (for mynote mode)
  const [meta, setMeta] = useState<NotebookMetadata | null>(() => initialFallback.meta)
  const [pages, setPages] = useState<PageData[]>(() => initialFallback.pages)
  const [currentPageIndex, setCurrentPageIndex] = useState(0)

  // 5. Drawing & Styling State
  const [activeTool, setActiveTool] = useState<ToolType>('select')
  const [strokeColor, setStrokeColor] = useState('#1e293b')
  const [strokeWidth, setStrokeWidth] = useState(3) // 5 levels: 1.5, 3, 5, 8, 12
  const [paperPattern, setPaperPattern] = useState<PaperPattern>('ruled')
  const [viewMode, setViewMode] = useState<ViewSpreadMode>('spread')
  const [flipAnimation, setFlipAnimation] = useState(true)
  const [isFlipping, setIsFlipping] = useState(false)
  const [flipDirection, setFlipDirection] = useState<'next' | 'prev'>('next')
  const [flipPhase, setFlipPhase] = useState<'closing' | 'opening' | null>(null)
  const [fontFamily, setFontFamily] = useState('cascadia')
  // Font riêng cho markdown / code (mặc định Cascadia, lưu localStorage)
  const [mdFont, setMdFont] = useState(() => loadFont('markdown'))
  const [codeFont, setCodeFont] = useState(() => loadFont('code'))
  const [zoom, setZoom] = useState(1.0)

  const [selectedTextBoxIds, setSelectedTextBoxIds] = useState<string[]>([])
  // Multi-select kiểu Excalidraw (kéo vùng chọn): id đầu mảng = primary
  const [selectedDrawingIds, setSelectedDrawingIds] = useState<string[]>([])
  const [selectedImageIds, setSelectedImageIds] = useState<string[]>([])

  // Tool Lock & Hand-drawn Styling
  const [isToolLocked, setIsToolLocked] = useState(false)
  const [handDrawnStyle, setHandDrawnStyle] = useState(true)

  // Autosave status
  const [autosaveStatus, setAutosaveStatus] = useState<'saved' | 'saving' | 'dirty'>('saved')
  const dirtyPageIds = useRef<Set<string>>(new Set())

  // PDF Export Modal
  const [showExportModal, setShowExportModal] = useState(false)

  // Workspace reference for wheel scroll
  const workspaceRef = useRef<HTMLElement | null>(null)
  const wheelDebounceRef = useRef<number>(0)

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0]

  // Hydrate initial notebook from storage if available
  useEffect(() => {
    async function hydrate() {
      try {
        const storedMeta = await loadNotebookMeta()
        if (storedMeta && storedMeta.pageIds && storedMeta.pageIds.length > 0) {
          const loaded: PageData[] = []
          for (const pid of storedMeta.pageIds) {
            const p = await loadPage(pid)
            if (p) loaded.push(p)
          }
          if (loaded.length > 0) {
            setMeta(storedMeta)
            setPages(loaded)
            if (loaded[0]?.pattern) {
              setPaperPattern(loaded[0].pattern)
            } else if (storedMeta.settings?.defaultPattern) {
              setPaperPattern(storedMeta.settings.defaultPattern)
            }
            const resolvedFont =
              storedMeta.settings?.fontFamily && storedMeta.settings.fontFamily !== 'handwriting'
                ? storedMeta.settings.fontFamily
                : 'cascadia'
            setFontFamily(resolvedFont)
            setTabs((curr) =>
              curr.map((t) =>
                t.id === 'default_notebook_tab'
                  ? { ...t, notebookData: { meta: storedMeta, pages: loaded } }
                  : t
              )
            )
          }
        }
      } catch (err) {
        console.warn('Storage hydration warning:', err)
      }
    }
    hydrate()
  }, [])

  // Đưa nội dung 1 tab mynote lên workspace (dùng chung cho chuyển tab + tái dùng tab)
  const applyTabToWorkspace = useCallback((tab: EditorTab) => {
    if (tab.mode !== 'mynote' || !tab.notebookData) return
    setMeta(tab.notebookData.meta)
    setPages(tab.notebookData.pages)
    setCurrentPageIndex(0)
    if (tab.notebookData.pages[0]?.pattern) {
      setPaperPattern(tab.notebookData.pages[0].pattern)
    } else if (tab.notebookData.meta?.settings?.defaultPattern) {
      setPaperPattern(tab.notebookData.meta.settings.defaultPattern)
    }
    if (tab.notebookData.meta?.settings?.fontFamily) {
      const tabFont =
        tab.notebookData.meta.settings.fontFamily !== 'handwriting'
          ? tab.notebookData.meta.settings.fontFamily
          : 'cascadia'
      setFontFamily(tabFont)
    }
  }, [])

  // Sync activeTab notebookData to local state when tab changes
  useEffect(() => {
    if (activeTab) applyTabToWorkspace(activeTab)
  }, [activeTabId, applyTabToWorkspace])

  // Debounced Autosave for Physical Notebook
  const debouncedAutosave = useRef(
    debounce(async (pagesSnapshot: PageData[], metaSnapshot: NotebookMetadata | null, tab: EditorTab) => {
      const pids = Array.from(dirtyPageIds.current)
      if (pids.length === 0 && !metaSnapshot) return

      setAutosaveStatus('saving')

      // Save dirty pages to IndexedDB
      for (const pid of pids) {
        const pageToSave = pagesSnapshot.find((p) => p.id === pid)
        if (pageToSave) await savePage(pageToSave)
      }
      dirtyPageIds.current.clear()

      if (metaSnapshot) {
        await saveNotebookMeta({ ...metaSnapshot, updatedAt: Date.now() })
      }

      // If tab has a file path on disk, write it directly!
      if (tab.path && metaSnapshot) {
        try {
          const md = exportNotebookToMarkdown(metaSnapshot, pagesSnapshot)
          await writeFileToVault(tab.path, md)
        } catch (err) {
          console.warn('Failed to write notebook to disk:', err)
        }
      }

      setAutosaveStatus('saved')
      setTabs((curr) => curr.map((t) => (t.id === tab.id ? { ...t, isDirty: false } : t)))
    }, 2000)
  ).current

  const markPageDirty = useCallback(
    (pageId: string, updatedPages: PageData[]) => {
      dirtyPageIds.current.add(pageId)
      setAutosaveStatus('dirty')
      if (activeTab) {
        setTabs((curr) =>
          curr.map((t) =>
            t.id === activeTab.id
              ? {
                  ...t,
                  isDirty: true,
                  notebookData: meta ? { meta, pages: updatedPages } : t.notebookData,
                }
              : t
          )
        )
        debouncedAutosave(updatedPages, meta, activeTab)
      }
    },
    [debouncedAutosave, meta, activeTab]
  )

  // Undo / Redo cho vở vật lý (stacks nằm trong hook, semantics giữ nguyên)
  const { pushHistory, handleUndo, handleRedo, canUndo, canRedo } = useNotebookHistory(setPages, {
    onDirty: (pageId, updatedPages) => markPageDirty(pageId, updatedPages),
  })

  // Page Content Mutations
  const handleAddTextBox = useCallback(
    (pageId: string, newBox: TextBoxData) => {
      setPages((curr) => {
        const target = curr.find((p) => p.id === pageId)
        if (target) pushHistory(pageId, target)

        const updated = curr.map((p) =>
          p.id === pageId
            ? { ...p, textBoxes: [...p.textBoxes, newBox], updatedAt: Date.now() }
            : p
        )
        markPageDirty(pageId, updated)
        return updated
      })
    },
    [pushHistory, markPageDirty]
  )

  const handleUpdateTextBox = useCallback(
    (pageId: string, boxId: string, updates: Partial<TextBoxData>) => {
      setPages((curr) => {
        const updated = curr.map((p) => {
          if (p.id !== pageId) return p
          return {
            ...p,
            textBoxes: p.textBoxes.map((b) => (b.id === boxId ? { ...b, ...updates } : b)),
            updatedAt: Date.now(),
          }
        })
        markPageDirty(pageId, updated)
        return updated
      })
    },
    [markPageDirty]
  )

  const handleDeleteTextBox = useCallback(
    (pageId: string, boxId: string) => {
      setPages((curr) => {
        const target = curr.find((p) => p.id === pageId)
        if (target) pushHistory(pageId, target)

        const updated = curr.map((p) =>
          p.id === pageId
            ? {
                ...p,
                textBoxes: p.textBoxes.filter((b) => b.id !== boxId),
                updatedAt: Date.now(),
              }
            : p
        )
        markPageDirty(pageId, updated)
        return updated
      })
      setSelectedTextBoxIds((curr) => curr.filter((id) => id !== boxId))
    },
    [pushHistory, markPageDirty]
  )

  const handleDuplicateTextBox = useCallback(
    (pageId: string, boxId: string) => {
      setPages((curr) => {
        const target = curr.find((p) => p.id === pageId)
        if (!target) return curr
        const box = target.textBoxes.find((b) => b.id === boxId)
        if (!box) return curr

        pushHistory(pageId, target)
        const clone: TextBoxData = {
          ...box,
          id: `tb_${pageId}_${Date.now()}`,
          x: Math.min(box.x + 20, 800 - box.width),
          y: Math.min(box.y + 32, 1050),
          isEditing: false,
          isLocked: false,
        }

        const updated = curr.map((p) =>
          p.id === pageId ? { ...p, textBoxes: [...p.textBoxes, clone] } : p
        )
        markPageDirty(pageId, updated)
        setSelectedTextBoxIds([clone.id])
        setSelectedDrawingIds([])
        setSelectedImageIds([])
        return updated
      })
    },
    [pushHistory, markPageDirty]
  )

  const handleSelectTextBox = useCallback((id: string | null) => {
    setSelectedTextBoxIds(id ? [id] : [])
  }, [])

  const handleSelectTextBoxes = useCallback((ids: string[]) => {
    setSelectedTextBoxIds(ids)
  }, [])

  const handleAddDrawingElement = useCallback(
    (pageId: string, elem: DrawingElement) => {
      setPages((curr) => {
        const target = curr.find((p) => p.id === pageId)
        if (target) pushHistory(pageId, target)

        const updated = curr.map((p) =>
          p.id === pageId
            ? { ...p, drawings: [...p.drawings, elem], updatedAt: Date.now() }
            : p
        )
        markPageDirty(pageId, updated)
        return updated
      })
      setSelectedDrawingIds([elem.id])
      setSelectedImageIds([])
    },
    [pushHistory, markPageDirty]
  )

  const handleUpdateDrawingElement = useCallback(
    (pageId: string, elemId: string, updates: Partial<DrawingElement>) => {
      setPages((curr) => {
        const updated = curr.map((p) => {
          if (p.id !== pageId) return p
          return {
            ...p,
            drawings: p.drawings.map((d) => (d.id === elemId ? { ...d, ...updates } : d)),
            updatedAt: Date.now(),
          }
        })
        markPageDirty(pageId, updated)
        return updated
      })
    },
    [markPageDirty]
  )

  const handleRemoveDrawingElement = useCallback(
    (pageId: string, elemId: string) => {
      setPages((curr) => {
        const target = curr.find((p) => p.id === pageId)
        if (target) pushHistory(pageId, target)

        const updated = curr.map((p) =>
          p.id === pageId
            ? {
                ...p,
                drawings: p.drawings.filter((d) => d.id !== elemId),
                updatedAt: Date.now(),
              }
            : p
        )
        markPageDirty(pageId, updated)
        return updated
      })
      setSelectedDrawingIds((curr) => curr.filter((id) => id !== elemId))
    },
    [pushHistory, markPageDirty]
  )

  // --- Sắp xếp layer: Đưa lên trên (front) / Đưa xuống dưới (back) ---
  const handleReorderDrawing = useCallback(
    (pageId: string, elemId: string, direction: 'front' | 'back') => {
      setPages((curr) => {
        const target = curr.find((p) => p.id === pageId)
        if (!target) return curr
        const idx = target.drawings.findIndex((d) => d.id === elemId)
        if (idx < 0) return curr
        pushHistory(pageId, target)
        const next = [...target.drawings]
        const [elem] = next.splice(idx, 1)
        if (direction === 'front') next.push(elem)
        else next.unshift(elem)
        const updated = curr.map((p) =>
          p.id === pageId ? { ...p, drawings: next, updatedAt: Date.now() } : p
        )
        markPageDirty(pageId, updated)
        return updated
      })
    },
    [pushHistory, markPageDirty]
  )

  const handleReorderImage = useCallback(
    (pageId: string, imageId: string, direction: 'front' | 'back') => {
      setPages((curr) => {
        const target = curr.find((p) => p.id === pageId)
        if (!target) return curr
        const list = target.images ?? []
        const idx = list.findIndex((im) => im.id === imageId)
        if (idx < 0) return curr
        pushHistory(pageId, target)
        const next = [...list]
        const [img] = next.splice(idx, 1)
        if (direction === 'front') next.push(img)
        else next.unshift(img)
        const updated = curr.map((p) =>
          p.id === pageId ? { ...p, images: next, updatedAt: Date.now() } : p
        )
        markPageDirty(pageId, updated)
        return updated
      })
    },
    [pushHistory, markPageDirty]
  )

  // --- Pasted Image Mutations (Ctrl+V / drag-drop / nút Ảnh) ---
  // Mặc định ảnh mới paste NẰM DƯỚI cùng (dưới chữ + nét vẽ) để dễ viết/vẽ đè lên
  const handleAddImage = useCallback(
    (pageId: string, img: PageImageData) => {
      setPages((curr) => {
        const target = curr.find((p) => p.id === pageId)
        if (target) pushHistory(pageId, target)

        const updated = curr.map((p) =>
          p.id === pageId
            ? { ...p, images: [img, ...(p.images ?? [])], updatedAt: Date.now() }
            : p
        )
        markPageDirty(pageId, updated)
        return updated
      })
      setSelectedImageIds([img.id])
      setSelectedDrawingIds([])
      setSelectedTextBoxIds([])
    },
    [pushHistory, markPageDirty]
  )

  const handleUpdateImage = useCallback(
    (pageId: string, imageId: string, updates: Partial<PageImageData>) => {
      setPages((curr) => {
        const updated = curr.map((p) => {
          if (p.id !== pageId) return p
          return {
            ...p,
            images: (p.images ?? []).map((im) => (im.id === imageId ? { ...im, ...updates } : im)),
            updatedAt: Date.now(),
          }
        })
        markPageDirty(pageId, updated)
        return updated
      })
    },
    [markPageDirty]
  )

  const handleRemoveImage = useCallback(
    (pageId: string, imageId: string) => {
      setPages((curr) => {
        const target = curr.find((p) => p.id === pageId)
        if (target) pushHistory(pageId, target)

        const updated = curr.map((p) =>
          p.id === pageId
            ? {
                ...p,
                images: (p.images ?? []).filter((im) => im.id !== imageId),
                updatedAt: Date.now(),
              }
            : p
        )
        markPageDirty(pageId, updated)
        return updated
      })
      setSelectedImageIds((curr) => curr.filter((id) => id !== imageId))
    },
    [pushHistory, markPageDirty]
  )

  const handleDuplicateImage = useCallback(
    (pageId: string, imageId: string) => {
      setPages((curr) => {
        const target = curr.find((p) => p.id === pageId)
        if (!target) return curr
        const img = (target.images ?? []).find((i) => i.id === imageId)
        if (!img) return curr

        pushHistory(pageId, target)
        const clone: PageImageData = {
          ...img,
          id: `img_${pageId}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          x: Math.min(800 - img.width - 16, img.x + 20),
          y: Math.min(1100 - img.height - 60, img.y + 20),
          isLocked: false,
        }
        const updated = curr.map((p) =>
          p.id === pageId ? { ...p, images: [...(p.images ?? []), clone], updatedAt: Date.now() } : p
        )
        markPageDirty(pageId, updated)
        setSelectedImageIds([clone.id])
        return updated
      })
    },
    [pushHistory, markPageDirty]
  )

  const handleSelectDrawingId = useCallback(
    (id: string | null) => {
      setSelectedDrawingIds(id ? [id] : [])
      if (id) {
        for (const p of pages) {
          const found = p.drawings.find((d) => d.id === id)
          if (found) {
            setStrokeColor(found.color)
            setStrokeWidth(found.strokeWidth)
            break
          }
        }
      }
    },
    [pages]
  )

  // Multi-select từ kéo vùng (marquee) hoặc Shift+Click
  const handleSelectDrawings = useCallback(
    (ids: string[]) => {
      setSelectedDrawingIds(ids)
      const primary = ids[0]
      if (primary) {
        for (const p of pages) {
          const found = p.drawings.find((d) => d.id === primary)
          if (found) {
            setStrokeColor(found.color)
            setStrokeWidth(found.strokeWidth)
            break
          }
        }
      }
    },
    [pages]
  )

  const handleSelectImages = useCallback((ids: string[]) => {
    setSelectedImageIds(ids)
  }, [])

  const handleChangeStrokeColor = useCallback(
    (color: string) => {
      setStrokeColor(color)
      if (selectedDrawingIds.length > 0) {
        for (const p of pages) {
          const hits = p.drawings.filter((d) => selectedDrawingIds.includes(d.id))
          if (hits.length > 0) {
            for (const h of hits) handleUpdateDrawingElement(p.id, h.id, { color })
            break
          }
        }
      }
    },
    [selectedDrawingIds, pages, handleUpdateDrawingElement]
  )

  const handleChangeStrokeWidth = useCallback(
    (width: number) => {
      setStrokeWidth(width)
      if (selectedDrawingIds.length > 0) {
        for (const p of pages) {
          const hits = p.drawings.filter((d) => selectedDrawingIds.includes(d.id))
          if (hits.length > 0) {
            for (const h of hits) handleUpdateDrawingElement(p.id, h.id, { strokeWidth: width })
            break
          }
        }
      }
    },
    [selectedDrawingIds, pages, handleUpdateDrawingElement]
  )

  // 6. Fixed 2-Page Spread Navigation
  // In spread mode, always anchors to even indices [0, 2, 4,...] so pages 1-2, 3-4, 5-6 are always paired!
  const handleNavigatePage = useCallback(
    (targetIndex: number) => {
      const maxIndex = Math.max(0, pages.length - 1)
      let safeIndex = Math.max(0, Math.min(maxIndex, targetIndex))

      if (viewMode === 'spread') {
        safeIndex = Math.floor(safeIndex / 2) * 2
      }

      if (safeIndex === currentPageIndex) return

      if (viewMode === 'spread' && flipAnimation && !isFlipping) {
        setIsFlipping(true)
        setFlipDirection(safeIndex > currentPageIndex ? 'next' : 'prev')
        setFlipPhase('closing')

        // Stage 1 (0 to 180ms): active sheet curls up to 90 degrees edge-on
        setTimeout(() => {
          setCurrentPageIndex(safeIndex)
          setFlipPhase('opening')

          // Stage 2 (180 to 360ms): new sheet uncurls to flat
          setTimeout(() => {
            setIsFlipping(false)
            setFlipPhase(null)
          }, 180)
        }, 180)
      } else {
        setCurrentPageIndex(safeIndex)
      }
    },
    [currentPageIndex, viewMode, pages.length, flipAnimation, isFlipping]
  )

  // Horizontal wheel navigation
  useEffect(() => {
    const ws = workspaceRef.current
    if (!ws || viewMode !== 'single-horizontal') return

    const handleWheel = (e: WheelEvent) => {
      const now = Date.now()
      if (now - wheelDebounceRef.current < 250) return

      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      if (Math.abs(delta) > 25) {
        wheelDebounceRef.current = now
        if (delta > 0 && currentPageIndex < pages.length - 1) {
          handleNavigatePage(currentPageIndex + 1)
        } else if (delta < 0 && currentPageIndex > 0) {
          handleNavigatePage(currentPageIndex - 1)
        }
      }
    }

    ws.addEventListener('wheel', handleWheel, { passive: true })
    return () => ws.removeEventListener('wheel', handleWheel)
  }, [viewMode, currentPageIndex, pages.length, handleNavigatePage])

  // Page Add / Delete
  const handleAddPage = useCallback(() => {
    const newPageNum = pages.length + 1
    const newPageId = `page_${Date.now()}`
    const activePattern = pages[currentPageIndex]?.pattern || paperPattern || meta?.settings?.defaultPattern || 'ruled'
    const newPage: PageData = {
      id: newPageId,
      pageNumber: newPageNum,
      pattern: activePattern,
      textBoxes: [],
      drawings: [],
      images: [],
      updatedAt: Date.now(),
    }

    const updatedPages = [...pages, newPage]
    setPages(updatedPages)

    let nextMeta = meta
    if (meta) {
      nextMeta = {
        ...meta,
        pageIds: [...meta.pageIds, newPageId],
        updatedAt: Date.now(),
      }
      setMeta(nextMeta)
      saveNotebookMeta(nextMeta)
    }

    setTabs((curr) =>
      curr.map((t) =>
        t.id === activeTabId
          ? {
              ...t,
              isDirty: true,
              notebookData: t.notebookData
                ? {
                    meta: nextMeta || t.notebookData.meta,
                    pages: updatedPages,
                  }
                : undefined,
            }
          : t
      )
    )

    markPageDirty(newPageId, updatedPages)
    const targetIdx = viewMode === 'spread' ? Math.floor(pages.length / 2) * 2 : pages.length
    handleNavigatePage(targetIdx)
  }, [pages, currentPageIndex, paperPattern, meta, activeTabId, markPageDirty, viewMode, handleNavigatePage])

  const handleDeleteCurrentPage = useCallback(() => {
    if (pages.length <= 1) return
    const pageToDelete = pages[currentPageIndex]
    if (!pageToDelete) return

    deletePageData(pageToDelete.id)
    const updatedPages = pages
      .filter((p) => p.id !== pageToDelete.id)
      .map((p, idx) => ({ ...p, pageNumber: idx + 1 }))

    setPages(updatedPages)
    let updatedMeta = meta
    if (meta) {
      updatedMeta = {
        ...meta,
        pageIds: meta.pageIds.filter((id) => id !== pageToDelete.id),
        updatedAt: Date.now(),
      }
      setMeta(updatedMeta)
      saveNotebookMeta(updatedMeta)
    }

    setTabs((curr) =>
      curr.map((t) =>
        t.id === activeTabId
          ? {
              ...t,
              isDirty: true,
              notebookData: t.notebookData
                ? {
                    meta: updatedMeta || t.notebookData.meta,
                    pages: updatedPages,
                  }
                : undefined,
            }
          : t
      )
    )

    setCurrentPageIndex((idx) => Math.max(0, Math.min(updatedPages.length - 1, idx)))
  }, [pages, currentPageIndex, meta, activeTabId])

  const handleChangePaperPattern = useCallback(
    async (pattern: PaperPattern) => {
      setPaperPattern(pattern)
      const updatedPages = pages.map((p) => ({ ...p, pattern }))
      setPages(updatedPages)
      for (const p of updatedPages) {
        dirtyPageIds.current.add(p.id)
        await savePage(p)
      }
      let nextMeta = meta
      if (meta) {
        nextMeta = {
          ...meta,
          settings: { ...meta.settings, pattern },
          updatedAt: Date.now(),
        }
        setMeta(nextMeta)
        await saveNotebookMeta(nextMeta)
      }
      setTabs((curr) =>
        curr.map((t) =>
          t.id === activeTabId
            ? {
                ...t,
                isDirty: true,
                notebookData: t.notebookData
                  ? {
                      meta: nextMeta || t.notebookData.meta,
                      pages: updatedPages,
                    }
                  : undefined,
              }
            : t
        )
      )
    },
    [pages, meta, activeTabId]
  )

  // 7. Tab Operations
  const handleSelectTab = (tabId: string) => {
    setActiveTabId(tabId)
  }

  const handleCloseTab = (tabId: string) => {
    if (tabs.length === 1) return // Keep at least one tab
    const nextTabs = tabs.filter((t) => t.id !== tabId)
    setTabs(nextTabs)
    if (activeTabId === tabId) {
      setActiveTabId(nextTabs[0].id)
    }
    if (splitTabId === tabId) {
      const fallback = nextTabs.find((t) => t.id !== activeTabId && t.id !== tabId)
      setSplitTabId(fallback ? fallback.id : null)
    }
  }

  const createTab = (mode: EditorMode): EditorTab => {
    const newId = `tab_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
    if (mode === 'mynote') {
      const fresh = getEmptyNotebook(`Notebook ${tabs.length + 1}`, paperPattern)
      return {
        id: newId,
        path: '',
        title: `Notebook ${tabs.length + 1}`,
        mode: 'mynote',
        notebookData: fresh,
      }
    } else if (mode === 'code') {
      return {
        id: newId,
        path: '',
        title: 'untitled.js',
        mode: 'code',
        content: '// Code editor\nconsole.log("Hello from MyBook!");\n',
      }
    }
    return {
      id: newId,
      path: '',
      title: 'Untitled.md',
      mode: 'markdown',
      content: '# Untitled Note\n\nStart typing here...\n',
    }
  }

  const handleNewTab = (mode: EditorMode) => {
    const newTab = createTab(mode)
    setTabs([...tabs, newTab])
    setActiveTabId(newTab.id)
  }

  // --- Split view: chia màn hình 2 note (pane phải độc lập với tab trái) ---
  const [splitView, setSplitView] = useState(false)
  const [splitTabId, setSplitTabId] = useState<string | null>(null)
  const [splitPickerOpen, setSplitPickerOpen] = useState(false)

  // Nút split trên tab bar: đang split thì tắt, chưa thì mở panel chọn pane phải
  const handleSplitButton = () => {
    if (splitView) {
      setSplitView(false)
      return
    }
    setSplitPickerOpen(true)
  }

  const enableSplitWith = (tabId: string) => {
    setSplitTabId(tabId)
    setSplitView(true)
    setSplitPickerOpen(false)
  }

  // Mở file vào pane phải (không đụng tab trái đang xem)
  const handleOpenFileForSplit = async (filePath: string) => {
    const cleanPath = normalizeVaultPath(filePath)
    const existing = tabs.find((t) => t.path && normalizeVaultPath(t.path) === cleanPath)
    if (existing) {
      if (existing.id !== activeTabId) enableSplitWith(existing.id)
      else setSplitPickerOpen(false)
      return
    }
    try {
      const { content, name } = await readFileFromVault(cleanPath)
      const mode = detectEditorMode(cleanPath, content)
      let tabData: Partial<EditorTab> = { content }
      if (mode === 'mynote') {
        const parsed = importNotebookFromMarkdown(content)
        if (parsed) {
          tabData = { notebookData: parsed }
        } else {
          const title = name.replace(/\.(mynote|excalidraw)?\.md$/, '')
          tabData = { notebookData: getEmptyNotebook(title, paperPattern) }
        }
      }
      const newTab: EditorTab = {
        id: `tab_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        path: cleanPath,
        title: name,
        mode,
        isDirty: false,
        ...tabData,
      }
      setTabs((curr) => [...curr, newTab])
      enableSplitWith(newTab.id)
    } catch (err) {
      console.error('Failed to open file for split:', err)
    }
  }

  const handleNewTabForSplit = (mode: EditorMode) => {
    const newTab = createTab(mode)
    setTabs((curr) => [...curr, newTab])
    setSplitTabId(newTab.id)
  }

  const splitTab: EditorTab | null = splitView
    ? tabs.find((t) => t.id === splitTabId && t.id !== activeTabId) ??
      tabs.find((t) => t.id !== activeTabId) ??
      null
    : null

  // Quick Open (Ctrl+O) tìm file kiểu Obsidian
  const [quickOpen, setQuickOpen] = useState(false)

  // 8. Open File into Tab
  const handleOpenFile = async (filePath: string, preferredMode?: EditorMode) => {
    const cleanPath = normalizeVaultPath(filePath)
    if (!cleanPath) return
    // TH1 (chuẩn Obsidian): file đã mở ở tab nào thì focus về tab đó, không mở thêm
    const existing = tabs.find((t) => t.path && normalizeVaultPath(t.path) === cleanPath)
    if (existing) {
      setActiveTabId(existing.id)
      return
    }

    try {
      const { content, name } = await readFileFromVault(cleanPath)
      const mode = preferredMode || detectEditorMode(cleanPath, content)

      let tabData: Partial<EditorTab> = { content }

      if (mode === 'mynote') {
        const parsed = importNotebookFromMarkdown(content)
        if (parsed) {
          tabData = { notebookData: parsed }
        } else {
          const title = name.replace(/\.(mynote|excalidraw)?\.md$/, '')
          const fresh = getEmptyNotebook(title, paperPattern)
          tabData = { notebookData: fresh }
        }
      }

      // TH2 (chuẩn Obsidian): tab đang đứng là tab trắng tinh thì tái dùng nó
      // thay vì đẻ tab mới mỗi lần click file
      const active = tabs.find((t) => t.id === activeTabId)
      if (active && isPristineTab(active)) {
        const replaced: EditorTab = {
          ...active,
          path: cleanPath,
          title: name,
          mode,
          isDirty: false,
          content: mode === 'mynote' ? undefined : content,
          notebookData: mode === 'mynote' ? tabData.notebookData : undefined,
        }
        setTabs((curr) => curr.map((t) => (t.id === active.id ? replaced : t)))
        applyTabToWorkspace(replaced)
        return
      }

      const newTab: EditorTab = {
        id: `tab_${Date.now()}`,
        path: cleanPath,
        title: name,
        mode,
        isDirty: false,
        ...tabData,
      }

      setTabs((curr) => [...curr, newTab])
      setActiveTabId(newTab.id)
    } catch (err) {
      console.error('Failed to open file:', err)
      alert(`Could not open file: ${filePath}`)
    }
  }

  // Support URL param ?file=... to open file directly on load, and ?tool=... to select tool
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const filePath = params.get('file')
    if (filePath) {
      handleOpenFile(filePath)
    }
    const tool = params.get('tool') as ToolType | null
    if (tool) {
      setActiveTool(tool)
    }
    const newfile = params.get('newfile')
    if (newfile) {
      setNewFileModal({ isOpen: true, targetName: newfile })
    }
    const openSettings = params.get('settings')
    if (openSettings) {
      setIsSettingsOpen(true)
    }
    const pageParam = params.get('page')
    if (pageParam !== null) {
      const p = parseInt(pageParam, 10)
      if (!isNaN(p)) {
        setCurrentPageIndex(p)
      }
    }
  }, [])

  // 9. Save Content from Pure Markdown or Code Editor
  const handleSaveTabContent = async (tabId: string, newContent: string) => {
    setTabs((curr) =>
      curr.map((t) => (t.id === tabId ? { ...t, content: newContent, isDirty: false } : t))
    )
    const targetTab = tabs.find((t) => t.id === tabId)
    if (targetTab?.path) {
      try {
        await writeFileToVault(targetTab.path, newContent)
      } catch (err) {
        console.error('Failed to write file to disk:', err)
      }
    }
  }

  // Đồng bộ notebook trong pane split phải về tab + ghi ra vault
  const handleSyncSplitNotebook = async (
    tabId: string,
    metaNB: NotebookMetadata,
    pagesNB: PageData[]
  ) => {
    setTabs((curr) =>
      curr.map((t) =>
        t.id === tabId
          ? { ...t, notebookData: { meta: metaNB, pages: pagesNB }, isDirty: false }
          : t
      )
    )
    const targetTab = tabs.find((t) => t.id === tabId)
    if (targetTab?.path) {
      try {
        await writeFileToVault(targetTab.path, exportNotebookToMarkdown(metaNB, pagesNB))
      } catch (err) {
        console.error('Failed to write split notebook to disk:', err)
      }
    }
  }

  // 10. Link Navigation & Creation Dialog
  const handleNavigateLink = useCallback(
    async (targetName: string) => {
      const clean = targetName.trim()
      if (!clean) return

      // Find file in vault items recursively
      const findFile = (items: VaultFileItem[]): VaultFileItem | null => {
        for (const it of items) {
          const baseName = it.name.replace(/\.(md|mynote\.md|excalidraw\.md)$/i, '')
          if (
            baseName.toLowerCase() === clean.toLowerCase() ||
            it.name.toLowerCase() === clean.toLowerCase() ||
            it.name.toLowerCase() === `${clean.toLowerCase()}.md`
          ) {
            return it
          }
          if (it.children) {
            const res = findFile(it.children)
            if (res) return res
          }
        }
        return null
      }

      const found = findFile(vaultItems)

      if (found && !found.isDirectory) {
        handleOpenFile(found.path)
      } else {
        // Pop up the New File creation modal matching user screenshot!
        setNewFileModal({
          isOpen: true,
          targetName: clean,
        })
      }
    },
    [vaultItems]
  )

  const handleCreateMarkdownFromLink = async (name: string) => {
    const filename = name.endsWith('.md') ? name : `${name}.md`
    const filePath = `${currentVaultPath}/${filename}`
    const initContent = `# ${name}\n\n`
    await createVaultItem(filePath, 'file', initContent)
    setNewFileModal({ isOpen: false, targetName: '' })
    refreshVault(currentVaultPath)
    handleOpenFile(filePath, 'markdown')
  }

  const handleCreateMyNoteFromLink = async (name: string) => {
    const filename = name.endsWith('.mynote.md') ? name : `${name}.mynote.md`
    const filePath = `${currentVaultPath}/${filename}`
    const fresh = getEmptyNotebook(name, paperPattern)
    const md = exportNotebookToMarkdown(fresh.meta, fresh.pages)
    await createVaultItem(filePath, 'file', md)
    setNewFileModal({ isOpen: false, targetName: '' })
    refreshVault(currentVaultPath)
    handleOpenFile(filePath, 'mynote')
  }

  // 11. Sidebar Actions (Create, Delete, Rename)
  const handleCreateVaultItem = async (
    parentDir: string,
    type: 'file' | 'dir',
    name: string,
    isMyNote = false
  ) => {
    const fullPath = `${parentDir}/${name}`
    let initialContent = ''
    if (type === 'file') {
      if (isMyNote) {
        const title = name.replace(/\.(mynote|excalidraw)?\.md$/, '')
        const fresh = getEmptyNotebook(title, paperPattern)
        initialContent = exportNotebookToMarkdown(fresh.meta, fresh.pages)
      } else if (name.endsWith('.md')) {
        initialContent = `# ${name.replace(/\.md$/, '')}\n\n`
      } else if (name.endsWith('.js') || name.endsWith('.ts')) {
        initialContent = '// JavaScript / TypeScript file\nconsole.log("Hello from MyBook!");\n'
      } else if (name.endsWith('.py')) {
        initialContent = '# Python script\nprint("Hello from MyBook!")\n'
      } else if (name.endsWith('.html')) {
        initialContent = '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <title>Document</title>\n</head>\n<body>\n  <h1>Hello World</h1>\n</body>\n</html>\n'
      } else if (name.endsWith('.css')) {
        initialContent = '/* CSS stylesheet */\nbody {\n  font-family: sans-serif;\n  margin: 0;\n  padding: 20px;\n}\n'
      } else if (name.endsWith('.json')) {
        initialContent = '{\n  "name": "example",\n  "version": "1.0.0"\n}\n'
      } else if (name.endsWith('.sh')) {
        initialContent = '#!/bin/bash\necho "Hello World"\n'
      } else if (name.endsWith('.sql')) {
        initialContent = '-- SQL queries\nSELECT 1;\n'
      } else if (name.endsWith('.rs')) {
        initialContent = 'fn main() {\n    println!("Hello World!");\n}\n'
      } else if (name.endsWith('.go')) {
        initialContent = 'package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("Hello World!")\n}\n'
      } else if (name.endsWith('.cpp')) {
        initialContent = '#include <iostream>\n\nint main() {\n    std::cout << "Hello World!\\n";\n    return 0;\n}\n'
      }
    }

    await createVaultItem(fullPath, type, initialContent)
    await refreshVault(currentVaultPath)

    if (type === 'file') {
      handleOpenFile(fullPath, isMyNote ? 'mynote' : undefined)
    }
  }

  const handleDeleteVaultItem = async (targetPath: string) => {
    await deleteVaultItem(targetPath)
    // Close tab if open
    const openTab = tabs.find((t) => t.path === targetPath)
    if (openTab) handleCloseTab(openTab.id)
    await refreshVault(currentVaultPath)
  }

  const handleRenameVaultItem = async (oldPath: string, newPath: string) => {
    await renameVaultItem(oldPath, newPath)
    setTabs((curr) =>
      curr.map((t) =>
        t.path === oldPath
          ? { ...t, path: newPath, title: newPath.split('/').pop() || t.title }
          : t
      )
    )
    await refreshVault(currentVaultPath)
  }

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Quick Open tìm file kiểu Obsidian (Ctrl+O) — hoạt động cả khi đang gõ
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault()
        setQuickOpen(true)
        return
      }

      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

      // Toggle Sidebar
      if (matchShortcut(e, shortcuts.toggleSidebar) || ((e.ctrlKey || e.metaKey) && e.key === '\\')) {
        e.preventDefault()
        setIsSidebarOpen((v) => !v)
        return
      }

      // Open Settings
      if (matchShortcut(e, shortcuts.openSettings) || ((e.ctrlKey || e.metaKey) && e.key === ',')) {
        e.preventDefault()
        setIsSettingsOpen(true)
        return
      }

      // Quick Save (Ctrl+S)
      if (matchShortcut(e, shortcuts.quickSave) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's')) {
        e.preventDefault()
        if (activeTab?.mode === 'mynote') {
          if (meta) {
            saveNotebookMeta(meta)
            if (activeTab?.path) {
              const md = exportNotebookToMarkdown(meta, pages)
              writeFileToVault(activeTab.path, md).catch(console.error)
            }
          }
        } else if (activeTab?.path && activeTab.content !== undefined) {
          handleSaveTabContent(activeTab.id, activeTab.content)
        }
        return
      }

      // Undo
      if (matchShortcut(e, shortcuts.undo) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey)) {
        e.preventDefault()
        handleUndo()
        return
      }

      // Redo
      if (
        matchShortcut(e, shortcuts.redo) ||
        ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z')))
      ) {
        e.preventDefault()
        handleRedo()
        return
      }

      // Page Navigation
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault()
        const step = viewMode === 'spread' ? 2 : 1
        handleNavigatePage(Math.max(0, currentPageIndex - step))
        return
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault()
        const step = viewMode === 'spread' ? 2 : 1
        handleNavigatePage(currentPageIndex + step)
        return
      }

      // Tool Lock Toggle
      if (matchShortcut(e, shortcuts.toggleToolLock) || e.key.toLowerCase() === 'q') {
        e.preventDefault()
        setIsToolLocked((prev) => !prev)
        return
      }

      // Tools
      if (matchShortcut(e, shortcuts.toolSelect) || e.key === '1' || e.key.toLowerCase() === 'v') {
        setActiveTool('select')
      } else if (matchShortcut(e, shortcuts.toolRect) || e.key === '2' || e.key.toLowerCase() === 'r') {
        setActiveTool('rect')
      } else if (matchShortcut(e, shortcuts.toolCircle) || e.key === '3' || e.key.toLowerCase() === 'c' || e.key.toLowerCase() === 'o') {
        setActiveTool('circle')
      } else if (matchShortcut(e, shortcuts.toolArrow) || e.key === '4' || e.key.toLowerCase() === 'a') {
        setActiveTool('arrow')
      } else if (matchShortcut(e, shortcuts.toolLine) || e.key === '5' || e.key.toLowerCase() === 'l') {
        setActiveTool('line')
      } else if (matchShortcut(e, shortcuts.toolPen) || e.key === '6' || e.key.toLowerCase() === 'p') {
        setActiveTool('pen')
      } else if (matchShortcut(e, shortcuts.toolText) || e.key === '7' || e.key.toLowerCase() === 't') {
        setActiveTool('text')
      } else if (matchShortcut(e, shortcuts.toolEraser) || e.key === '8' || e.key.toLowerCase() === 'e') {
        setActiveTool('eraser')
      } else if (matchShortcut(e, shortcuts.toolHighlighter) || e.key === '9' || e.key === '0' || e.key.toLowerCase() === 'h') {
        setActiveTool('highlighter')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    handleUndo,
    handleRedo,
    handleNavigatePage,
    currentPageIndex,
    viewMode,
    shortcuts,
    activeTab,
    meta,
    pages,
    handleSaveTabContent,
  ])

  // (visiblePages được tính trong renderMynoteWorkspace theo từng pane)

  // Editor render helpers (dùng chung cho single + split view)
  const renderTextEditor = (tab: EditorTab | undefined, keyPrefix = '') => {
    if (!tab) return null
    if (tab.mode === 'markdown') {
      return (
        <PureMarkdownEditor
          key={`${keyPrefix}${tab.id}`}
          filePath={tab.path}
          title={tab.title}
          content={tab.content || ''}
          onSaveContent={(content) => handleSaveTabContent(tab.id, content)}
          onNavigateLink={handleNavigateLink}
          vaultFiles={vaultFiles}
          mdFont={mdFont}
        />
      )
    }
    if (tab.mode === 'code') {
      return (
        <CodeEditor
          key={`${keyPrefix}${tab.id}`}
          filePath={tab.path}
          title={tab.title}
          content={tab.content || ''}
          onSaveContent={(content) => handleSaveTabContent(tab.id, content)}
          fontFamily={codeFont}
        />
      )
    }
    return null
  }

  // Đổi font vở (đồng bộ meta + tab) — tách từ inline trong toolbar
  const handleChangeMynoteFont = (font: string) => {
    setFontFamily(font)
    if (meta) {
      const updatedMeta: NotebookMetadata = {
        ...meta,
        settings: { ...meta.settings, fontFamily: font },
        updatedAt: Date.now(),
      }
      setMeta(updatedMeta)
      saveNotebookMeta(updatedMeta)
      setTabs((curr) =>
        curr.map((t) =>
          t.id === activeTabId
            ? { ...t, notebookData: t.notebookData ? { ...t.notebookData, meta: updatedMeta } : undefined }
            : t
        )
      )
    }
  }

  const handleExportMynoteMarkdown = () => {
    if (meta) {
      const md = exportNotebookToMarkdown(meta, pages)
      downloadMarkdownFile(`${activeTab?.title || 'notebook'}.excalidraw.md`, md)
    }
  }

  const handleImportMynoteMarkdown = async (file: File) => {
    const content = await readMarkdownFile(file)
    const parsed = importNotebookFromMarkdown(content)
    if (parsed) {
      setMeta(parsed.meta)
      setPages(parsed.pages)
      setCurrentPageIndex(0)
    }
  }

  const handleDeselectAll = () => {
    setSelectedTextBoxIds([])
    setSelectedDrawingIds([])
    setSelectedImageIds([])
  }

  // Workspace vở vật lý (pane trái). Split view ép cuộn dọc 1 trang cho gọn.
  // Presentational nằm ở components/MynoteWorkspace — App chỉ đấu nối state/handlers.
  const renderMynoteWorkspace = (forceVertical: boolean) => (
    <MynoteWorkspace
      forceVertical={forceVertical}
      viewMode={viewMode}
      pages={pages}
      currentPageIndex={currentPageIndex}
      activeTool={activeTool}
      strokeColor={strokeColor}
      strokeWidth={strokeWidth}
      paperPattern={paperPattern}
      flipAnimation={flipAnimation}
      fontFamily={fontFamily}
      linePitch={meta?.settings.linePitch || 32}
      canUndo={canUndo}
      canRedo={canRedo}
      autosaveStatus={autosaveStatus}
      hasSelectedElement={selectedDrawingIds.length > 0 || selectedImageIds.length > 0}
      isToolLocked={isToolLocked}
      handDrawnStyle={handDrawnStyle}
      isFlipping={isFlipping}
      flipDirection={flipDirection}
      flipPhase={flipPhase}
      zoom={zoom}
      isPastel={appTheme === 'pastel'}
      selectedTextBoxIds={selectedTextBoxIds}
      selectedDrawingIds={selectedDrawingIds}
      selectedImageIds={selectedImageIds}
      workspaceRef={workspaceRef}
      onSelectTool={setActiveTool}
      onToggleToolLock={() => setIsToolLocked((v) => !v)}
      onToggleHandDrawnStyle={() => setHandDrawnStyle((v) => !v)}
      onChangeStrokeColor={handleChangeStrokeColor}
      onChangeStrokeWidth={handleChangeStrokeWidth}
      onChangePaperPattern={handleChangePaperPattern}
      onChangeViewMode={setViewMode}
      onToggleFlipAnimation={() => setFlipAnimation((prev) => !prev)}
      onOpenSettings={() => setIsSettingsOpen(true)}
      onChangeFontFamily={handleChangeMynoteFont}
      onUndo={handleUndo}
      onRedo={handleRedo}
      onAddPage={handleAddPage}
      onOpenExportModal={() => setShowExportModal(true)}
      onNewNotebook={() => handleNewTab('mynote')}
      onExportMarkdown={handleExportMynoteMarkdown}
      onImportMarkdown={handleImportMynoteMarkdown}
      onDeselectAll={handleDeselectAll}
      onSelectTextBox={handleSelectTextBox}
      onSelectTextBoxes={handleSelectTextBoxes}
      onSelectDrawing={handleSelectDrawingId}
      onSelectDrawings={handleSelectDrawings}
      onUpdateTextBox={handleUpdateTextBox}
      onDeleteTextBox={handleDeleteTextBox}
      onDuplicateTextBox={handleDuplicateTextBox}
      onAddTextBox={handleAddTextBox}
      onAddDrawingElement={handleAddDrawingElement}
      onUpdateDrawingElement={handleUpdateDrawingElement}
      onRemoveDrawingElement={handleRemoveDrawingElement}
      onReorderDrawing={handleReorderDrawing}
      onSelectImages={handleSelectImages}
      onAddImage={handleAddImage}
      onUpdateImage={handleUpdateImage}
      onRemoveImage={handleRemoveImage}
      onDuplicateImage={handleDuplicateImage}
      onReorderImage={handleReorderImage}
      onAutoSwitchToSelect={() => setActiveTool('select')}
      onNavigateLink={handleNavigateLink}
      onNavigatePage={handleNavigatePage}
      onDeleteCurrentPage={handleDeleteCurrentPage}
      onZoomIn={() => setZoom((z) => Math.min(2.0, Number((z + 0.1).toFixed(1))))}
      onZoomOut={() => setZoom((z) => Math.max(0.5, Number((z - 0.1).toFixed(1))))}
      onZoomReset={() => setZoom(1.0)}
    />
  )

  // Pane phải của split view: header chọn note + nội dung (mynote cuộn dọc)
  const renderSplitRightPane = () => {
    const otherTabs = tabs.filter((t) => t.id !== activeTabId)
    return (
      <>
        <div className="split-pane-header">
          <span className="split-pane-title">Pane phải</span>
          <select
            className="compact-select split-tab-select"
            value={splitTab?.id ?? ''}
            onChange={(e) => setSplitTabId(e.target.value || null)}
            title="Chọn note hiển thị ở pane phải"
          >
            {otherTabs.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="header-action-btn"
            onClick={() => handleNewTabForSplit('markdown')}
            title="Mở note mới ở pane phải"
          >
            + Note
          </button>
          <button
            type="button"
            className="header-action-btn icon-only"
            onClick={() => setSplitView(false)}
            title="Tắt split view"
          >
            <X size={14} />
          </button>
        </div>
        <div className="split-pane-body">
          {!splitTab ? (
            <div className="split-empty-hint">Mở thêm tab để xem song song 2 note.</div>
          ) : splitTab.mode === 'mynote' ? (
            splitTab.notebookData ? (
              <SplitMynotePane
                key={splitTab.id}
                tab={splitTab}
                activeTool={activeTool}
                strokeColor={strokeColor}
                strokeWidth={strokeWidth}
                fontFamily={fontFamily}
                linePitch={meta?.settings.linePitch || 32}
                isToolLocked={isToolLocked}
                handDrawnStyle={handDrawnStyle}
                onSync={handleSyncSplitNotebook}
                onNavigateLink={handleNavigateLink}
                onAutoSwitchToSelect={() => setActiveTool('select')}
              />
            ) : (
              <div className="split-empty-hint">Notebook chưa có dữ liệu.</div>
            )
          ) : (
            renderTextEditor(splitTab, 'split-')
          )}
        </div>
      </>
    )
  }

  return (
    <div className={`app-root-container ${appTheme === 'pastel' ? 'theme-pastel' : ''}`}>
      {/* Main App Layout: Sidebar on Left, Workspace on Right */}
      <div className="app-main-layout">
        {/* Left Obsidian-Style Sidebar (luôn mount để trượt mượt, collapsed = width 0) */}
        <div className={`app-sidebar-slide ${isSidebarOpen ? '' : 'collapsed'}`}>
          <ObsidianSidebar
            currentVaultPath={currentVaultPath}
            activeFilePath={activeTab?.path || null}
            items={vaultItems}
            isLoading={isLoadingVault}
            onOpenFile={handleOpenFile}
            onOpenFolder={refreshVault}
            onCreateItem={handleCreateVaultItem}
            onDeleteItem={handleDeleteVaultItem}
            onRenameItem={handleRenameVaultItem}
            onRefresh={() => refreshVault(currentVaultPath)}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
        </div>

        {/* Center Main Workspace */}
        <div className="app-center-workspace">
          {/* Top Tab Bar (Obsidian Tabs) */}
          <TabBar
            tabs={tabs}
            activeTabId={activeTabId}
            isSidebarOpen={isSidebarOpen}
            onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
            onSelectTab={handleSelectTab}
            onCloseTab={handleCloseTab}
            onQuickOpen={() => setQuickOpen(true)}
            splitView={splitView}
            onToggleSplit={handleSplitButton}
          />

          {/* 3-in-1 Editor Display Area (chia đôi khi split view) */}
          {!splitView ? (
            activeTab?.mode === 'mynote' ? (
              renderMynoteWorkspace(false)
            ) : (
              renderTextEditor(activeTab)
            )
          ) : (
            <div className="split-panes">
              <div className="split-pane split-left">
                {activeTab?.mode === 'mynote'
                  ? renderMynoteWorkspace(true)
                  : renderTextEditor(activeTab)}
              </div>
              <div className="split-pane split-right">{renderSplitRightPane()}</div>
            </div>
          )}
            {/* PDF Export Modal (dùng chung single + split) */}
              <ExportPdfModal
                isOpen={showExportModal}
                pages={pages}
                notebookTitle={meta?.title || 'Notebook'}
                onClose={() => setShowExportModal(false)}
              />

              {/* Quick Open tìm file kiểu Obsidian (Ctrl+O, nút +) */}
              <QuickOpenModal
                isOpen={quickOpen}
                files={vaultFiles}
                onClose={() => setQuickOpen(false)}
                onOpen={handleOpenFile}
                onCreateTab={handleNewTab}
              />

              {/* Panel chọn pane phải cho split view */}
              <SplitPicker
                isOpen={splitPickerOpen}
                tabs={tabs}
                activeTabId={activeTabId}
                files={vaultFiles}
                onClose={() => setSplitPickerOpen(false)}
                onPickTab={enableSplitWith}
                onPickFile={handleOpenFileForSplit}
                onNewTabForSplit={(mode) => {
                  handleNewTabForSplit(mode)
                  setSplitView(true)
                  setSplitPickerOpen(false)
                }}
              />
        </div>
      </div>

      {/* New File Link Modal (matching user screenshot) */}
      <NewFileLinkModal
        isOpen={newFileModal.isOpen}
        targetName={newFileModal.targetName}
        onClose={() => setNewFileModal({ isOpen: false, targetName: '' })}
        onCreateMarkdown={handleCreateMarkdownFromLink}
        onCreateMyNote={handleCreateMyNoteFromLink}
      />

      {/* Settings & Shortcuts Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        fonts={{ markdown: mdFont, mynote: fontFamily, code: codeFont }}
        onChangeFont={(kind, font) => {
          if (kind === 'markdown') {
            setMdFont(font)
            saveFont('markdown', font)
            return
          }
          if (kind === 'code') {
            setCodeFont(font)
            saveFont('code', font)
            return
          }
          setFontFamily(font)
          saveFont('mynote', font)
          if (meta) {
            const updatedMeta: NotebookMetadata = {
              ...meta,
              settings: { ...meta.settings, fontFamily: font },
              updatedAt: Date.now(),
            }
            setMeta(updatedMeta)
            saveNotebookMeta(updatedMeta)
          }
        }}
        currentPattern={paperPattern}
        onChangePattern={handleChangePaperPattern}
        flipAnimation={flipAnimation}
        onToggleFlipAnimation={() => setFlipAnimation((prev) => !prev)}
        currentTheme={appTheme}
        onChangeTheme={handleChangeTheme}
        shortcuts={shortcuts}
        onUpdateShortcuts={handleUpdateShortcuts}
      />
    </div>
  )
}
