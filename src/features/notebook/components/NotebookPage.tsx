import React, { useRef, useState, useEffect, Suspense } from 'react'
import type { PageData, ToolType, DrawingElement, TextBoxData, PageImageData } from '@/shared/types/notebook'
import { NotebookTextBox } from './NotebookTextBox'
import { PageCanvas } from './PageCanvas'
import { PageImageLayer } from './PageImageLayer'
import { PAGE_WIDTH, PAGE_HEIGHT, TOP_MARGIN, displayScale, DEFAULT_TEXTBOX_WIDTH, FULL_TEXTBOX_WIDTH } from '@/shared/lib/lineSnap'
import {
  extractImagesFromClipboard,
  extractImagesFromDrop,
  fileToPageImage,
} from '@/shared/lib/imagePaste'
import { ImagePlus } from 'lucide-react'

// Code-split dynamic import of Excalidraw canvas
const ExcalidrawPageCanvas = React.lazy(() => import('./ExcalidrawPageCanvas'))

interface NotebookPageProps {
  page: PageData
  activeTool: ToolType
  strokeColor: string
  strokeWidth: number
  linePitch: number
  selectedTextBoxIds: string[]
  selectedElementIds: string[]
  fontFamily: string
  drawingEngineMode?: 'native' | 'excalidraw'
  isSpineLeft?: boolean
  isSpineRight?: boolean
  onSelectTextBox: (id: string | null) => void
  onSelectTextBoxes: (ids: string[]) => void
  onSelectElement: (id: string | null) => void
  onSelectElements: (ids: string[]) => void
  onUpdateTextBox: (pageId: string, id: string, updates: Partial<TextBoxData>) => void
  onDeleteTextBox: (pageId: string, id: string) => void
  onAddTextBox: (pageId: string, box: TextBoxData) => void
  onDuplicateTextBox?: (pageId: string, id: string) => void
  onAddDrawingElement: (pageId: string, elem: DrawingElement) => void
  onUpdateDrawingElement: (pageId: string, id: string, updates: Partial<DrawingElement>) => void
  onRemoveDrawingElement: (pageId: string, id: string) => void
  onReorderDrawing?: (pageId: string, elemId: string, direction: 'front' | 'back') => void
  selectedImageIds?: string[]
  onSelectImages?: (ids: string[]) => void
  onAddImage?: (pageId: string, img: PageImageData) => void
  onUpdateImage?: (pageId: string, imageId: string, updates: Partial<PageImageData>) => void
  onRemoveImage?: (pageId: string, imageId: string) => void
  onDuplicateImage?: (pageId: string, imageId: string) => void
  onReorderImage?: (pageId: string, imageId: string, direction: 'front' | 'back') => void
  isToolLocked?: boolean
  handDrawnStyle?: boolean
  onAutoSwitchToSelect?: () => void
  onNavigateLink?: (target: string) => void
  /** Zoom của view chứa trang — canvas tăng backing store để zoom to vẫn nét */
  canvasPixelScale?: number
}

