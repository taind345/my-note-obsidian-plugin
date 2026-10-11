import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import * as React from 'react'
import type {
  PageData,
  NotebookMetadata,
  ToolType,
  DrawingElement,
  TextBoxData,
  PageImageData,
} from '@/shared/types/notebook'
import { NotebookPage } from '@/features/notebook/components/NotebookPage'
import { useVirtualPages } from '@/features/notebook/hooks/useVirtualPages'
import { ExportPdfModal } from '@/shared/ui/ExportPdfModal'
import { debounce } from '@/shared/lib/debounce'
import { MiniToolbar } from './MiniToolbar'

/** Đo rộng khung cuộn chứa nó (mount cùng scroll, luôn tươi) */
function ScrollWidthReporter({ onWidth }: { onWidth: (w: number) => void }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const scroller = ref.current?.parentElement
    if (!scroller) return
    const compute = () => onWidth(scroller.clientWidth)
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(scroller)
    return () => ro.disconnect()
  }, [onWidth])
  return <span ref={ref} style={{ display: 'contents' }} />
}

interface HistoryEntry {
  pages: PageData[]
  pageIds: string[]
}

const MAX_HISTORY = 30

interface MyBookNotebookProps {
  initialMeta: NotebookMetadata
  initialPages: PageData[]
  filePath: string
  fileBasename: string
  onSave: (meta: NotebookMetadata, pages: PageData[]) => Promise<void>
  onSavePdf: (data: ArrayBuffer, filename: string) => Promise<void>
  onNavigateLink: (target: string) => void
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v))
}

/**
 * Bắt lỗi crash khi render vở và hiện thẳng trong view (thay vì trắng tinh)
 * để người dùng chụp màn hình là thấy nguyên nhân.
 */
