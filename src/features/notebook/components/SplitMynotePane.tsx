import { useState, useRef } from 'react'
import type {
  EditorTab,
  NotebookMetadata,
  PageData,
  TextBoxData,
  DrawingElement,
  PageImageData,
  ToolType,
} from '@/shared/types/notebook'
import { NotebookPage } from './NotebookPage'
import { debounce } from '@/shared/lib/debounce'

interface SplitMynotePaneProps {
  tab: EditorTab
  activeTool: ToolType
  strokeColor: string
  strokeWidth: number
  fontFamily: string
  linePitch: number
  isToolLocked: boolean
  handDrawnStyle: boolean
  onSync: (tabId: string, meta: NotebookMetadata, pages: PageData[]) => void
  onNavigateLink: (target: string) => void
  onAutoSwitchToSelect: () => void
}

/**
 * Pane mynote độc lập cho split view: state pages riêng, luôn cuộn dọc 1 trang.
 * Mọi thao tác chữ/vẽ/ảnh/add-page đều hoạt động, autosave đồng bộ về tab + vault.
 */
export function SplitMynotePane({
  tab,
  activeTool,
  strokeColor,
  strokeWidth,
  fontFamily,
  linePitch,
  isToolLocked,
  handDrawnStyle,
  onSync,
  onNavigateLink,
  onAutoSwitchToSelect,
}: SplitMynotePaneProps) {
  const initial = tab.notebookData
  const [meta, setMeta] = useState(initial!.meta)
  const [pages, setPages] = useState<PageData[]>(initial!.pages)
  const [zoom, setZoom] = useState(1.0)
  const [selText, setSelText] = useState<string[]>([])
  const [selDraw, setSelDraw] = useState<string[]>([])
  const [selImg, setSelImg] = useState<string[]>([])

  // Autosave debounce về tab + vault
  const syncRef = useRef(
    debounce((m: typeof meta, p: PageData[]) => {
      onSync(tab.id, m, p)
    }, 1500)
  ).current

  const commit = (nextPages: PageData[], nextMeta = meta) => {
    setPages(nextPages)
    syncRef(nextMeta, nextPages)
  }

  const updPage = (pageId: string, fn: (p: PageData) => PageData) => {
    const next = pages.map((p) => (p.id === pageId ? { ...fn(p), updatedAt: Date.now() } : p))
    commit(next)
  }

  const addTextBox = (pageId: string, box: TextBoxData) => {
    updPage(pageId, (p) => ({ ...p, textBoxes: [...p.textBoxes, box] }))
    setSelText([box.id])
  }
  const updateTextBox = (pageId: string, boxId: string, u: Partial<TextBoxData>) => {
    updPage(pageId, (p) => ({
      ...p,
      textBoxes: p.textBoxes.map((b) => (b.id === boxId ? { ...b, ...u } : b)),
    }))
  }
  const deleteTextBox = (pageId: string, boxId: string) => {
    updPage(pageId, (p) => ({ ...p, textBoxes: p.textBoxes.filter((b) => b.id !== boxId) }))
    setSelText((c) => c.filter((id) => id !== boxId))
  }
  const duplicateTextBox = (pageId: string, boxId: string) => {
    const page = pages.find((p) => p.id === pageId)
    const box = page?.textBoxes.find((b) => b.id === boxId)
    if (!box) return
    const clone: TextBoxData = {
      ...box,
      id: `tb_${pageId}_${Date.now()}`,
      x: Math.min(box.x + 20, 800 - box.width),
      y: Math.min(box.y + 32, 1050),
      isEditing: false,
      isLocked: false,
    }
    updPage(pageId, (p) => ({ ...p, textBoxes: [...p.textBoxes, clone] }))
    setSelText([clone.id])
  }

  const addDrawing = (pageId: string, elem: DrawingElement) => {
    updPage(pageId, (p) => ({ ...p, drawings: [...p.drawings, elem] }))
    setSelDraw([elem.id])
  }
  const updateDrawing = (pageId: string, elemId: string, u: Partial<DrawingElement>) => {
    updPage(pageId, (p) => ({
      ...p,
      drawings: p.drawings.map((d) => (d.id === elemId ? { ...d, ...u } : d)),
    }))
  }
  const removeDrawing = (pageId: string, elemId: string) => {
    updPage(pageId, (p) => ({ ...p, drawings: p.drawings.filter((d) => d.id !== elemId) }))
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
    updPage(pageId, (p) => ({ ...p, drawings: next }))
  }

  const addImage = (pageId: string, img: PageImageData) => {
    updPage(pageId, (p) => ({ ...p, images: [img, ...(p.images ?? [])] }))
    setSelImg([img.id])
  }
  const updateImage = (pageId: string, imageId: string, u: Partial<PageImageData>) => {
    updPage(pageId, (p) => ({
      ...p,
      images: (p.images ?? []).map((im) => (im.id === imageId ? { ...im, ...u } : im)),
    }))
  }
  const removeImage = (pageId: string, imageId: string) => {
    updPage(pageId, (p) => ({ ...p, images: (p.images ?? []).filter((im) => im.id !== imageId) }))
    setSelImg((c) => c.filter((id) => id !== imageId))
  }
  const duplicateImage = (pageId: string, imageId: string) => {
    const page = pages.find((p) => p.id === pageId)
    const img = (page?.images ?? []).find((i) => i.id === imageId)
    if (!img) return
    const clone: PageImageData = {
      ...img,
      id: `img_${pageId}_${Date.now()}`,
      x: Math.min(800 - img.width - 16, img.x + 20),
      y: Math.min(1100 - img.height - 60, img.y + 20),
      isLocked: false,
    }
    updPage(pageId, (p) => ({ ...p, images: [...(p.images ?? []), clone] }))
    setSelImg([clone.id])
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
    updPage(pageId, (p) => ({ ...p, images: next }))
  }

  const addPage = () => {
    const newPage: PageData = {
      id: `page_${Date.now()}`,
      pageNumber: pages.length + 1,
      pattern: pages[pages.length - 1]?.pattern || 'ruled',
      textBoxes: [],
      drawings: [],
      images: [],
      updatedAt: Date.now(),
    }
    const nextPages = [...pages, newPage]
    const nextMeta = { ...meta, pageIds: [...meta.pageIds, newPage.id], updatedAt: Date.now() }
    setMeta(nextMeta)
    commit(nextPages, nextMeta)
  }

  const deleteLastPage = () => {
    if (pages.length <= 1) return
    const target = pages[pages.length - 1]
    const nextPages = pages
      .filter((p) => p.id !== target.id)
      .map((p, i) => ({ ...p, pageNumber: i + 1 }))
    const nextMeta = {
      ...meta,
      pageIds: meta.pageIds.filter((id) => id !== target.id),
      updatedAt: Date.now(),
    }
    setMeta(nextMeta)
    commit(nextPages, nextMeta)
  }

  return (
    <div className="split-mynote-pane">
      <div
        className="split-mynote-scroll"
        style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
      >
        {pages.map((page) => (
          <div key={page.id} className="split-mynote-page-wrap">
            <NotebookPage
              page={page}
              activeTool={activeTool}
              strokeColor={strokeColor}
              strokeWidth={strokeWidth}
              linePitch={linePitch}
              selectedTextBoxIds={selText}
              selectedElementIds={selDraw}
              fontFamily={fontFamily}
              isToolLocked={isToolLocked}
              handDrawnStyle={handDrawnStyle}
              canvasPixelScale={zoom}
              onSelectTextBox={(id) => setSelText(id ? [id] : [])}
              onSelectTextBoxes={setSelText}
              onSelectElement={(id) => setSelDraw(id ? [id] : [])}
              onSelectElements={setSelDraw}
              onUpdateTextBox={updateTextBox}
              onDeleteTextBox={deleteTextBox}
              onDuplicateTextBox={duplicateTextBox}
              onAddTextBox={addTextBox}
              onAddDrawingElement={addDrawing}
              onUpdateDrawingElement={updateDrawing}
              onRemoveDrawingElement={removeDrawing}
              onReorderDrawing={reorderDrawing}
              selectedImageIds={selImg}
              onSelectImages={setSelImg}
              onAddImage={addImage}
              onUpdateImage={updateImage}
              onRemoveImage={removeImage}
              onDuplicateImage={duplicateImage}
              onReorderImage={reorderImage}
              onAutoSwitchToSelect={onAutoSwitchToSelect}
              onNavigateLink={onNavigateLink}
            />
          </div>
        ))}
      </div>
      {/* Thanh mini trong pane (thay PageNavigator cố định để khỏi chồng pane trái) */}
      <div className="split-mini-bar">
        <button type="button" onClick={deleteLastPage} title="Xóa trang cuối">
          −
        </button>
        <span>
          {pages.length} trang • {Math.round(zoom * 100)}%
        </span>
        <button type="button" onClick={addPage} title="Thêm trang">
          +
        </button>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.1).toFixed(1))))}
          title="Thu nhỏ"
        >
          −
        </button>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(2.0, Number((z + 0.1).toFixed(1))))}
          title="Phóng to"
        >
          +
        </button>
      </div>
    </div>
  )
}