export function NotebookPage({
  page,
  activeTool,
  strokeColor,
  strokeWidth,
  linePitch,
  selectedTextBoxIds,
  selectedElementIds,
  fontFamily,
  drawingEngineMode = 'native',
  isSpineLeft = false,
  isSpineRight = false,
  onSelectTextBox,
  onSelectTextBoxes,
  onSelectElement,
  onSelectElements,
  onUpdateTextBox,
  onDeleteTextBox,
  onAddTextBox,
  onDuplicateTextBox,
  onAddDrawingElement,
  onUpdateDrawingElement,
  onRemoveDrawingElement,
  onReorderDrawing,
  selectedImageIds = [],
  onSelectImages,
  onAddImage,
  onUpdateImage,
  onRemoveImage,
  onDuplicateImage,
  onReorderImage,
  isToolLocked = false,
  handDrawnStyle = true,
  onAutoSwitchToSelect,
  onNavigateLink,
  canvasPixelScale = 1,
}: NotebookPageProps) {
  const pageContainerRef = useRef<HTMLDivElement | null>(null)
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const pasteCascadeRef = useRef(0)
  // Vị trí con trỏ chuột cuối cùng trên trang (để paste/drop ảnh đúng chỗ)
  const mousePosRef = useRef<{ x: number; y: number } | null>(null)
  // Chuột có đang nằm trên trang + chống paste 2 lần (onPaste React + window listener)
  const mouseInsideRef = useRef(false)
  const handledPasteAtRef = useRef(0)
  const [isDragOverImage, setIsDragOverImage] = useState(false)
  const [isPastingImage, setIsPastingImage] = useState(false)

  const pageImages = page.images ?? []

  const clearCanvasSelection = () => {
    onSelectElements([])
    onSelectImages?.([])
    onSelectElement(null)
  }

  // Vừa nhập xong 1 textbox (blur): click tiếp theo ra khoảng trống sẽ về tool select
  // thay vì tạo textbox mới — reset khi user tiếp tục làm việc với textbox khác.
  const justFinishedEditRef = useRef(false)

  const handleSelectTextBox = (id: string | null) => {
    justFinishedEditRef.current = false
    onSelectTextBox(id)
  }

  const handleFinishEditing = () => {
    justFinishedEditRef.current = true
  }

  const handleEscapeExit = () => {
    // Bấm Escape khi đang nhập ở text tool → thoát về trỏ chuột select
    if (activeTool === 'text') {
      justFinishedEditRef.current = false
      onAutoSwitchToSelect?.()
    }
  }

  // Kéo nhóm textbox: snapshot vị trí các box cùng chọn (trừ box đang kéo)
  const textGroupOriginRef = useRef<Map<string, { x: number; y: number; width: number; isLocked?: boolean }>>(new Map())

  const handleTextGroupDragStart = (draggedId: string) => {
    const snap = new Map<string, { x: number; y: number; width: number; isLocked?: boolean }>()
    for (const box of page.textBoxes) {
      if (box.id !== draggedId && selectedTextBoxIds.includes(box.id)) {
        snap.set(box.id, { x: box.x, y: box.y, width: box.width, isLocked: box.isLocked })
      }
    }
    textGroupOriginRef.current = snap
  }

  const handleTextGroupMove = (dx: number, dy: number) => {
    textGroupOriginRef.current.forEach((origin, boxId) => {
      if (origin.isLocked) return
      onUpdateTextBox(page.id, boxId, {
        x: Math.max(16, Math.min(PAGE_WIDTH - origin.width - 16, Math.round(origin.x + dx))),
        y: Math.max(16, Math.min(PAGE_HEIGHT - 60, Math.round(origin.y + dy))),
      })
    })
  }

  // Ở bút/vẽ: click đơn chỉ select khung chữ (double-click mới edit) để dễ chọn text
  const singleClickEdits = activeTool === 'select' || activeTool === 'text'
  // Chế độ bút/vẽ: khóa tạm thời mọi textbox — mọi pointer dồn xuống canvas để chỉ vẽ
  const isDrawingTool = activeTool !== 'select' && activeTool !== 'text'

  const trackMousePos = (clientX: number, clientY: number) => {
    const rect = pageContainerRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0) {
      mousePosRef.current = null
      return
    }
    // Chuẩn hoá theo zoom (workspace scale) về toạ độ trang
    const scale = rect.width / PAGE_WIDTH
    mousePosRef.current = {
      x: (clientX - rect.left) / scale,
      y: (clientY - rect.top) / scale,
    }
  }

  const insertImageFiles = async (files: File[], anchor?: { x: number; y: number } | null) => {
    if (files.length === 0 || !onAddImage) return
    setIsPastingImage(true)
    try {
      let lastId: string | null = null
      for (const file of files) {
        const img = await fileToPageImage(page.id, file, pasteCascadeRef.current++, anchor ?? undefined)
        onAddImage(page.id, img)
        lastId = img.id
      }
      if (lastId) {
        onSelectImages?.([lastId])
        onSelectElements([])
        onSelectTextBox(null)
        onSelectElement(null)
      }
    } catch (err) {
      console.warn('Paste image failed:', err)
    } finally {
      setIsPastingImage(false)
    }
  }

  // Ctrl+V ảnh hoặc dán văn bản trực tiếp vào trang
  const handlePagePaste = (e: React.ClipboardEvent) => {
    const targetTag = (e.target as HTMLElement)?.tagName
    if (targetTag === 'TEXTAREA' || targetTag === 'INPUT') return

    const imageFiles = extractImagesFromClipboard(e)
    if (imageFiles.length > 0) {
      e.preventDefault()
      e.stopPropagation()
      handledPasteAtRef.current = Date.now()
      insertImageFiles(imageFiles, mousePosRef.current)
      return
    }

    const text = e.clipboardData?.getData('text')
    if (text && text.trim()) {
      e.preventDefault()
      e.stopPropagation()
      handledPasteAtRef.current = Date.now()
      const isLong = text.length > 40 || text.includes('\n')
      const targetW = isLong ? FULL_TEXTBOX_WIDTH : DEFAULT_TEXTBOX_WIDTH
      const anchor = mousePosRef.current || { x: 80, y: 120 }
      const newX = Math.max(16, Math.min(PAGE_WIDTH - 120, Math.round(anchor.x)))
      const newY = Math.max(16, Math.min(PAGE_HEIGHT - 60, Math.round(anchor.y)))
      const newBox: TextBoxData = {
        id: `tb_${page.id}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        x: newX,
        y: newY,
        width: Math.min(targetW, PAGE_WIDTH - newX - 20),
        content: text,
        isEditing: false,
      }
      onAddTextBox(page.id, newBox)
      onSelectTextBox(newBox.id)
      clearCanvasSelection()
    }
  }

  // Bắt paste cấp window: khi focus đang ở ngoài trang (toolbar, header...)
  // thì onPaste của sheet không nổ — listener này cứu. Chỉ nhận khi chuột
  // đang nằm trên trang này hoặc focus nằm trong trang này.
  // Dùng ref để luôn gọi insertImageFiles mới nhất (tránh stale closure).
  const insertRef = useRef(insertImageFiles)
  insertRef.current = insertImageFiles
  useEffect(() => {
    const handleWindowPaste = (e: ClipboardEvent) => {
      if (Date.now() - handledPasteAtRef.current < 400) return
      const el = pageContainerRef.current
      if (!el) return
      const activeTag = document.activeElement?.tagName
      if (activeTag === 'TEXTAREA' || activeTag === 'INPUT') return
      const focusInside = !!document.activeElement && el.contains(document.activeElement)
      if (!focusInside && !mouseInsideRef.current) return
      let imageFiles: File[] = []
      try {
        imageFiles = extractImagesFromClipboard(e)
      } catch {
        return
      }
      if (imageFiles.length > 0) {
        e.preventDefault()
        handledPasteAtRef.current = Date.now()
        insertRef.current(imageFiles, mousePosRef.current)
        return
      }

      const text = e.clipboardData?.getData('text')
      if (text && text.trim()) {
        e.preventDefault()
        handledPasteAtRef.current = Date.now()
        const isLong = text.length > 40 || text.includes('\n')
        const targetW = isLong ? FULL_TEXTBOX_WIDTH : DEFAULT_TEXTBOX_WIDTH
        const anchor = mousePosRef.current || { x: 80, y: 120 }
        const newX = Math.max(16, Math.min(PAGE_WIDTH - 120, Math.round(anchor.x)))
        const newY = Math.max(16, Math.min(PAGE_HEIGHT - 60, Math.round(anchor.y)))
        const newBox: TextBoxData = {
          id: `tb_${page.id}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          x: newX,
          y: newY,
          width: Math.min(targetW, PAGE_WIDTH - newX - 20),
          content: text,
          isEditing: false,
        }
        onAddTextBox(page.id, newBox)
        onSelectTextBox(newBox.id)
        clearCanvasSelection()
      }
    }
    window.addEventListener('paste', handleWindowPaste)
    return () => window.removeEventListener('paste', handleWindowPaste)
  }, [page.id])

  const handlePageDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault()
      setIsDragOverImage(true)
    }
  }

  const handlePageDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget === e.target) setIsDragOverImage(false)
  }

  const handlePageDrop = (e: React.DragEvent) => {
    setIsDragOverImage(false)
    const imageFiles = extractImagesFromDrop(e)
    if (imageFiles.length > 0) {
      e.preventDefault()
      e.stopPropagation()
      trackMousePos(e.clientX, e.clientY)
      insertImageFiles(imageFiles, mousePosRef.current)
    }
  }

  // Handle click on page to create text box when Text tool is active
  const handlePageClick = (e: React.MouseEvent) => {
    if (activeTool === 'text') {
      // Vừa nhập xong box trước đó: click ra khoảng trống → về trỏ chuột select
      if (justFinishedEditRef.current) {
        justFinishedEditRef.current = false
        onAutoSwitchToSelect?.()
        return
      }
      createTextBoxAt(e.clientX, e.clientY)
      return
    }

    if (activeTool === 'select') {
      // Only deselect if user clicked directly on the page background itself
      if (e.target === e.currentTarget) {
        handleSelectTextBox(null)
        clearCanvasSelection()
      }
    }
  }

  // Free text placement (chia scale khi zoom)
  const createTextBoxAt = (clientX: number, clientY: number) => {
    const rect = pageContainerRef.current?.getBoundingClientRect()
    if (!rect) return

    const scale = displayScale(rect, PAGE_WIDTH)
    const rawX = (clientX - rect.left) / scale
    const rawY = (clientY - rect.top) / scale

    const newX = Math.max(16, Math.min(PAGE_WIDTH - 220, Math.round(rawX)))
    const newY = Math.max(16, Math.min(PAGE_HEIGHT - 60, Math.round(rawY)))

    const newBox: TextBoxData = {
      id: `tb_${page.id}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      x: newX,
      y: newY,
      width: Math.min(DEFAULT_TEXTBOX_WIDTH, PAGE_WIDTH - newX - 20),
      content: '',
      isEditing: true,
    }

    onAddTextBox(page.id, newBox)
    onSelectTextBox(newBox.id)
    clearCanvasSelection()
  }

  // Get CSS background class depending on pattern
  const patternClass = `pattern-${page.pattern || 'ruled'}`
  const spineClass = isSpineLeft ? 'has-spine-left' : isSpineRight ? 'has-spine-right' : ''

  return (
    <div
      ref={pageContainerRef}
      id={`page-sheet-${page.id}`}
      className={`notebook-sheet ${patternClass} ${spineClass} font-${fontFamily || 'cascadia'}`}
      style={{
        width: `${PAGE_WIDTH}px`,
        height: `${PAGE_HEIGHT}px`,
      }}
      onClick={handlePageClick}
      onPaste={handlePagePaste}
      onMouseMove={(e) => trackMousePos(e.clientX, e.clientY)}
      onMouseEnter={() => {
        mouseInsideRef.current = true
      }}
      onMouseLeave={() => {
        mouseInsideRef.current = false
      }}
      onDragOver={handlePageDragOver}
      onDragLeave={handlePageDragLeave}
      onDrop={handlePageDrop}
    >
      {/* Hidden file picker cho nút Thêm ảnh */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          const files = e.target.files ? Array.from(e.target.files) : []
          if (files.length > 0) insertImageFiles(files)
          e.target.value = ''
        }}
      />

      {/* Top Header line */}
      <div className="notebook-header-line" />

      {/* Watermark mờ trên giấy (cụm lá góc phải-trên, cành lá góc trái-dưới — chỉ theme pastel) */}
      <div className="sheet-watermark watermark-corner" aria-hidden="true" />
      <div className="sheet-watermark watermark-leaves" aria-hidden="true" />

      {/* Text Box Layer (bị khóa tương tác ở chế độ bút/vẽ) */}
      <div className={`textbox-layer ${isDrawingTool ? 'no-interact' : ''}`}>
        {page.textBoxes.map((box) => (
          <NotebookTextBox
            key={box.id}
            data={box}
            isSelected={selectedTextBoxIds.includes(box.id)}
            linePitch={linePitch}
            topMargin={TOP_MARGIN}
            fontFamily={fontFamily}
            singleClickEdits={singleClickEdits}
            onSelect={(id) => {
              handleSelectTextBox(id)
              if (id) clearCanvasSelection()
            }}
            onUpdate={(id, updates) => onUpdateTextBox(page.id, id, updates)}
            onDelete={(id) => onDeleteTextBox(page.id, id)}
            onDuplicate={onDuplicateTextBox ? (id) => onDuplicateTextBox(page.id, id) : undefined}
            onNavigateLink={onNavigateLink}
            onFinishEditing={handleFinishEditing}
            onEscapeExit={handleEscapeExit}
            onGroupDragStart={handleTextGroupDragStart}
            onGroupMove={handleTextGroupMove}
          />
        ))}
      </div>

      {/* Layer ảnh paste — NẰM DƯỚI canvas nét vẽ + textbox (chữ/nét luôn đè lên ảnh) */}
      <PageImageLayer pageId={page.id} images={pageImages} />

      {/* Freehand & Shape Drawing Canvas Layer (nằm TRÊN ảnh, DƯỚI textbox) */}
      {drawingEngineMode === 'excalidraw' ? (
        <Suspense fallback={<div className="canvas-loading">Loading Excalidraw engine...</div>}>
          <ExcalidrawPageCanvas
            pageId={page.id}
            initialData={{ elements: page.drawings }}
            onChange={() => {
              // excalidraw sync
            }}
          />
        </Suspense>
      ) : (
        <PageCanvas
          pageId={page.id}
          activeTool={activeTool}
          strokeColor={strokeColor}
          strokeWidth={strokeWidth}
          elements={page.drawings}
          selectedElementIds={selectedElementIds}
          images={pageImages}
          selectedImageIds={selectedImageIds}
          isToolLocked={isToolLocked}
          handDrawnStyle={handDrawnStyle}
          canvasPixelScale={canvasPixelScale}
          onSelectTextBox={onSelectTextBox}
          onSelectTextBoxes={(ids) => {
            justFinishedEditRef.current = false
            onSelectTextBoxes(ids)
          }}
          // Forward thuần túy, KHÔNG tự xóa chéo loại khác — mọi điểm chọn đơn
          // trong PageCanvas đều đã clear tường minh, còn marquee cần set cả 3 loại cùng lúc.
          onSelectElement={onSelectElement}
          onSelectElements={onSelectElements}
          onSelectImages={(ids) => {
            onSelectImages?.(ids)
          }}
          onAddElement={(elem) => onAddDrawingElement(page.id, elem)}
          onUpdateElement={(id, updates) => onUpdateDrawingElement(page.id, id, updates)}
          onRemoveElement={(id) => onRemoveDrawingElement(page.id, id)}
          onReorderElement={
            onReorderDrawing ? (id, dir) => onReorderDrawing(page.id, id, dir) : undefined
          }
          onRemoveImage={onRemoveImage ? (id) => onRemoveImage(page.id, id) : undefined}
          onUpdateImage={
            onUpdateImage ? (id, updates) => onUpdateImage(page.id, id, updates) : undefined
          }
          onDuplicateImage={
            onDuplicateImage ? (id) => onDuplicateImage(page.id, id) : undefined
          }
          onReorderImage={
            onReorderImage ? (id, dir) => onReorderImage(page.id, id, dir) : undefined
          }
          textBoxes={page.textBoxes}
          selectedTextBoxIds={selectedTextBoxIds}
          onUpdateTextBox={(id, updates) => onUpdateTextBox(page.id, id, updates)}
          onDeleteTextBox={(id) => onDeleteTextBox(page.id, id)}
          onDuplicateTextBox={
            onDuplicateTextBox ? (id) => onDuplicateTextBox(page.id, id) : undefined
          }
          onAddTextBox={(box) => {
            onAddTextBox(page.id, box)
            onSelectTextBox(box.id)
            clearCanvasSelection()
          }}
          onAutoSwitchToSelect={onAutoSwitchToSelect}
        />
      )}

      {/* Nút Thêm ảnh nhanh (mở file picker) */}
      {onAddImage && (
        <button
          type="button"
          className="page-add-image-btn"
          title="Thêm ảnh vào trang (hoặc Ctrl+V để paste, kéo-thả file ảnh)"
          onClick={(e) => {
            e.stopPropagation()
            imageInputRef.current?.click()
          }}
        >
          <ImagePlus size={14} />
          <span>Ảnh</span>
        </button>
      )}

      {/* Overlay khi kéo file ảnh vào trang */}
      {isDragOverImage && (
        <div className="page-drop-image-overlay">
          <ImagePlus size={28} />
          <span>Thả ảnh để dán vào trang {page.pageNumber}</span>
        </div>
      )}

      {/* Toast nhỏ khi đang đọc ảnh paste */}
      {isPastingImage && <div className="page-pasting-hint">Đang dán ảnh...</div>}

      {/* Page number footer matching mockup */}
      <div className="notebook-footer">
        <span className="page-number-label">page {page.pageNumber}</span>
      </div>
    </div>
  )
}
