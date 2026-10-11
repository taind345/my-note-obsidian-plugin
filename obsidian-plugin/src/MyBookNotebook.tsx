import { useState, useRef, useEffect, useCallback } from 'react'
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
  onSave: (meta: NotebookMetadata, pages: PageData[]) => Promise<void>
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
export function MyBookNotebook({ initialMeta, initialPages, onSave, onNavigateLink }: MyBookNotebookProps) {
  const [meta, setMeta] = useState<NotebookMetadata>(initialMeta)
  const [pages, setPages] = useState<PageData[]>(initialPages)
  const [zoom, setZoom] = useState(1.0)
  const [activeTool, setActiveTool] = useState<ToolType>('select')
  const [strokeColor, setStrokeColor] = useState('#1e293b')
  const [strokeWidth, setStrokeWidth] = useState(4)
  const [isToolLocked, setIsToolLocked] = useState(false)
  const [savedState, setSavedState] = useState<'saved' | 'dirty'>('saved')

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

  // --- TextBox ---
  const addTextBox = (pageId: string, box: TextBoxData) => {
    mutatePage(pageId, (p) => ({ ...p, textBoxes: [...p.textBoxes, box] }))
    setSelText([box.id])
    setSelDraw([])
    setSelImg([])
  }
  const updateTextBox = (pageId: string, boxId: string, u: Partial<TextBoxData>) => {
    setPages((curr) =>
      curr.map((p) =>
        p.id === pageId
          ? { ...p, textBoxes: p.textBoxes.map((b) => (b.id === boxId ? { ...b, ...u } : b)), updatedAt: Date.now() }
          : p
      )
    )
    setSavedState('dirty')
  }
  const deleteTextBox = (pageId: string, boxId: string) => {
    mutatePage(pageId, (p) => ({ ...p, textBoxes: p.textBoxes.filter((b) => b.id !== boxId) }))
    setSelText((c) => c.filter((id) => id !== boxId))
  }
  const duplicateTextBox = (pageId: string, boxId: string) => {
    const page = pages.find((p) => p.id === pageId)
    const box = page?.textBoxes.find((b) => b.id === boxId)
    if (!box) return
    const cloneBox: TextBoxData = {
      ...clone(box),
      id: `tb_${pageId}_${Date.now()}`,
      x: Math.min(box.x + 20, 800 - box.width),
      y: Math.min(box.y + 32, 1050),
      isEditing: false,
      isLocked: false,
    }
    mutatePage(pageId, (p) => ({ ...p, textBoxes: [...p.textBoxes, cloneBox] }))
    setSelText([cloneBox.id])
  }

  const selectTextBox = (id: string | null) => {
    setSelText(id ? [id] : [])
    if (id) {
      setSelDraw([])
      setSelImg([])
    }
  }
  const selectDrawings = (ids: string[]) => {
    setSelDraw(ids)
    if (ids.length > 0) {
      setSelText([])
      setSelImg([])
    }
  }
  const selectImages = (ids: string[]) => {
    setSelImg(ids)
    if (ids.length > 0) {
      setSelText([])
      setSelDraw([])
    }
  }
  const selectDrawingSingle = (id: string | null) => {
    setSelDraw(id ? [id] : [])
    if (id) {
      const found = pages.flatMap((p) => p.drawings).find((d) => d.id === id)
      if (found) {
        setStrokeColor(found.color)
        setStrokeWidth(found.strokeWidth)
      }
    }
  }

  // --- Drawing ---
  const addDrawing = (pageId: string, elem: DrawingElement) => {
    mutatePage(pageId, (p) => ({ ...p, drawings: [...p.drawings, elem] }))
    setSelDraw([elem.id])
    setSelText([])
    setSelImg([])
  }
  const updateDrawing = (pageId: string, elemId: string, u: Partial<DrawingElement>) => {
    setPages((curr) =>
      curr.map((p) =>
        p.id === pageId
          ? { ...p, drawings: p.drawings.map((d) => (d.id === elemId ? { ...d, ...u } : d)), updatedAt: Date.now() }
          : p
      )
    )
    setSavedState('dirty')
  }
  const removeDrawing = (pageId: string, elemId: string) => {
    mutatePage(pageId, (p) => ({ ...p, drawings: p.drawings.filter((d) => d.id !== elemId) }))
    setSelDraw((c) => c.filter((id) => id !== elemId))
  }
  const reorderDrawing = (pageId: string, elemId: string, dir: 'front' | 'back') => {
    const page = pages.find((p) => p.id === pageId)
    if (!page) return
    const idx = page.drawings.findIndex((d) => d.id === elemId)
    if (idx < 0) return
    const next = [...page.drawings]
    const [el] = next.splice(idx, 1)
    if (dir === 'front') next.push(el)
    else next.unshift(el)
    mutatePage(pageId, (p) => ({ ...p, drawings: next }))
  }

  // --- Image ---
  const addImage = (pageId: string, img: PageImageData) => {
    mutatePage(pageId, (p) => ({ ...p, images: [img, ...(p.images ?? [])] }))
    setSelImg([img.id])
    setSelDraw([])
    setSelText([])
  }
  const updateImage = (pageId: string, imageId: string, u: Partial<PageImageData>) => {
    setPages((curr) =>
      curr.map((p) =>
        p.id === pageId
          ? { ...p, images: (p.images ?? []).map((im) => (im.id === imageId ? { ...im, ...u } : im)), updatedAt: Date.now() }
          : p
      )
    )
    setSavedState('dirty')
  }
  const removeImage = (pageId: string, imageId: string) => {
    mutatePage(pageId, (p) => ({ ...p, images: (p.images ?? []).filter((im) => im.id !== imageId) }))
    setSelImg((c) => c.filter((id) => id !== imageId))
  }
  const duplicateImage = (pageId: string, imageId: string) => {
    const page = pages.find((p) => p.id === pageId)
    const img = (page?.images ?? []).find((i) => i.id === imageId)
    if (!img) return
    const copy: PageImageData = {
      ...clone(img),
      id: `img_${pageId}_${Date.now()}`,
      x: Math.min(800 - img.width - 16, img.x + 20),
      y: Math.min(1100 - img.height - 60, img.y + 20),
      isLocked: false,
    }
    mutatePage(pageId, (p) => ({ ...p, images: [...(p.images ?? []), copy] }))
    setSelImg([copy.id])
  }
  const reorderImage = (pageId: string, imageId: string, dir: 'front' | 'back') => {
    const page = pages.find((p) => p.id === pageId)
    const list = page?.images ?? []
    const idx = list.findIndex((im) => im.id === imageId)
    if (idx < 0) return
    const next = [...list]
    const [im] = next.splice(idx, 1)
    if (dir === 'front') next.push(im)
    else next.unshift(im)
    mutatePage(pageId, (p) => ({ ...p, images: next }))
  }

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
    requestAnimationFrame(() => {
      document.getElementById(`page-sheet-${newPage.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  return (
    <div className="mybook-obsidian-host mybook-notebook-view">
      <div ref={scrollElRef} className="mybook-pages-scroll">
        {/* Toolbar nằm TRONG khung cuộn + sticky để cuộn đâu cũng dính trên cùng */}
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
      />
        <ScrollWidthReporter onWidth={reportScrollW} />
        <div
          className="mybook-pages-fitwrap"
          style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
        >
        {pages.map((page) => (
          <div key={page.id} className="mybook-page-wrap">
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
              onSelectTextBoxes={(ids) => {
                setSelText(ids)
                if (ids.length > 0) {
                  setSelDraw([])
                  setSelImg([])
                }
              }}
              onSelectElement={selectDrawingSingle}
              onSelectElements={(ids) => {
                setSelDraw(ids)
                if (ids.length > 0) {
                  setSelText([])
                  setSelImg([])
                }
              }}
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
              onAutoSwitchToSelect={() => {
                if (!isToolLocked) setActiveTool('select')
              }}
              onNavigateLink={onNavigateLink}
            />
          </div>
        ))}
        </div>
      </div>
    </div>
  )
}