export class MyBookErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[MyBook] render crashed:', error, info?.componentStack)
  }

  render() {
    if (this.state.error) {
      const err = this.state.error
      return (
        <div className="mybook-render-error">
          <strong>MyBook: lỗi hiển thị vở</strong>
          <div>{err.message}</div>
          <pre>{err.stack?.split('\n').slice(0, 6).join('\n')}</pre>
        </div>
      )
    }
    return this.props.children
  }
}
export function MyBookNotebook({ initialMeta, initialPages, filePath, fileBasename, onSave, onSavePdf, onNavigateLink }: MyBookNotebookProps) {
  const [meta, setMeta] = useState<NotebookMetadata>(initialMeta)
  const [pages, setPages] = useState<PageData[]>(initialPages)
  const [zoom, setZoom] = useState(1.0)
  const [activeTool, setActiveTool] = useState<ToolType>('select')
  const [strokeColor, setStrokeColor] = useState('#1e293b')
  const [strokeWidth, setStrokeWidth] = useState(4)
  const [isToolLocked, setIsToolLocked] = useState(false)
  const [savedState, setSavedState] = useState<'saved' | 'dirty'>('saved')
  const [showExport, setShowExport] = useState(false)
  // Host root (có class scope CSS): modal + node offscreen portal vào đây
  // để style áp đúng thay vì rớt ra document.body
  const hostRef = useRef<HTMLDivElement | null>(null)

  // Virtualize: chỉ mount trang trong/kề viewport (mở file tức thì, cuộn mượt)
  const pageIds = useMemo(() => pages.map((p) => p.id), [pages])
  const { visibleIds, observeRef, pinId } = useVirtualPages(pageIds)

  // Ref tới pages hiện tại cho callbacks ổn định (tránh stale closure khi memo)
  const pagesRef = useRef(pages)
  useEffect(() => {
    pagesRef.current = pages
  }, [pages])
  // Đếm id clone (tạo ngoài setState updater để updater giữ pure)
  const cloneIdRef = useRef(0)

  // Lệnh palette "Xuất PDF" từ main.ts → mở modal của đúng vở này
  useEffect(() => {
    const onRequest = (e: Event) => {
      const path = (e as CustomEvent<{ path?: string }>).detail?.path
      if (path === filePath) setShowExport(true)
    }
    window.addEventListener('mybook:export-pdf', onRequest)
    return () => window.removeEventListener('mybook:export-pdf', onRequest)
  }, [filePath])

  const [selText, setSelText] = useState<string[]>([])
  const [selDraw, setSelDraw] = useState<string[]>([])
  const [selImg, setSelImg] = useState<string[]>([])
  // Fit chiều rộng trang (800px) vào khung xem — đo live, không bám node cũ
  const scrollElRef = useRef<HTMLDivElement | null>(null)
  const [scrollW, setScrollW] = useState(0)
  const reportScrollW = useCallback((w: number) => {
    setScrollW((prev) => (prev === w ? prev : w))
  }, [])
  const fitZoom = () => {
    const el = scrollElRef.current
    const w = el ? el.clientWidth : scrollW
    if (w > 0) {
      setZoom(Number(Math.min(2.0, Math.max(0.3, (w - 32) / 800)).toFixed(2)))
    }
  }

  const undoStack = useRef<HistoryEntry[]>([])
  const redoStack = useRef<HistoryEntry[]>([])
  const [, forceHist] = useState(0)

  const linePitch = meta.settings.linePitch || 32

  const pushHistory = useCallback((snapshotPages: PageData[], snapshotIds: string[]) => {
    undoStack.current.push({ pages: clone(snapshotPages), pageIds: [...snapshotIds] })
    if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift()
    redoStack.current = []
    forceHist((x) => x + 1)
  }, [])

  const applyPages = useCallback(
    (nextPages: PageData[], nextIds?: string[]) => {
      setPages(nextPages)
      if (nextIds) {
        setMeta((m) => ({ ...m, pageIds: nextIds, updatedAt: Date.now() }))
      }
      setSavedState('dirty')
    },
    []
  )

  // Autosave về file .mynote.md
  const saveRef = useRef(onSave)
  saveRef.current = onSave
  const metaRef = useRef(meta)
  metaRef.current = meta
  const debouncedSave = useRef(
    debounce((m: NotebookMetadata, p: PageData[]) => {
      saveRef
        .current(m, p)
        .then(() => setSavedState('saved'))
        .catch(() => setSavedState('dirty'))
    }, 1200)
  ).current

  useEffect(() => {
    debouncedSave(metaRef.current, pages)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages])

  const mutatePage = useCallback(
    (pageId: string, fn: (p: PageData) => PageData, recordHistory = true) => {
      setPages((curr) => {
        const target = curr.find((p) => p.id === pageId)
        if (!target) return curr
        if (recordHistory) {
          undoStack.current.push({ pages: clone(curr), pageIds: metaRef.current.pageIds })
          if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift()
          redoStack.current = []
          forceHist((x) => x + 1)
        }
        return curr.map((p) => (p.id === pageId ? { ...fn(p), updatedAt: Date.now() } : p))
      })
      setSavedState('dirty')
    },
    []
  )

  const handleUndo = useCallback(() => {
    const prev = undoStack.current.pop()
    if (!prev) return
    setPages((curr) => {
      redoStack.current.push({ pages: clone(curr), pageIds: metaRef.current.pageIds })
      return prev.pages
    })
    setMeta((m) => ({ ...m, pageIds: prev.pageIds, updatedAt: Date.now() }))
    setSavedState('dirty')
    forceHist((x) => x + 1)
  }, [])

  const handleRedo = useCallback(() => {
    const next = redoStack.current.pop()
    if (!next) return
    setPages((curr) => {
      undoStack.current.push({ pages: clone(curr), pageIds: metaRef.current.pageIds })
      return next.pages
    })
    setMeta((m) => ({ ...m, pageIds: next.pageIds, updatedAt: Date.now() }))
    setSavedState('dirty')
    forceHist((x) => x + 1)
  }, [])

  // Ctrl+Z / Ctrl+Y của vở + phím số 1-9 chọn nhanh công cụ (bỏ qua khi đang gõ)
  const TOOL_ORDER: ToolType[] = ['select', 'rect', 'circle', 'arrow', 'line', 'pen', 'highlighter', 'text', 'eraser']
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT') return
      if (e.key >= '1' && e.key <= '9' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tool = TOOL_ORDER[Number(e.key) - 1]
        if (tool) {
          e.preventDefault()
          setActiveTool(tool)
        }
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault()
        handleUndo()
      } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        e.preventDefault()
        handleRedo()
      } else if (e.key === 'Escape') {
        setSelText([])
        setSelDraw([])
        setSelImg([])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleUndo, handleRedo])

  // --- TextBox (toàn bộ useCallback ổn định để memo NotebookPage có tác dụng) ---
  const addTextBox = useCallback(
    (pageId: string, box: TextBoxData) => {
      mutatePage(pageId, (p) => ({ ...p, textBoxes: [...p.textBoxes, box] }))
      setSelText([box.id])
      setSelDraw([])
      setSelImg([])
    },
    [mutatePage]
  )
  const updateTextBox = useCallback((pageId: string, boxId: string, u: Partial<TextBoxData>) => {
    setPages((curr) =>
      curr.map((p) =>
        p.id === pageId
          ? { ...p, textBoxes: p.textBoxes.map((b) => (b.id === boxId ? { ...b, ...u } : b)), updatedAt: Date.now() }
          : p
      )
    )
    setSavedState('dirty')
  }, [])
  const deleteTextBox = useCallback(
    (pageId: string, boxId: string) => {
      mutatePage(pageId, (p) => ({ ...p, textBoxes: p.textBoxes.filter((b) => b.id !== boxId) }))
      setSelText((c) => c.filter((id) => id !== boxId))
    },
    [mutatePage]
  )
  const duplicateTextBox = useCallback(
    (pageId: string, boxId: string) => {
      const page = pagesRef.current.find((p) => p.id === pageId)
      if (!page?.textBoxes.some((b) => b.id === boxId)) return
      const id = `tb_${pageId}_${Date.now()}_${cloneIdRef.current++}`
      mutatePage(pageId, (p) => {
        const box = p.textBoxes.find((b) => b.id === boxId)
        if (!box) return p
        const cloneBox: TextBoxData = {
          ...clone(box),
          id,
          x: Math.min(box.x + 20, 800 - box.width),
          y: Math.min(box.y + 32, 1050),
          isEditing: false,
          isLocked: false,
        }
        return { ...p, textBoxes: [...p.textBoxes, cloneBox] }
      })
      setSelText([id])
    },
    [mutatePage]
  )

  const selectTextBox = useCallback((id: string | null) => {
    setSelText(id ? [id] : [])
    if (id) {
      setSelDraw([])
      setSelImg([])
    }
  }, [])
  const selectTextBoxes = useCallback((ids: string[]) => {
    setSelText(ids)
    if (ids.length > 0) {
      setSelDraw([])
      setSelImg([])
    }
  }, [])
  const selectDrawings = useCallback((ids: string[]) => {
    setSelDraw(ids)
    if (ids.length > 0) {
      setSelText([])
      setSelImg([])
    }
  }, [])
  const selectImages = useCallback((ids: string[]) => {
    setSelImg(ids)
    if (ids.length > 0) {
      setSelText([])
      setSelDraw([])
    }
  }, [])
  const selectDrawingSingle = useCallback((id: string | null) => {
    setSelDraw(id ? [id] : [])
    if (id) {
      const found = pagesRef.current.flatMap((p) => p.drawings).find((d) => d.id === id)
      if (found) {
        setStrokeColor(found.color)
        setStrokeWidth(found.strokeWidth)
      }
    }
  }, [])

  // --- Drawing ---
  const addDrawing = useCallback(
    (pageId: string, elem: DrawingElement) => {
      mutatePage(pageId, (p) => ({ ...p, drawings: [...p.drawings, elem] }))
      setSelDraw([elem.id])
      setSelText([])
      setSelImg([])
    },
    [mutatePage]
  )
  const updateDrawing = useCallback((pageId: string, elemId: string, u: Partial<DrawingElement>) => {
    setPages((curr) =>
      curr.map((p) =>
        p.id === pageId
          ? { ...p, drawings: p.drawings.map((d) => (d.id === elemId ? { ...d, ...u } : d)), updatedAt: Date.now() }
          : p
      )
    )
    setSavedState('dirty')
  }, [])
  const removeDrawing = useCallback(
    (pageId: string, elemId: string) => {
      mutatePage(pageId, (p) => ({ ...p, drawings: p.drawings.filter((d) => d.id !== elemId) }))
      setSelDraw((c) => c.filter((id) => id !== elemId))
    },
    [mutatePage]
  )
  const reorderDrawing = useCallback(
    (pageId: string, elemId: string, dir: 'front' | 'back') => {
      const page = pagesRef.current.find((p) => p.id === pageId)
      if (!page || page.drawings.findIndex((d) => d.id === elemId) < 0) return
      mutatePage(pageId, (p) => {
        const idx = p.drawings.findIndex((d) => d.id === elemId)
        if (idx < 0) return p
        const next = [...p.drawings]
        const [el] = next.splice(idx, 1)
        if (dir === 'front') next.push(el)
        else next.unshift(el)
        return { ...p, drawings: next }
      })
    },
    [mutatePage]
  )

  // --- Image ---
  const addImage = useCallback(
    (pageId: string, img: PageImageData) => {
      mutatePage(pageId, (p) => ({ ...p, images: [img, ...(p.images ?? [])] }))
      setSelImg([img.id])
      setSelDraw([])
      setSelText([])
    },
    [mutatePage]
  )
  const updateImage = useCallback((pageId: string, imageId: string, u: Partial<PageImageData>) => {
    setPages((curr) =>
      curr.map((p) =>
        p.id === pageId
          ? { ...p, images: (p.images ?? []).map((im) => (im.id === imageId ? { ...im, ...u } : im)), updatedAt: Date.now() }
          : p
      )
    )
    setSavedState('dirty')
  }, [])
  const removeImage = useCallback(
    (pageId: string, imageId: string) => {
      mutatePage(pageId, (p) => ({ ...p, images: (p.images ?? []).filter((im) => im.id !== imageId) }))
      setSelImg((c) => c.filter((id) => id !== imageId))
    },
    [mutatePage]
  )
  const duplicateImage = useCallback(
    (pageId: string, imageId: string) => {
      const page = pagesRef.current.find((p) => p.id === pageId)
      if (!(page?.images ?? []).some((i) => i.id === imageId)) return
      const id = `img_${pageId}_${Date.now()}_${cloneIdRef.current++}`
      mutatePage(pageId, (p) => {
        const img = (p.images ?? []).find((i) => i.id === imageId)
        if (!img) return p
        const copy: PageImageData = {
          ...clone(img),
          id,
          x: Math.min(800 - img.width - 16, img.x + 20),
          y: Math.min(1100 - img.height - 60, img.y + 20),
          isLocked: false,
        }
        return { ...p, images: [...(p.images ?? []), copy] }
      })
      setSelImg([id])
    },
    [mutatePage]
  )
  const reorderImage = useCallback(
    (pageId: string, imageId: string, dir: 'front' | 'back') => {
      const page = pagesRef.current.find((p) => p.id === pageId)
      if ((page?.images ?? []).findIndex((im) => im.id === imageId) < 0) return
      mutatePage(pageId, (p) => {
        const list = p.images ?? []
        const idx = list.findIndex((im) => im.id === imageId)
        if (idx < 0) return p
        const next = [...list]
        const [im] = next.splice(idx, 1)
        if (dir === 'front') next.push(im)
        else next.unshift(im)
        return { ...p, images: next }
      })
    },
    [mutatePage]
  )
  const autoSwitchToSelect = useCallback(() => {
    if (!isToolLocked) setActiveTool('select')
  }, [isToolLocked])

  // --- Pages ---
  const addPage = () => {
    const lastPattern = pages[pages.length - 1]?.pattern || 'ruled'
    const newPage: PageData = {
      id: `page_${Date.now()}`,
      pageNumber: pages.length + 1,
      pattern: lastPattern,
      textBoxes: [],
      drawings: [],
      images: [],
      updatedAt: Date.now(),
    }
    pushHistory(pages, meta.pageIds)
    const nextPages = [...pages, newPage]
    applyPages(nextPages, [...meta.pageIds, newPage.id])
    pinId(newPage.id) // mount ngay để scrollIntoView có node để cuộn tới
    requestAnimationFrame(() => {
      document.getElementById(`page-sheet-${newPage.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  return (
    <div ref={hostRef} className="mybook-obsidian-host mybook-notebook-view">
      {/* Toolbar đứng NGOÀI khung cuộn + sticky top:0 (xem obsidian-overrides.css):
          - khung trong cuộn được → toolbar nằm yên trên cùng (flex column)
          - Obsidian cuộn cả view (chuỗi height:100% gãy, khung trong không cuộn)
            → sticky dính theo scroll ngoài, không trôi mất */}
      <MiniToolbar
          activeTool={activeTool}
        strokeColor={strokeColor}
        strokeWidth={strokeWidth}
        isToolLocked={isToolLocked}
        canUndo={undoStack.current.length > 0}
        canRedo={redoStack.current.length > 0}
        savedState={savedState}
        onSelectTool={setActiveTool}
        onToggleLock={() => setIsToolLocked((v) => !v)}
        onChangeColor={(c) => {
          setStrokeColor(c)
          const primary = selDraw[0]
          if (primary) {
            for (const p of pages) {
              if (p.drawings.some((d) => d.id === primary)) {
                updateDrawing(p.id, primary, { color: c })
                break
              }
            }
          }
        }}
        onChangeWidth={(w) => {
          setStrokeWidth(w)
          const primary = selDraw[0]
          if (primary) {
            for (const p of pages) {
              if (p.drawings.some((d) => d.id === primary)) {
                updateDrawing(p.id, primary, { strokeWidth: w })
                break
              }
            }
          }
        }}
        onUndo={handleUndo}
        onRedo={handleRedo}
        zoomLabel={`${Math.round(zoom * 100)}%`}
        onZoomIn={() => setZoom((z) => Math.min(2.0, Number((z + 0.1).toFixed(1))))}
        onZoomOut={() => setZoom((z) => Math.max(0.5, Number((z - 0.1).toFixed(1))))}
        onFitZoom={fitZoom}
        onAddPage={addPage}
        onExportPdf={() => setShowExport(true)}
      />
      <div ref={scrollElRef} className="mybook-pages-scroll">
        <ScrollWidthReporter onWidth={reportScrollW} />
        <div
          className="mybook-pages-fitwrap"
          style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
        >
          {pages.map((page) => {
            const mounted = visibleIds.has(page.id)
            return (
              <div
                key={page.id}
                ref={observeRef(page.id)}
                data-page-wrap-id={page.id}
                className="mybook-page-wrap"
              >
                {mounted ? (
                  <NotebookPage
                    page={page}
                    activeTool={activeTool}
                    strokeColor={strokeColor}
                    strokeWidth={strokeWidth}
                    linePitch={linePitch}
                    selectedTextBoxIds={selText}
                    selectedElementIds={selDraw}
                    fontFamily="cascadia"
                    isToolLocked={isToolLocked}
                    handDrawnStyle={true}
                    canvasPixelScale={zoom}
                    onSelectTextBox={selectTextBox}
                    onSelectTextBoxes={selectTextBoxes}
                    onSelectElement={selectDrawingSingle}
                    onSelectElements={selectDrawings}
                    onUpdateTextBox={updateTextBox}
                    onDeleteTextBox={deleteTextBox}
                    onDuplicateTextBox={duplicateTextBox}
                    onAddTextBox={addTextBox}
                    onAddDrawingElement={addDrawing}
                    onUpdateDrawingElement={updateDrawing}
                    onRemoveDrawingElement={removeDrawing}
                    onReorderDrawing={reorderDrawing}
                    selectedImageIds={selImg}
                    onSelectImages={selectImages}
                    onAddImage={addImage}
                    onUpdateImage={updateImage}
                    onRemoveImage={removeImage}
                    onDuplicateImage={duplicateImage}
                    onReorderImage={reorderImage}
                    onAutoSwitchToSelect={autoSwitchToSelect}
                    onNavigateLink={onNavigateLink}
                  />
                ) : (
                  // Placeholder giữ đúng kích thước layout để scroll không lệch;
                  // canvas/markdown/ảnh chỉ mount khi cuộn tới (mở file tức thì)
                  <div className="mybook-page-placeholder" aria-hidden="true" />
                )}
              </div>
            )
          })}
        </div>
      </div>
      {showExport && (
        <ExportPdfModal
          pages={pages}
          notebookTitle={fileBasename}
          filename={`${fileBasename}.pdf`}
          portalTarget={hostRef.current ?? undefined}
          mountRoot={hostRef.current ?? undefined}
          onSavePdf={onSavePdf}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  )
}
