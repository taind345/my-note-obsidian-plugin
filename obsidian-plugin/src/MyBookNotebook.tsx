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
  const [strokeWidth, setStrokeWidth] = useState(2.8)
  const [isToolLocked, setIsToolLocked] = useState(false)
  const [savedState, setSavedState] = useState<'saved' | 'dirty'>('saved')
  const [showExport, setShowExport] = useState(false)
  // Host root (có class scope CSS): modal + node offscreen portal vào đây
  // để style áp đúng thay vì rớt ra document.body
  const hostRef = useRef<HTMLDivElement | null>(null)

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
      setZoom(Number(Math.min(2.0, Math.max(0.3, (w - 48) / 800)).toFixed(2)))
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

  // Tự động tìm container cuộn thật sự
  const getScroller = useCallback((): HTMLElement | null => {
    const el = scrollElRef.current
    if (el && el.scrollHeight > el.clientHeight + 2) return el
    let p = hostRef.current?.parentElement
    while (p) {
      if (p.scrollHeight > p.clientHeight + 2) return p
      p = p.parentElement
    }
    return el
  }, [])

  // Cuộn mượt bằng phím qua requestAnimationFrame (lerp 60-120fps không giật, cộng dồn nhấp phím)
  const animScrollRef = useRef<{
    rafId: number | null
    targetTop: number
    targetLeft: number
  }>({
    rafId: null,
    targetTop: 0,
    targetLeft: 0,
  })

  const cancelKeyScroll = useCallback(() => {
    if (animScrollRef.current.rafId !== null) {
      cancelAnimationFrame(animScrollRef.current.rafId)
      animScrollRef.current.rafId = null
    }
  }, [])

  const queueSmoothScroll = useCallback(
    (deltaTop: number, deltaLeft: number, absolute?: { top?: number; left?: number }) => {
      const scroller = getScroller()
      if (!scroller) return

      const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
      const maxLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth)

      if (animScrollRef.current.rafId === null) {
        animScrollRef.current.targetTop = scroller.scrollTop
        animScrollRef.current.targetLeft = scroller.scrollLeft
      }

      if (absolute) {
        if (absolute.top !== undefined) animScrollRef.current.targetTop = Math.max(0, Math.min(maxTop, absolute.top))
        if (absolute.left !== undefined) animScrollRef.current.targetLeft = Math.max(0, Math.min(maxLeft, absolute.left))
      } else {
        animScrollRef.current.targetTop = Math.max(0, Math.min(maxTop, animScrollRef.current.targetTop + deltaTop))
        animScrollRef.current.targetLeft = Math.max(0, Math.min(maxLeft, animScrollRef.current.targetLeft + deltaLeft))
      }

      if (animScrollRef.current.rafId !== null) return

      const step = () => {
        const s = getScroller()
        if (!s) {
          cancelKeyScroll()
          return
        }

        const maxTopNow = Math.max(0, s.scrollHeight - s.clientHeight)
        const maxLeftNow = Math.max(0, s.scrollWidth - s.clientWidth)

        animScrollRef.current.targetTop = Math.max(0, Math.min(maxTopNow, animScrollRef.current.targetTop))
        animScrollRef.current.targetLeft = Math.max(0, Math.min(maxLeftNow, animScrollRef.current.targetLeft))

        const currentTop = s.scrollTop
        const currentLeft = s.scrollLeft
        const diffTop = animScrollRef.current.targetTop - currentTop
        const diffLeft = animScrollRef.current.targetLeft - currentLeft

        // 1. Khi khoảng cách còn nhỏ (<= 1.5px), snap thẳng về đích và kết thúc
        if (Math.abs(diffTop) <= 1.5 && Math.abs(diffLeft) <= 1.5) {
          s.scrollTop = animScrollRef.current.targetTop
          s.scrollLeft = animScrollRef.current.targetLeft
          cancelKeyScroll()
          return
        }

        // 2. Tính bước nhảy lerp, đảm bảo mỗi frame di chuyển tối thiểu 1px để không bị kẹt bởi subpixel rounding
        let stepY = diffTop * 0.25
        if (Math.abs(stepY) < 1) {
          stepY = Math.sign(diffTop) * Math.min(1, Math.abs(diffTop))
        }

        let stepX = diffLeft * 0.25
        if (Math.abs(stepX) < 1) {
          stepX = Math.sign(diffLeft) * Math.min(1, Math.abs(diffLeft))
        }

        const nextTop = currentTop + stepY
        const nextLeft = currentLeft + stepX

        s.scrollTop = nextTop
        s.scrollLeft = nextLeft

        // 3. Nếu browser đã chạm biên cứng (0 hoặc max) và không thể di chuyển thêm
        if (s.scrollTop === currentTop && s.scrollLeft === currentLeft) {
          s.scrollTop = animScrollRef.current.targetTop
          s.scrollLeft = animScrollRef.current.targetLeft
          cancelKeyScroll()
          return
        }

        animScrollRef.current.rafId = requestAnimationFrame(step)
      }

      animScrollRef.current.rafId = requestAnimationFrame(step)
    },
    [getScroller, cancelKeyScroll]
  )

  // Hủy animation cuộn phím nếu user cuộn chuột/touchpad hoặc tương tác
  useEffect(() => {
    const el = scrollElRef.current
    if (!el) return
    const onUserInteract = () => cancelKeyScroll()
    el.addEventListener('wheel', onUserInteract, { passive: true })
    el.addEventListener('pointerdown', onUserInteract, { passive: true })
    return () => {
      el.removeEventListener('wheel', onUserInteract)
      el.removeEventListener('pointerdown', onUserInteract)
      cancelKeyScroll()
    }
  }, [cancelKeyScroll])

  // Phím tắt: Undo/Redo, đổi tool 1-9, và cuộn trang mượt bằng phím mũi tên
  const TOOL_ORDER: ToolType[] = ['select', 'rect', 'circle', 'arrow', 'line', 'pen', 'highlighter', 'text', 'eraser']
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.isContentEditable) return

      const host = hostRef.current
      if (!host || !host.isConnected) return
      // Không xử lý nếu tab đang ẩn trong Obsidian
      if (host.offsetParent === null && host.clientHeight === 0) return

      const activeEl = document.activeElement
      const leaf = host.closest('.workspace-leaf')
      // Đang trong tab vở nếu activeEl nằm trong host, hoặc tab leaf đang active, hoặc click vào workspace
      const isInside =
        host.contains(activeEl) ||
        (leaf ? leaf.contains(activeEl) || leaf.classList.contains('mod-active') : false) ||
        activeEl === document.body ||
        !activeEl

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
        return
      } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        e.preventDefault()
        handleRedo()
        return
      } else if (e.key === 'Escape') {
        setSelText([])
        setSelDraw([])
        setSelImg([])
        return
      }

      // Xử lý cuộn bằng phím mũi tên & phím điều hướng khi đang trong notebook
      if (isInside) {
        const scroller = getScroller()
        if (!scroller) return

        const step = e.repeat ? 55 : 120

        if (e.key === 'ArrowDown') {
          e.preventDefault()
          queueSmoothScroll(step, 0)
          return
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          queueSmoothScroll(-step, 0)
          return
        } else if (e.key === 'ArrowRight' && !e.ctrlKey && !e.metaKey && !e.altKey) {
          if (scroller.scrollWidth > scroller.clientWidth) {
            e.preventDefault()
            queueSmoothScroll(0, step)
            return
          }
        } else if (e.key === 'ArrowLeft' && !e.ctrlKey && !e.metaKey && !e.altKey) {
          if (scroller.scrollWidth > scroller.clientWidth) {
            e.preventDefault()
            queueSmoothScroll(0, -step)
            return
          }
        } else if (e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey)) {
          e.preventDefault()
          queueSmoothScroll(scroller.clientHeight * 0.85, 0)
          return
        } else if (e.key === 'PageUp' || (e.key === ' ' && e.shiftKey)) {
          e.preventDefault()
          queueSmoothScroll(-scroller.clientHeight * 0.85, 0)
          return
        } else if (e.key === 'Home') {
          e.preventDefault()
          queueSmoothScroll(0, 0, { top: 0 })
          return
        } else if (e.key === 'End') {
          e.preventDefault()
          queueSmoothScroll(0, 0, { top: scroller.scrollHeight - scroller.clientHeight })
          return
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleUndo, handleRedo, getScroller, queueSmoothScroll])

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
    <div
      ref={hostRef}
      className="mybook-obsidian-host mybook-notebook-view"
    >
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
        onResetZoom={() => setZoom(1.0)}
        onFitZoom={fitZoom}
        onAddPage={addPage}
        onExportPdf={() => setShowExport(true)}
      />
      <div ref={scrollElRef} className="mybook-pages-scroll">
        <ScrollWidthReporter onWidth={reportScrollW} />
        <div
          className="mybook-zoom-container"
          style={{
            width: `${Math.round(800 * zoom)}px`,
            minHeight: `${Math.round((pages.length * 1100 + Math.max(0, pages.length - 1) * 16) * zoom)}px`,
          }}
        >
          <div
            className="mybook-pages-fitwrap"
            style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
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
