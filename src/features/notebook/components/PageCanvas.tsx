import React, { useRef, useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import rough from 'roughjs'
import type { ToolType, DrawingElement, Point, TextBoxData, PageImageData } from '@/shared/types/notebook'
import { drawSmoothStroke } from '@/shared/lib/smoothing'
import { PAGE_WIDTH, PAGE_HEIGHT, displayScale } from '@/shared/lib/lineSnap'
import { canvasBackingScale } from '../lib/canvasResolution'
import { getElementSeed } from '../lib/elementSeed'
import { normalizeRect, isClickRect, marqueeSelect, toggleInList, rectsIntersect } from '@/shared/lib/selection'
import { Trash2, Copy, Lock, Unlock, ArrowUp, ArrowDown, Frame } from 'lucide-react'

interface PageCanvasProps {
  pageId: string
  activeTool: ToolType
  strokeColor: string
  strokeWidth: number
  elements: DrawingElement[]
  selectedElementIds: string[]
  images?: PageImageData[]
  selectedImageIds?: string[]
  isToolLocked?: boolean
  handDrawnStyle?: boolean
  onSelectElement: (id: string | null) => void
  onSelectElements: (ids: string[]) => void
  onSelectImages: (ids: string[]) => void
  onSelectTextBox?: (id: string | null) => void
  onAddElement: (elem: DrawingElement) => void
  onUpdateElement: (id: string, updates: Partial<DrawingElement>) => void
  onRemoveElement: (id: string) => void
  onReorderElement?: (id: string, direction: 'front' | 'back') => void
  onRemoveImage?: (id: string) => void
  onUpdateImage?: (id: string, updates: Partial<PageImageData>) => void
  onDuplicateImage?: (id: string) => void
  onReorderImage?: (id: string, direction: 'front' | 'back') => void
  textBoxes?: TextBoxData[]
  selectedTextBoxIds?: string[]
  onSelectTextBoxes?: (ids: string[]) => void
  onUpdateTextBox?: (id: string, updates: Partial<TextBoxData>) => void
  onDeleteTextBox?: (id: string) => void
  onDuplicateTextBox?: (id: string) => void
  onAddTextBox?: (box: TextBoxData) => void
  onAutoSwitchToSelect?: () => void
  /** Zoom của view chứa trang — dùng để tăng backing store, zoom to vẫn nét */
  canvasPixelScale?: number
}

type ResizeHandleType =
  | 'nw'
  | 'n'
  | 'ne'
  | 'e'
  | 'se'
  | 's'
  | 'sw'
  | 'w'
  | 'arrow-start'
  | 'arrow-curve'
  | 'arrow-end'

const HANDLE_SIZE = 8

export function PageCanvas({
  pageId,
  activeTool,
  strokeColor,
  strokeWidth,
  elements,
  selectedElementIds,
  images = [],
  selectedImageIds = [],
  isToolLocked = false,
  handDrawnStyle = true,
  onSelectElement,
  onSelectElements,
  onSelectImages,
  onSelectTextBox,
  onAddElement,
  onUpdateElement,
  onRemoveElement,
  onReorderElement,
  onRemoveImage,
  onUpdateImage,
  onDuplicateImage,
  onReorderImage,
  textBoxes = [],
  selectedTextBoxIds = [],
  onSelectTextBoxes,
  onUpdateTextBox,
  onDeleteTextBox,
  onDuplicateTextBox,
  onAddTextBox,
  onAutoSwitchToSelect,
  canvasPixelScale = 1,
}: PageCanvasProps) {
  const staticCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const activeCanvasRef = useRef<HTMLCanvasElement | null>(null)

  // Drawing state
  const isDrawingRef = useRef(false)
  const activeDrawingSeedRef = useRef<number>(1)
  const currentPointsRef = useRef<Point[]>([])
  const startPointRef = useRef<Point | null>(null)
  const rafIdRef = useRef<number | null>(null)
  const pendingMovePointRef = useRef<Point | null>(null)

  // Selection & Manipulation state
  const [, setActiveHandle] = useState<ResizeHandleType | null>(null)
  const isDraggingObjectRef = useRef(false)
  const dragStartCoordsRef = useRef<{ x: number; y: number } | null>(null)
  // Snapshot nhóm đang kéo (kéo 1 lúc nhiều drawings + images + textboxes kiểu Excalidraw)
  const initialGroupRef = useRef<{
    drawings: DrawingElement[]
    images: PageImageData[]
    textBoxes: TextBoxData[]
  } | null>(null)

  // Marquee (kéo vùng chọn kiểu Excalidraw)
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const marqueeAdditiveRef = useRef(false)
  const isMarqueeRef = useRef(false)
  // Điểm bắt đầu kéo vùng (ref để pointerup luôn tính đúng, không phụ thuộc state)
  const marqueeStartRef = useRef<Point | null>(null)

  // Context Menu state
  const [contextMenuPos, setContextMenuPos] = useState<{
    x: number
    y: number
    elementId: string
    kind: 'drawing' | 'image'
  } | null>(null)

  const selectedElem = elements.find((el) => el.id === selectedElementIds[0]) || null

  // Close context menu on outside click
  useEffect(() => {
    const handleOutsideClick = () => {
      if (contextMenuPos) setContextMenuPos(null)
    }
    window.addEventListener('click', handleOutsideClick)
    return () => window.removeEventListener('click', handleOutsideClick)
  }, [contextMenuPos])

  // Helper to get element bounds
  const getElementBounds = useCallback((elem: DrawingElement) => {
    if (elem.type === 'rect' || elem.type === 'circle') {
      const x = elem.x ?? 0
      const y = elem.y ?? 0
      const w = elem.width ?? 0
      const h = elem.height ?? 0
      return {
        minX: w < 0 ? x + w : x,
        minY: h < 0 ? y + h : y,
        maxX: w < 0 ? x : x + w,
        maxY: h < 0 ? y : y + h,
        width: Math.abs(w),
        height: Math.abs(h),
      }
    }

    if (elem.points && elem.points.length > 0) {
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      for (const p of elem.points) {
        if (p.x < minX) minX = p.x
        if (p.y < minY) minY = p.y
        if (p.x > maxX) maxX = p.x
        if (p.y > maxY) maxY = p.y
      }
      return {
        minX,
        minY,
        maxX,
        maxY,
        width: Math.max(10, maxX - minX),
        height: Math.max(10, maxY - minY),
      }
    }

    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 }
  }, [])

  // Backing store DUY NHẤT cho cả 2 canvas (static đã xong + active preview
  // đang vẽ): cùng scale → preview và finished pixel-identical (cùng routine
  // vẽ + cùng seed rough), zoom to vẫn nét. Xem lib/canvasResolution.
  const canvasBacking = canvasBackingScale(canvasPixelScale)

  // Chuẩn bị context: reset transform, xóa full, scale theo backing thực tế
  const setupCtx = (
    canvas: HTMLCanvasElement | null,
    backing?: number
  ): CanvasRenderingContext2D | null => {
    if (!canvas) return null
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const s = backing ?? canvas.width / PAGE_WIDTH
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.setTransform(s, 0, 0, s, 0, 0)
    return ctx
  }

  const redrawStaticCanvas = useCallback(() => {
    const canvas = staticCanvasRef.current
    if (!canvas) return
    const ctx = setupCtx(canvas)
    if (!ctx) return

    const rc = rough.canvas(canvas)

    for (const elem of elements) {
      ctx.save()

      const isDashed = elem.strokeStyle === 'dashed'
      const dashOpt = isDashed ? [8, 6] : undefined
      const roughOpts: any = {
        stroke: elem.color,
        strokeWidth: elem.strokeWidth,
        roughness: handDrawnStyle ? (elem.roughness ?? 1.0) : 0,
        bowing: handDrawnStyle ? 0.8 : 0,
        strokeLineDash: dashOpt,
        disableMultiStroke: !handDrawnStyle,
        seed: elem.seed || getElementSeed(elem.id),
      }

      if (elem.fillColor && elem.fillColor !== 'transparent') {
        roughOpts.fill = elem.fillColor
        roughOpts.fillStyle = 'solid'
      }

      if (elem.type === 'highlighter') {
        ctx.globalAlpha = elem.opacity || 0.35
        ctx.strokeStyle = elem.color
        ctx.lineWidth = elem.strokeWidth * 3
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        drawSmoothStroke(ctx, elem.points)
      } else if (elem.type === 'pen') {
        ctx.globalAlpha = elem.opacity || 1.0
        ctx.strokeStyle = elem.color
        ctx.lineWidth = elem.strokeWidth
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        drawSmoothStroke(ctx, elem.points)
      } else if (elem.type === 'line' && elem.points.length >= 2) {
        const p0 = elem.points[0]
        const p1 = elem.points[elem.points.length - 1]
        rc.line(p0.x, p0.y, p1.x, p1.y, roughOpts)
      } else if (elem.type === 'arrow' && elem.points.length >= 2) {
        const p0 = elem.points[0]
        const isCurved = elem.isCurved !== false && elem.points.length >= 3
        const pmid = isCurved
          ? elem.points[1]
          : {
              x: (p0.x + elem.points[elem.points.length - 1].x) / 2,
              y: (p0.y + elem.points[elem.points.length - 1].y) / 2,
            }
        const p1 = elem.points[elem.points.length - 1]

        if (isCurved) {
          rc.curve([[p0.x, p0.y], [pmid.x, pmid.y], [p1.x, p1.y]], roughOpts)
          const angle = Math.atan2(p1.y - pmid.y, p1.x - pmid.x)
          const arrowLen = 14 + elem.strokeWidth * 1.5
          const a1x = p1.x - arrowLen * Math.cos(angle - Math.PI / 6)
          const a1y = p1.y - arrowLen * Math.sin(angle - Math.PI / 6)
          const a2x = p1.x - arrowLen * Math.cos(angle + Math.PI / 6)
          const a2y = p1.y - arrowLen * Math.sin(angle + Math.PI / 6)
          rc.line(p1.x, p1.y, a1x, a1y, roughOpts)
          rc.line(p1.x, p1.y, a2x, a2y, roughOpts)
        } else {
          rc.line(p0.x, p0.y, p1.x, p1.y, roughOpts)
          const angle = Math.atan2(p1.y - p0.y, p1.x - p0.x)
          const arrowLen = 14 + elem.strokeWidth * 1.5
          const a1x = p1.x - arrowLen * Math.cos(angle - Math.PI / 6)
          const a1y = p1.y - arrowLen * Math.sin(angle - Math.PI / 6)
          const a2x = p1.x - arrowLen * Math.cos(angle + Math.PI / 6)
          const a2y = p1.y - arrowLen * Math.sin(angle + Math.PI / 6)
          rc.line(p1.x, p1.y, a1x, a1y, roughOpts)
          rc.line(p1.x, p1.y, a2x, a2y, roughOpts)
        }
      } else if (
        elem.type === 'rect' &&
        elem.x !== undefined &&
        elem.y !== undefined &&
        elem.width &&
        elem.height
      ) {
        const rx = elem.width < 0 ? elem.x + elem.width : elem.x
        const ry = elem.height < 0 ? elem.y + elem.height : elem.y
        const rw = Math.abs(elem.width)
        const rh = Math.abs(elem.height)
        rc.rectangle(rx, ry, rw, rh, roughOpts)
      } else if (
        elem.type === 'circle' &&
        elem.x !== undefined &&
        elem.y !== undefined &&
        elem.width &&
        elem.height
      ) {
        const cx = elem.x + elem.width / 2
        const cy = elem.y + elem.height / 2
        rc.ellipse(cx, cy, Math.abs(elem.width), Math.abs(elem.height), roughOpts)
      }

      ctx.restore()
    }
  }, [elements, handDrawnStyle, canvasBacking])

  // Vẽ lại canvas tĩnh, throttle theo frame: kéo nhóm nhiều object liên tục
  // chỉ redraw 1 lần/frame thay vì mỗi pointermove (đỡ jank trang nhiều nét)
  const redrawQueued = useRef(false)
  useEffect(() => {
    if (redrawQueued.current) return
    redrawQueued.current = true
    const raf = requestAnimationFrame(() => {
      redrawQueued.current = false
      redrawStaticCanvas()
    })
    return () => {
      cancelAnimationFrame(raf)
      redrawQueued.current = false
    }
  }, [redrawStaticCanvas])

  // Get pointer coordinates relative to the page canvas (chia scale khi zoom)
  const getCanvasCoords = (e: React.PointerEvent | PointerEvent | React.MouseEvent): Point => {
    const rect = activeCanvasRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    const scale = displayScale(rect, PAGE_WIDTH)
    return {
      x: (e.clientX - rect.left) / scale,
      y: (e.clientY - rect.top) / scale,
      pressure: (e as any).pressure || 0.5,
      time: Date.now(),
    }
  }

  const canvasScaleNow = (): number =>
    displayScale(activeCanvasRef.current?.getBoundingClientRect(), PAGE_WIDTH)

  // Hit test for element selection
  const hitTestElement = (point: Point): DrawingElement | null => {
    const threshold = 18

    for (let i = elements.length - 1; i >= 0; i--) {
      const elem = elements[i]

      // Arrow / Line Hit Test
      if ((elem.type === 'arrow' || elem.type === 'line') && elem.points.length >= 2) {
        if (elem.points.length >= 3) {
          const d1 = distToSegment(point, elem.points[0], elem.points[1])
          const d2 = distToSegment(point, elem.points[1], elem.points[2])
          const dMid = Math.hypot(point.x - elem.points[1].x, point.y - elem.points[1].y)
          if (Math.min(d1, d2, dMid) <= threshold + elem.strokeWidth) return elem
        } else {
          const dist = distToSegment(point, elem.points[0], elem.points[1])
          if (dist <= threshold + elem.strokeWidth) return elem
        }
      }
      // Rect Hit Test
      else if (
        elem.type === 'rect' &&
        elem.x !== undefined &&
        elem.y !== undefined &&
        elem.width &&
        elem.height
      ) {
        const minX = elem.width < 0 ? elem.x + elem.width : elem.x
        const maxX = elem.width < 0 ? elem.x : elem.x + elem.width
        const minY = elem.height < 0 ? elem.y + elem.height : elem.y
        const maxY = elem.height < 0 ? elem.y : elem.y + elem.height

        if (
          point.x >= minX - threshold &&
          point.x <= maxX + threshold &&
          point.y >= minY - threshold &&
          point.y <= maxY + threshold
        ) {
          return elem
        }
      }
      // Circle Hit Test
      else if (
        elem.type === 'circle' &&
        elem.x !== undefined &&
        elem.y !== undefined &&
        elem.width &&
        elem.height
      ) {
        const cx = elem.x + elem.width / 2
        const cy = elem.y + elem.height / 2
        const rx = Math.abs(elem.width / 2) + threshold
        const ry = Math.abs(elem.height / 2) + threshold
        const normalized = Math.pow((point.x - cx) / rx, 2) + Math.pow((point.y - cy) / ry, 2)
        if (normalized <= 1.0) {
          return elem
        }
      }
      // Pen / Highlighter Hit Test
      else if (elem.points && elem.points.length > 0) {
        const hit = elem.points.some(
          (p) => Math.hypot(p.x - point.x, p.y - point.y) <= threshold + elem.strokeWidth
        )
        if (hit) return elem
      }
    }
    return null
  }

  const distToSegment = (p: Point, v: Point, w: Point) => {
    const l2 = Math.pow(v.x - w.x, 2) + Math.pow(v.y - w.y, 2)
    if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y)
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2
    t = Math.max(0, Math.min(1, t))
    return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)))
  }

  // Hit test cho ảnh paste (nét vẽ nằm TRÊN ảnh nên check drawing trước, ảnh sau)
  const hitTestImage = (point: Point): PageImageData | null => {
    const pad = 4
    for (let i = images.length - 1; i >= 0; i--) {
      const im = images[i]
      if (
        point.x >= im.x - pad &&
        point.x <= im.x + im.width + pad &&
        point.y >= im.y - pad &&
        point.y <= im.y + im.height + pad
      ) {
        return im
      }
    }
    return null
  }

  const clearAllSelection = () => {
    onSelectElements([])
    onSelectImages([])
    onSelectTextBoxes?.([])
    onSelectElement(null)
    if (onSelectTextBox) onSelectTextBox(null)
  }

  // Pointer Down Handler
  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button === 2) return // Ignore right-clicks here; handled by onContextMenu

    const point = getCanvasCoords(e)

    // Mode: Eraser
    if (activeTool === 'eraser') {
      isDrawingRef.current = true
      startPointRef.current = point
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {}
      eraseAtPoint(point)
      return
    }

    // Mode: Select (kiểu Excalidraw: click chọn, Shift+Click cộng dồn, kéo vùng marquee)
    if (activeTool === 'select') {
      const hitDrawing = hitTestElement(point)
      const hitImage = !hitDrawing ? hitTestImage(point) : null

      if (hitDrawing) {
        // Tính vùng chọn MỚI trước rồi mới snapshot để kéo nhóm cho đúng
        let nextDrawings: string[]
        let nextImages: string[]
        let nextTextBoxes: string[]
        if (e.shiftKey) {
          // Shift+Click: toggle nét vẽ trong vùng chọn, giữ nguyên phần còn lại
          nextDrawings = toggleInList(selectedElementIds, hitDrawing.id)
          nextImages = selectedImageIds
          nextTextBoxes = selectedTextBoxIds
          onSelectElements(nextDrawings)
        } else if (!selectedElementIds.includes(hitDrawing.id)) {
          // Click đơn: chỉ chọn nét này, bỏ chọn ảnh + textbox
          nextDrawings = [hitDrawing.id]
          nextImages = []
          nextTextBoxes = []
          onSelectElements(nextDrawings)
          onSelectImages([])
          onSelectTextBoxes?.([])
          onSelectElement(hitDrawing.id)
          if (onSelectTextBox) onSelectTextBox(null)
        } else {
          // Click vào nét đã nằm trong vùng chọn: giữ nguyên cả nhóm để kéo
          nextDrawings = selectedElementIds
          nextImages = selectedImageIds
          nextTextBoxes = selectedTextBoxIds
        }
        // Chuẩn bị kéo cả nhóm đang chọn (nét vẽ + ảnh + textbox cùng di chuyển)
        isDraggingObjectRef.current = true
        dragStartCoordsRef.current = { x: point.x, y: point.y }
        initialGroupRef.current = {
          drawings: JSON.parse(
            JSON.stringify(elements.filter((d) => nextDrawings.includes(d.id)))
          ),
          images: JSON.parse(JSON.stringify(images.filter((im) => nextImages.includes(im.id)))),
          textBoxes: JSON.parse(
            JSON.stringify(textBoxes.filter((b) => nextTextBoxes.includes(b.id)))
          ),
        }
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {}
      } else if (hitImage) {
        if (!onUpdateImage) return
        let nextDrawings: string[]
        let nextImages: string[]
        let nextTextBoxes: string[]
        if (e.shiftKey) {
          nextImages = toggleInList(selectedImageIds, hitImage.id)
          nextDrawings = selectedElementIds
          nextTextBoxes = selectedTextBoxIds
          onSelectImages(nextImages)
        } else if (!selectedImageIds.includes(hitImage.id)) {
          nextImages = [hitImage.id]
          nextDrawings = []
          nextTextBoxes = []
          onSelectImages(nextImages)
          onSelectElements([])
          onSelectTextBoxes?.([])
          onSelectElement(null)
          if (onSelectTextBox) onSelectTextBox(null)
        } else {
          nextImages = selectedImageIds
          nextDrawings = selectedElementIds
          nextTextBoxes = selectedTextBoxIds
        }
        isDraggingObjectRef.current = true
        dragStartCoordsRef.current = { x: point.x, y: point.y }
        initialGroupRef.current = {
          drawings: JSON.parse(
            JSON.stringify(elements.filter((d) => nextDrawings.includes(d.id)))
          ),
          images: JSON.parse(JSON.stringify(images.filter((im) => nextImages.includes(im.id)))),
          textBoxes: JSON.parse(
            JSON.stringify(textBoxes.filter((b) => nextTextBoxes.includes(b.id)))
          ),
        }
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {}
      } else {
        // Kéo vùng chọn marquee (Shift+drag = cộng dồn vào vùng chọn hiện tại)
        isMarqueeRef.current = true
        marqueeAdditiveRef.current = e.shiftKey
        marqueeStartRef.current = point
        setMarquee({ x0: point.x, y0: point.y, x1: point.x, y1: point.y })
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {}
      }
      return
    }

    if (activeTool === 'text') {
      // Handled cleanly by NotebookPage.handlePageClick on single click
      return
    }

    // Mode: Drawing
    isDrawingRef.current = true
    activeDrawingSeedRef.current = Math.floor(Math.random() * 10000000) + 1
    e.currentTarget.setPointerCapture(e.pointerId)
    startPointRef.current = point

    if (activeTool === 'pen' || activeTool === 'highlighter') {
      currentPointsRef.current = [point]
    }
  }

  // Eraser Tool (xoá cả nét vẽ lẫn ảnh paste nằm dưới)
  const eraseAtPoint = (point: Point) => {
    const hit = hitTestElement(point)
    if (hit) {
      onRemoveElement(hit.id)
      if (selectedElementIds.includes(hit.id)) {
        onSelectElements(selectedElementIds.filter((id) => id !== hit.id))
      }
      return
    }
    const hitImg = hitTestImage(point)
    if (hitImg && onRemoveImage) {
      onRemoveImage(hitImg.id)
      if (selectedImageIds.includes(hitImg.id)) {
        onSelectImages(selectedImageIds.filter((id) => id !== hitImg.id))
      }
    }
  }

  // Pointer Move Handler (Throttled via requestAnimationFrame)
  const handlePointerMove = (e: React.PointerEvent) => {
    const point = getCanvasCoords(e)

    // Cập nhật khung marquee khi đang kéo vùng chọn (dùng ref để không bị stale)
    if (activeTool === 'select' && isMarqueeRef.current && marqueeStartRef.current) {
      const start = marqueeStartRef.current
      setMarquee({ x0: start.x, y0: start.y, x1: point.x, y1: point.y })
      return
    }

    // Kéo cả nhóm đang chọn (drawings + images + textboxes cùng di chuyển, bỏ qua item bị khoá)
    if (
      activeTool === 'select' &&
      isDraggingObjectRef.current &&
      dragStartCoordsRef.current &&
      initialGroupRef.current
    ) {
      const dx = Math.round(point.x - dragStartCoordsRef.current.x)
      const dy = Math.round(point.y - dragStartCoordsRef.current.y)

      for (const initial of initialGroupRef.current.drawings) {
        if (initial.isLocked) continue
        if (initial.type === 'rect' || initial.type === 'circle') {
          onUpdateElement(initial.id, {
            x: Math.round((initial.x ?? 0) + dx),
            y: Math.round((initial.y ?? 0) + dy),
          })
        } else if (initial.points && initial.points.length > 0) {
          const movedPoints = initial.points.map((p) => ({
            ...p,
            x: Math.round(p.x + dx),
            y: Math.round(p.y + dy),
          }))
          onUpdateElement(initial.id, { points: movedPoints })
        }
      }

      if (onUpdateImage) {
        for (const initial of initialGroupRef.current.images) {
          if (initial.isLocked) continue
          onUpdateImage(initial.id, {
            x: Math.max(0, Math.min(PAGE_WIDTH - initial.width, Math.round(initial.x + dx))),
            y: Math.max(0, Math.min(PAGE_HEIGHT - initial.height, Math.round(initial.y + dy))),
          })
        }
      }

      if (onUpdateTextBox) {
        for (const initial of initialGroupRef.current.textBoxes) {
          if (initial.isLocked) continue
          onUpdateTextBox(initial.id, {
            x: Math.max(16, Math.min(PAGE_WIDTH - initial.width - 16, Math.round(initial.x + dx))),
            y: Math.max(16, Math.min(PAGE_HEIGHT - 60, Math.round(initial.y + dy))),
          })
        }
      }
      return
    }

    if (!isDrawingRef.current) return

    if (activeTool === 'eraser') {
      eraseAtPoint(point)
      // Interpolate along the sweep trajectory so quick mouse sweeps delete everything crossed
      if (startPointRef.current) {
        const p1 = startPointRef.current
        const dist = Math.hypot(point.x - p1.x, point.y - p1.y)
        if (dist > 8) {
          const steps = Math.min(12, Math.floor(dist / 6))
          for (let i = 1; i < steps; i++) {
            eraseAtPoint({
              x: p1.x + (point.x - p1.x) * (i / steps),
              y: p1.y + (point.y - p1.y) * (i / steps),
            })
          }
        }
      }
      startPointRef.current = point

      // Draw subtle eraser feedback ring on active canvas
      const activeCtx = setupCtx(activeCanvasRef.current)
      if (activeCtx) {
        activeCtx.beginPath()
        activeCtx.arc(point.x, point.y, 14, 0, Math.PI * 2)
        activeCtx.fillStyle = 'rgba(244, 114, 182, 0.25)'
        activeCtx.fill()
        activeCtx.strokeStyle = 'rgba(236, 72, 153, 0.8)'
        activeCtx.lineWidth = 1.5
        activeCtx.stroke()
      }
      return
    }

    pendingMovePointRef.current = point

    if (rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(() => {
        const activeCanvas = activeCanvasRef.current
        const currentP = pendingMovePointRef.current
        rafIdRef.current = null

        if (!activeCanvas || !currentP) return
        const activeCtx = setupCtx(activeCanvas)
        if (!activeCtx) return
        const rc = rough.canvas(activeCanvas)

        const roughOpts: any = {
          stroke: strokeColor,
          strokeWidth,
          roughness: handDrawnStyle ? 1.0 : 0,
          bowing: handDrawnStyle ? 0.8 : 0,
          disableMultiStroke: !handDrawnStyle,
          seed: activeDrawingSeedRef.current,
        }

        if (activeTool === 'pen' || activeTool === 'highlighter') {
          currentPointsRef.current.push(currentP)
          activeCtx.save()
          if (activeTool === 'highlighter') {
            activeCtx.strokeStyle = strokeColor
            activeCtx.lineWidth = strokeWidth * 3
            activeCtx.lineCap = 'round'
            activeCtx.lineJoin = 'round'
            activeCtx.globalAlpha = 0.35
            drawSmoothStroke(activeCtx, currentPointsRef.current)
          } else {
            activeCtx.strokeStyle = strokeColor
            activeCtx.lineWidth = strokeWidth
            activeCtx.lineCap = 'round'
            activeCtx.lineJoin = 'round'
            activeCtx.globalAlpha = 1.0
            drawSmoothStroke(activeCtx, currentPointsRef.current)
          }
          activeCtx.restore()
        } else if (startPointRef.current) {
          const sp = startPointRef.current

          if (activeTool === 'line') {
            rc.line(sp.x, sp.y, currentP.x, currentP.y, roughOpts)
          } else if (activeTool === 'arrow') {
            const mid = { x: (sp.x + currentP.x) / 2, y: (sp.y + currentP.y) / 2 }
            rc.curve([[sp.x, sp.y], [mid.x, mid.y], [currentP.x, currentP.y]], roughOpts)
            const angle = Math.atan2(currentP.y - mid.y, currentP.x - mid.x)
            const arrowLen = 14 + strokeWidth * 1.5
            const a1x = currentP.x - arrowLen * Math.cos(angle - Math.PI / 6)
            const a1y = currentP.y - arrowLen * Math.sin(angle - Math.PI / 6)
            const a2x = currentP.x - arrowLen * Math.cos(angle + Math.PI / 6)
            const a2y = currentP.y - arrowLen * Math.sin(angle + Math.PI / 6)
            rc.line(currentP.x, currentP.y, a1x, a1y, roughOpts)
            rc.line(currentP.x, currentP.y, a2x, a2y, roughOpts)
          } else if (activeTool === 'rect') {
            const rx = Math.min(sp.x, currentP.x)
            const ry = Math.min(sp.y, currentP.y)
            const rw = Math.abs(currentP.x - sp.x)
            const rh = Math.abs(currentP.y - sp.y)
            rc.rectangle(rx, ry, rw, rh, roughOpts)
          } else if (activeTool === 'circle') {
            const rx = Math.min(sp.x, currentP.x)
            const ry = Math.min(sp.y, currentP.y)
            const rw = Math.abs(currentP.x - sp.x)
            const rh = Math.abs(currentP.y - sp.y)
            const cx = rx + rw / 2
            const cy = ry + rh / 2
            rc.ellipse(cx, cy, rw, rh, roughOpts)
          }
        }
      })
    }
  }

  // Pointer Up Handler
  const handlePointerUp = (e: React.PointerEvent) => {
    if (activeTool === 'select') {
      // Kết thúc kéo vùng marquee: chọn tất cả drawings + images + textboxes giao với vùng
      if (isMarqueeRef.current) {
        isMarqueeRef.current = false
        const start = marqueeStartRef.current
        marqueeStartRef.current = null
        setMarquee(null)
        const end = getCanvasCoords(e)
        // Chuẩn hoá theo zoom (workspace scale) để so khớp đúng với bounds dữ liệu
        const canvasRect = activeCanvasRef.current?.getBoundingClientRect()
        const scale =
          canvasRect && canvasRect.width > 0 ? canvasRect.width / PAGE_WIDTH : 1
        if (start) {
          const rawRect = normalizeRect(start.x, start.y, end.x, end.y)
          const rect = {
            minX: rawRect.minX / scale,
            minY: rawRect.minY / scale,
            maxX: rawRect.maxX / scale,
            maxY: rawRect.maxY / scale,
          }
          if (isClickRect(rawRect)) {
            if (!marqueeAdditiveRef.current) clearAllSelection()
          } else {
            const sel = marqueeSelect(rect, elements, images)
            // Textbox nằm trên canvas nên đo trực tiếp từ DOM (chuẩn hoá zoom)
            let textboxIds: string[] = []
            const sheetEl = document.getElementById(`page-sheet-${pageId}`)
            if (sheetEl && canvasRect) {
              const boxEls = sheetEl.querySelectorAll('.notebook-textbox')
              boxEls.forEach((el) => {
                const r = (el as HTMLElement).getBoundingClientRect()
                const rel = {
                  minX: (r.left - canvasRect.left) / scale,
                  minY: (r.top - canvasRect.top) / scale,
                  maxX: (r.right - canvasRect.left) / scale,
                  maxY: (r.bottom - canvasRect.top) / scale,
                }
                if (rectsIntersect(rect, rel)) {
                  const m = /^textbox-(.+)$/.exec(el.id)
                  if (m) textboxIds.push(m[1])
                }
              })
            }
            if (marqueeAdditiveRef.current) {
              onSelectElements(Array.from(new Set([...selectedElementIds, ...sel.drawingIds])))
              onSelectImages(Array.from(new Set([...selectedImageIds, ...sel.imageIds])))
              onSelectTextBoxes?.(Array.from(new Set([...selectedTextBoxIds, ...textboxIds])))
            } else {
              // Set cả 3 loại cùng lúc (không gọi onSelectElement đơn để khỏi sập nhóm)
              onSelectElements(sel.drawingIds)
              onSelectImages(sel.imageIds)
              onSelectTextBoxes?.(textboxIds)
            }
          }
        }
        try {
          e.currentTarget.releasePointerCapture(e.pointerId)
        } catch {}
        return
      }
      isDraggingObjectRef.current = false
      dragStartCoordsRef.current = null
      initialGroupRef.current = null
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {}
      return
    }

    if (activeTool === 'eraser') {
      isDrawingRef.current = false
      startPointRef.current = null
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {}
      setupCtx(activeCanvasRef.current)
      return
    }

    if (!isDrawingRef.current) return
    isDrawingRef.current = false

    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = null
    }

    setupCtx(activeCanvasRef.current)

    const endPoint = getCanvasCoords(e)
    const sp = startPointRef.current || endPoint
    const elemId = `elem_${pageId}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`

    if (activeTool === 'pen' || activeTool === 'highlighter') {
      const rawPoints = currentPointsRef.current
      if (rawPoints.length < 2) return

      // Filter only duplicate points (< 0.8px apart) to prevent redundant data,
      // without destructive simplification so the stroke does NOT shift or morph when released!
      const cleanPoints: Point[] = [rawPoints[0]]
      for (let i = 1; i < rawPoints.length; i++) {
        const prev = cleanPoints[cleanPoints.length - 1]
        if (Math.hypot(rawPoints[i].x - prev.x, rawPoints[i].y - prev.y) >= 0.8) {
          cleanPoints.push(rawPoints[i])
        }
      }

      const newElem: DrawingElement = {
        id: elemId,
        type: activeTool,
        points: cleanPoints,
        color: strokeColor,
        strokeWidth,
        opacity: activeTool === 'highlighter' ? 0.35 : 1.0,
      }
      onAddElement(newElem)
    } else if (activeTool === 'line') {
      const dist = Math.hypot(endPoint.x - sp.x, endPoint.y - sp.y)
      if (dist < 4) return

      const newElem: DrawingElement = {
        id: elemId,
        type: 'line',
        points: [sp, endPoint],
        color: strokeColor,
        strokeWidth,
        roughness: 1.0,
        seed: activeDrawingSeedRef.current,
      }
      onAddElement(newElem)
    } else if (activeTool === 'arrow') {
      const dist = Math.hypot(endPoint.x - sp.x, endPoint.y - sp.y)
      if (dist < 4) return

      const mid = {
        x: Math.round((sp.x + endPoint.x) / 2),
        y: Math.round((sp.y + endPoint.y) / 2),
      }

      const newElem: DrawingElement = {
        id: elemId,
        type: 'arrow',
        points: [sp, mid, endPoint],
        color: strokeColor,
        strokeWidth,
        isCurved: true,
        roughness: 1.0,
        seed: activeDrawingSeedRef.current,
      }
      onAddElement(newElem)
    } else if (activeTool === 'rect') {
      const rx = Math.min(sp.x, endPoint.x)
      const ry = Math.min(sp.y, endPoint.y)
      const rw = Math.abs(endPoint.x - sp.x)
      const rh = Math.abs(endPoint.y - sp.y)
      if (rw < 4 && rh < 4) return

      const newElem: DrawingElement = {
        id: elemId,
        type: 'rect',
        points: [],
        x: rx,
        y: ry,
        width: rw,
        height: rh,
        color: strokeColor,
        strokeWidth,
        fillColor: 'transparent',
        roughness: 1.0,
        seed: activeDrawingSeedRef.current,
      }
      onAddElement(newElem)
    } else if (activeTool === 'circle') {
      const rx = Math.min(sp.x, endPoint.x)
      const ry = Math.min(sp.y, endPoint.y)
      const rw = Math.abs(endPoint.x - sp.x)
      const rh = Math.abs(endPoint.y - sp.y)
      if (rw < 4 && rh < 4) return

      const newElem: DrawingElement = {
        id: elemId,
        type: 'circle',
        points: [],
        x: rx,
        y: ry,
        width: rw,
        height: rh,
        color: strokeColor,
        strokeWidth,
        fillColor: 'transparent',
        roughness: 1.0,
        seed: activeDrawingSeedRef.current,
      }
      onAddElement(newElem)
    }

    currentPointsRef.current = []
    startPointRef.current = null

    // Auto-switch to select ONLY for shape tools (rect, circle, arrow, line) when tool lock is false!
    // Pen and Highlighter ALWAYS remain active so user can write handwriting continuously!
    const isShapeTool =
      activeTool === 'rect' ||
      activeTool === 'circle' ||
      activeTool === 'arrow' ||
      activeTool === 'line'

    if (!isToolLocked && isShapeTool && onAutoSwitchToSelect) {
      onAutoSwitchToSelect()
    }
  }

  // Handle Resize for Shapes & Arrow Curvature
  const handleResizeHandleDown = (e: React.PointerEvent, handle: ResizeHandleType) => {
    e.stopPropagation()
    if (!selectedElem || selectedElem.isLocked) return

    setActiveHandle(handle)
    const scale = canvasScaleNow()
    const startX = e.clientX
    const startY = e.clientY
    const initialElem = JSON.parse(JSON.stringify(selectedElem)) as DrawingElement

    const onPointerMove = (moveEv: PointerEvent) => {
      const dx = (moveEv.clientX - startX) / scale
      const dy = (moveEv.clientY - startY) / scale

      if (handle === 'arrow-start' && initialElem.points.length >= 2) {
        const newPoints = [...initialElem.points]
        newPoints[0] = {
          x: Math.round(initialElem.points[0].x + dx),
          y: Math.round(initialElem.points[0].y + dy),
        }
        onUpdateElement(initialElem.id, { points: newPoints })
      } else if (handle === 'arrow-curve') {
        if (initialElem.points.length === 2) {
          const p0 = initialElem.points[0]
          const p1 = initialElem.points[1]
          const mid = {
            x: Math.round((p0.x + p1.x) / 2 + dx),
            y: Math.round((p0.y + p1.y) / 2 + dy),
          }
          onUpdateElement(initialElem.id, { points: [p0, mid, p1], isCurved: true })
        } else if (initialElem.points.length >= 3) {
          const newPoints = [...initialElem.points]
          newPoints[1] = {
            x: Math.round(initialElem.points[1].x + dx),
            y: Math.round(initialElem.points[1].y + dy),
          }
          onUpdateElement(initialElem.id, { points: newPoints, isCurved: true })
        }
      } else if (handle === 'arrow-end' && initialElem.points.length >= 2) {
        const lastIdx = initialElem.points.length - 1
        const newPoints = [...initialElem.points]
        newPoints[lastIdx] = {
          x: Math.round(initialElem.points[lastIdx].x + dx),
          y: Math.round(initialElem.points[lastIdx].y + dy),
        }
        onUpdateElement(initialElem.id, { points: newPoints })
      } else if (initialElem.type === 'rect' || initialElem.type === 'circle') {
        let x = initialElem.x ?? 0
        let y = initialElem.y ?? 0
        let w = initialElem.width ?? 0
        let h = initialElem.height ?? 0

        if (handle.includes('e')) w += dx
        if (handle.includes('s')) h += dy
        if (handle.includes('w')) {
          x += dx
          w -= dx
        }
        if (handle.includes('n')) {
          y += dy
          h -= dy
        }

        const normX = w < 0 ? x + w : x
        const normY = h < 0 ? y + h : y
        const normW = Math.max(12, Math.abs(w))
        const normH = Math.max(12, Math.abs(h))

        onUpdateElement(initialElem.id, {
          x: Math.round(normX),
          y: Math.round(normY),
          width: Math.round(normW),
          height: Math.round(normH),
        })
      }
    }

    const onPointerUp = () => {
      setActiveHandle(null)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  // Right-click context menu on canvas (chỉ ở chế độ select — chế độ bút khóa object)
  const handleCanvasContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (activeTool !== 'select') return
    const point = getCanvasCoords(e)
    const hit = hitTestElement(point)
    if (hit) {
      onSelectElements([hit.id])
      onSelectImages([])
      onSelectElement(hit.id)
      if (onSelectTextBox) onSelectTextBox(null)
      setContextMenuPos({ x: e.clientX, y: e.clientY, elementId: hit.id, kind: 'drawing' })
      return
    }
    const hitImg = hitTestImage(point)
    if (hitImg) {
      onSelectImages([hitImg.id])
      onSelectElements([])
      onSelectElement(null)
      if (onSelectTextBox) onSelectTextBox(null)
      setContextMenuPos({ x: e.clientX, y: e.clientY, elementId: hitImg.id, kind: 'image' })
      return
    }
    if (selectedElementIds.length > 0) {
      setContextMenuPos({
        x: e.clientX,
        y: e.clientY,
        elementId: selectedElementIds[0],
        kind: 'drawing',
      })
    } else if (selectedImageIds.length > 0) {
      setContextMenuPos({
        x: e.clientX,
        y: e.clientY,
        elementId: selectedImageIds[0],
        kind: 'image',
      })
    } else {
      setContextMenuPos(null)
    }
  }

  // Keyboard controls cho vùng chọn (chỉ ở chế độ select — chế độ bút khóa object)
  useEffect(() => {
    if (activeTool !== 'select') return
    if (
      selectedElementIds.length === 0 &&
      selectedImageIds.length === 0 &&
      selectedTextBoxIds.length === 0
    )
      return

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') return

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        for (const id of selectedElementIds) {
          const el = elements.find((x) => x.id === id)
          if (el && !el.isLocked) onRemoveElement(id)
        }
        if (onRemoveImage) {
          for (const id of selectedImageIds) {
            const im = images.find((x) => x.id === id)
            if (im && !im.isLocked) onRemoveImage(id)
          }
        }
        if (onDeleteTextBox) {
          for (const id of selectedTextBoxIds) {
            const box = textBoxes.find((x) => x.id === id)
            if (box && !box.isLocked) onDeleteTextBox(id)
          }
        }
        onSelectElements([])
        onSelectImages([])
        onSelectTextBoxes?.([])
        onSelectElement(null)
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        for (const id of selectedElementIds) {
          const el = elements.find((x) => x.id === id)
          if (el) {
            const clone: DrawingElement = JSON.parse(JSON.stringify(el))
            clone.id = `elem_${pageId}_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`
            if (clone.x !== undefined && clone.y !== undefined) {
              clone.x += 16
              clone.y += 16
            } else if (clone.points) {
              clone.points = clone.points.map((p) => ({ ...p, x: p.x + 16, y: p.y + 16 }))
            }
            clone.isLocked = false
            onAddElement(clone)
          }
        }
        if (onDuplicateImage) {
          for (const id of selectedImageIds) onDuplicateImage(id)
        }
        if (onDuplicateTextBox) {
          for (const id of selectedTextBoxIds) onDuplicateTextBox(id)
        }
      } else if (e.key === 'Escape') {
        onSelectElements([])
        onSelectImages([])
        onSelectTextBoxes?.([])
        onSelectElement(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    activeTool,
    selectedElementIds,
    selectedImageIds,
    selectedTextBoxIds,
    elements,
    images,
    textBoxes,
    pageId,
    onRemoveElement,
    onRemoveImage,
    onDuplicateImage,
    onDeleteTextBox,
    onDuplicateTextBox,
    onSelectElement,
    onSelectElements,
    onSelectImages,
    onSelectTextBoxes,
    onAddElement,
  ])

  const selBounds = selectedElem ? getElementBounds(selectedElem) : null
  const isSingleDrawingSelection =
    selectedElementIds.length === 1 && selectedImageIds.length === 0 && !!selectedElem
  const multiDrawingBounds = selectedElementIds
    .slice(isSingleDrawingSelection ? 1 : 0)
    .map((id) => {
      const el = elements.find((d) => d.id === id)
      return el ? { el, bounds: getElementBounds(el) } : null
    })
    .filter((x): x is { el: DrawingElement; bounds: ReturnType<typeof getElementBounds> } => !!x)
  const selectedImages = selectedImageIds
    .map((id) => images.find((im) => im.id === id))
    .filter((x): x is PageImageData => !!x)
  const isSingleImageSelection =
    selectedImageIds.length === 1 && selectedElementIds.length === 0 && selectedImages.length === 1

  // Resize ảnh paste đang chọn (giữ tỉ lệ) — handle góc dưới-phải
  const handleImageResizeDown = (e: React.PointerEvent, img: PageImageData) => {
    if (img.isLocked || !onUpdateImage) return
    e.stopPropagation()
    e.preventDefault()
    const scale = canvasScaleNow()
    const aspect = img.width / Math.max(1, img.height)
    const startX = e.clientX
    const startY = e.clientY
    const originW = img.width
    const onMove = (moveEv: PointerEvent) => {
      const dx = (moveEv.clientX - startX) / scale
      const dy = (moveEv.clientY - startY) / scale
      let newW = originW + (Math.abs(dx) >= Math.abs(dy) ? dx : dy * aspect)
      newW = Math.max(60, Math.min(PAGE_WIDTH - img.x - 8, newW))
      const newH = Math.max(40, newW / aspect)
      onUpdateImage(img.id, { width: Math.round(newW), height: Math.round(newH) })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const handleCanvasDoubleClick = (e: React.MouseEvent) => {
    if (activeTool === 'select' && onAddTextBox) {
      const point = getCanvasCoords(e as unknown as React.PointerEvent)
      const hit = hitTestElement(point)
      const hitImg = !hit ? hitTestImage(point) : null
      if (!hit && !hitImg) {
        onAddTextBox({
          id: `tb_${pageId}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          x: Math.max(16, Math.min(PAGE_WIDTH - 240, Math.round(point.x))),
          y: Math.max(16, Math.min(PAGE_HEIGHT - 60, Math.round(point.y))),
          width: Math.min(520, PAGE_WIDTH - point.x - 20),
          content: '',
          isEditing: true,
        })
      }
    }
  }

  return (
    <div
      className={`page-drawing-layer ${
        activeTool !== 'select' && activeTool !== 'text' ? 'is-active-drawing' : ''
      } ${activeTool === 'eraser' ? 'is-eraser-mode' : ''}`}
      style={{
        width: `${PAGE_WIDTH}px`,
        height: `${PAGE_HEIGHT}px`,
        position: 'absolute',
        top: 0,
        left: 0,
        // Thứ tự layer: ảnh (z3) < nét vẽ (z4) < textbox (z5). Phải set explicit
        // vì z-index:auto sẽ bị layer ảnh (z3) đè lên dù nằm trước trong DOM.
        zIndex: 4,
        pointerEvents: activeTool === 'text' ? 'none' : 'auto',
      }}
      onContextMenu={handleCanvasContextMenu}
    >
      {/* 1. Static Canvas (chung backing với preview → finished giống hệt lúc vẽ) */}
      <canvas
        ref={staticCanvasRef}
        width={Math.round(PAGE_WIDTH * canvasBacking)}
        height={Math.round(PAGE_HEIGHT * canvasBacking)}
        className="drawing-canvas static-canvas"
      />

      {/* 2. Active Canvas (drawing preview) */}
      <canvas
        ref={activeCanvasRef}
        width={Math.round(PAGE_WIDTH * canvasBacking)}
        height={Math.round(PAGE_HEIGHT * canvasBacking)}
        className={`drawing-canvas active-canvas ${activeTool === 'eraser' ? 'is-eraser-mode' : ''}`}
        style={{
          pointerEvents: activeTool === 'text' ? 'none' : 'auto',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleCanvasDoubleClick}
      />

      {/* 3. Excalidraw-Style Selection Bounding Box & Handles (chọn đơn) */}
      {activeTool === 'select' && isSingleDrawingSelection && selectedElem && selBounds && (
        <div
          className={`excalidraw-selection-box ${selectedElem.isLocked ? 'is-locked' : ''}`}
          style={{
            position: 'absolute',
            left: `${selBounds.minX}px`,
            top: `${selBounds.minY}px`,
            width: `${selBounds.width}px`,
            height: `${selBounds.height}px`,
            border: selectedElem.isLocked ? '1.5px dashed #94a3b8' : '1.5px dashed #2563eb',
            pointerEvents: 'none',
            zIndex: 10,
          }}
        >
          {/* Quick Floating Excalidraw Toolbar right above element */}
          <div
            className="excalidraw-floating-pill"
            style={{
              position: 'absolute',
              top: '-42px',
              left: '50%',
              transform: 'translateX(-50%)',
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '3px 8px',
              pointerEvents: 'auto',
              whiteSpace: 'nowrap',
              zIndex: 20,
            }}
          >
            {/* Color swatches */}
            {!selectedElem.isLocked &&
              ['#1e293b', '#2563eb', '#dc2626', '#16a34a', '#7c3aed'].map((c) => (
                <button
                  key={c}
                  type="button"
                  className="color-dot mini"
                  style={{
                    backgroundColor: c,
                    width: '14px',
                    height: '14px',
                    borderRadius: '50%',
                    border: selectedElem.color === c ? '2px solid #000' : '1px solid #cbd5e1',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                  onClick={() => onUpdateElement(selectedElem.id, { color: c })}
                />
              ))}

            {/* Dash Style Toggle */}
            {!selectedElem.isLocked && (
              <button
                type="button"
                className="quick-icon-btn"
                title="Toggle Dash"
                style={{
                  background: selectedElem.strokeStyle === 'dashed' ? '#dbeafe' : 'transparent',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '11px',
                  padding: '2px 5px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  color: selectedElem.strokeStyle === 'dashed' ? '#2563eb' : '#475569',
                }}
                onClick={() =>
                  onUpdateElement(selectedElem.id, {
                    strokeStyle: selectedElem.strokeStyle === 'dashed' ? 'solid' : 'dashed',
                  })
                }
              >
                Dash
              </button>
            )}

            {/* Fill Color for Rect / Circle */}
            {!selectedElem.isLocked &&
              (selectedElem.type === 'rect' || selectedElem.type === 'circle') && (
                <button
                  type="button"
                  className="quick-icon-btn"
                  title="Toggle Soft Fill"
                  style={{
                    background:
                      selectedElem.fillColor && selectedElem.fillColor !== 'transparent'
                        ? '#dbeafe'
                        : 'transparent',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '11px',
                    padding: '2px 5px',
                    cursor: 'pointer',
                    fontWeight: 600,
                    color:
                      selectedElem.fillColor && selectedElem.fillColor !== 'transparent'
                        ? '#2563eb'
                        : '#475569',
                  }}
                  onClick={() =>
                    onUpdateElement(selectedElem.id, {
                      fillColor:
                        selectedElem.fillColor && selectedElem.fillColor !== 'transparent'
                          ? 'transparent'
                          : `${selectedElem.color}15`,
                    })
                  }
                >
                  Fill
                </button>
              )}

            {/* Arrow Curvature Toggle */}
            {!selectedElem.isLocked && selectedElem.type === 'arrow' && (
              <button
                type="button"
                className="quick-icon-btn"
                title="Toggle Curved vs Straight Arrow"
                style={{
                  background: selectedElem.isCurved ? '#dbeafe' : 'transparent',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '11px',
                  padding: '2px 5px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  color: selectedElem.isCurved ? '#2563eb' : '#475569',
                }}
                onClick={() => {
                  const currentlyCurved = selectedElem.isCurved !== false
                  let nextPoints = [...selectedElem.points]
                  if (!currentlyCurved && nextPoints.length === 2) {
                    const mid = {
                      x: Math.round((nextPoints[0].x + nextPoints[1].x) / 2),
                      y: Math.round((nextPoints[0].y + nextPoints[1].y) / 2 - 25),
                    }
                    nextPoints = [nextPoints[0], mid, nextPoints[1]]
                  }
                  onUpdateElement(selectedElem.id, {
                    isCurved: !currentlyCurved,
                    points: nextPoints,
                  })
                }}
              >
                {selectedElem.isCurved ? 'Curved' : 'Straight'}
              </button>
            )}

            {/* Lock / Unlock Toggle Button */}
            <button
              type="button"
              className="quick-icon-btn"
              title={selectedElem.isLocked ? 'Unlock Object' : 'Lock Object'}
              style={{
                background: selectedElem.isLocked ? '#fee2e2' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '3px',
                color: selectedElem.isLocked ? '#dc2626' : '#475569',
                display: 'flex',
                alignItems: 'center',
              }}
              onClick={() => onUpdateElement(selectedElem.id, { isLocked: !selectedElem.isLocked })}
            >
              {selectedElem.isLocked ? <Lock size={13} /> : <Unlock size={13} />}
            </button>

            {/* Duplicate */}
            {!selectedElem.isLocked && (
              <button
                type="button"
                className="quick-icon-btn"
                title="Duplicate (Ctrl+D)"
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '3px',
                  color: '#475569',
                  display: 'flex',
                  alignItems: 'center',
                }}
                onClick={() => {
                  const clone: DrawingElement = JSON.parse(JSON.stringify(selectedElem))
                  clone.id = `elem_${pageId}_${Date.now()}`
                  if (clone.x !== undefined && clone.y !== undefined) {
                    clone.x += 16
                    clone.y += 16
                  } else if (clone.points) {
                    clone.points = clone.points.map((p) => ({ ...p, x: p.x + 16, y: p.y + 16 }))
                  }
                  onAddElement(clone)
                  onSelectElements([clone.id])
                  onSelectElement(clone.id)
                }}
              >
                <Copy size={13} />
              </button>
            )}

            {/* Delete */}
            {!selectedElem.isLocked && (
              <button
                type="button"
                className="quick-icon-btn danger"
                title="Delete (Delete / Backspace)"
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '3px',
                  color: '#dc2626',
                  display: 'flex',
                  alignItems: 'center',
                }}
                onClick={() => {
                  onRemoveElement(selectedElem.id)
                  onSelectElements([])
                  onSelectElement(null)
                }}
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>

          {/* 8 Resize Handles for Rect & Circle (only when unlocked) */}
          {!selectedElem.isLocked &&
            (selectedElem.type === 'rect' || selectedElem.type === 'circle') && (
              <>
                {(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as ResizeHandleType[]).map((h) => {
                  const isTop = h.includes('n')
                  const isBottom = h.includes('s')
                  const isLeft = h.includes('w')
                  const isRight = h.includes('e')

                  const top = isTop
                    ? -HANDLE_SIZE / 2
                    : isBottom
                    ? selBounds.height - HANDLE_SIZE / 2
                    : selBounds.height / 2 - HANDLE_SIZE / 2
                  const left = isLeft
                    ? -HANDLE_SIZE / 2
                    : isRight
                    ? selBounds.width - HANDLE_SIZE / 2
                    : selBounds.width / 2 - HANDLE_SIZE / 2
                  const cursor = `${h}-resize`

                  return (
                    <div
                      key={h}
                      className="excalidraw-handle"
                      style={{
                        position: 'absolute',
                        top: `${top}px`,
                        left: `${left}px`,
                        width: `${HANDLE_SIZE}px`,
                        height: `${HANDLE_SIZE}px`,
                        backgroundColor: '#ffffff',
                        border: '1.5px solid #2563eb',
                        borderRadius: '2px',
                        cursor,
                        pointerEvents: 'auto',
                      }}
                      onPointerDown={(e) => handleResizeHandleDown(e, h)}
                    />
                  )
                })}
              </>
            )}

          {/* Endpoint Handles for Arrow and Line (only when unlocked) */}
          {!selectedElem.isLocked &&
            (selectedElem.type === 'arrow' || selectedElem.type === 'line') &&
            selectedElem.points.length >= 2 && (
              <>
                {/* Start Handle */}
                <div
                  className="excalidraw-endpoint-handle"
                  style={{
                    position: 'absolute',
                    left: `${selectedElem.points[0].x - selBounds.minX - HANDLE_SIZE / 2}px`,
                    top: `${selectedElem.points[0].y - selBounds.minY - HANDLE_SIZE / 2}px`,
                    width: `${HANDLE_SIZE + 2}px`,
                    height: `${HANDLE_SIZE + 2}px`,
                    backgroundColor: '#ffffff',
                    border: '2px solid #2563eb',
                    borderRadius: '50%',
                    cursor: 'crosshair',
                    pointerEvents: 'auto',
                  }}
                  title="Drag Arrow Start"
                  onPointerDown={(e) => handleResizeHandleDown(e, 'arrow-start')}
                />

                {/* Curvature Handle for Arrow */}
                {selectedElem.type === 'arrow' &&
                  selectedElem.points.length >= 2 &&
                  (() => {
                    const midX =
                      selectedElem.points.length >= 3
                        ? selectedElem.points[1].x
                        : (selectedElem.points[0].x + selectedElem.points[1].x) / 2
                    const midY =
                      selectedElem.points.length >= 3
                        ? selectedElem.points[1].y
                        : (selectedElem.points[0].y + selectedElem.points[1].y) / 2

                    return (
                      <div
                        className="excalidraw-curve-handle"
                        style={{
                          position: 'absolute',
                          left: `${midX - selBounds.minX - (HANDLE_SIZE + 4) / 2}px`,
                          top: `${midY - selBounds.minY - (HANDLE_SIZE + 4) / 2}px`,
                          width: `${HANDLE_SIZE + 4}px`,
                          height: `${HANDLE_SIZE + 4}px`,
                          backgroundColor: '#38bdf8',
                          border: '2px solid #ffffff',
                          borderRadius: '50%',
                          boxShadow: '0 0 5px rgba(0,0,0,0.35)',
                          cursor: 'grab',
                          pointerEvents: 'auto',
                        }}
                        title="Drag to curve arrow (Kéo để chỉnh độ cong mũi tên)"
                        onPointerDown={(e) => handleResizeHandleDown(e, 'arrow-curve')}
                      />
                    )
                  })()}

                {/* End Handle */}
                <div
                  className="excalidraw-endpoint-handle"
                  style={{
                    position: 'absolute',
                    left: `${
                      selectedElem.points[selectedElem.points.length - 1].x -
                      selBounds.minX -
                      HANDLE_SIZE / 2
                    }px`,
                    top: `${
                      selectedElem.points[selectedElem.points.length - 1].y -
                      selBounds.minY -
                      HANDLE_SIZE / 2
                    }px`,
                    width: `${HANDLE_SIZE + 2}px`,
                    height: `${HANDLE_SIZE + 2}px`,
                    backgroundColor: '#2563eb',
                    border: '2px solid #ffffff',
                    borderRadius: '50%',
                    cursor: 'crosshair',
                    pointerEvents: 'auto',
                  }}
                  title="Drag Arrow Head"
                  onPointerDown={(e) => handleResizeHandleDown(e, 'arrow-end')}
                />
              </>
            )}
        </div>
      )}

      {/* 3b. Khung chọn cho multi-select (kéo vùng marquee): mỗi nét 1 khung đứt nét */}
      {activeTool === 'select' &&
        !isSingleDrawingSelection &&
        multiDrawingBounds.map(({ el, bounds }) => (
          <div
            key={el.id}
            className="excalidraw-selection-box"
            style={{
              position: 'absolute',
              left: `${bounds.minX}px`,
              top: `${bounds.minY}px`,
              width: `${bounds.width}px`,
              height: `${bounds.height}px`,
              border: el.isLocked ? '1.5px dashed #94a3b8' : '1.5px dashed #2563eb',
              pointerEvents: 'none',
              zIndex: 10,
            }}
          />
        ))}

      {/* 3c. Khung chọn cho ảnh paste đang chọn (ảnh nằm dưới canvas nên vẽ khung tại đây) */}
      {activeTool === 'select' &&
        selectedImages.map((im) => (
          <div
            key={im.id}
            className="excalidraw-selection-box"
            style={{
              position: 'absolute',
              left: `${im.x}px`,
              top: `${im.y}px`,
              width: `${im.width}px`,
              height: `${im.height}px`,
              border: im.isLocked ? '1.5px dashed #94a3b8' : '1.5px dashed #2563eb',
              pointerEvents: 'none',
              zIndex: 10,
            }}
          >
            {isSingleImageSelection && !im.isLocked && onUpdateImage && (
              <div
                style={{
                  position: 'absolute',
                  right: '-8px',
                  bottom: '-8px',
                  width: '16px',
                  height: '16px',
                  backgroundColor: '#2563eb',
                  border: '2px solid #ffffff',
                  borderRadius: '50%',
                  cursor: 'nwse-resize',
                  boxShadow: '0 1px 5px rgba(0,0,0,0.3)',
                  pointerEvents: 'auto',
                }}
                title="Kéo để resize ảnh (giữ tỉ lệ)"
                onPointerDown={(e) => handleImageResizeDown(e, im)}
              />
            )}
          </div>
        ))}

      {/* 3d. Khung marquee khi đang kéo vùng chọn */}
      {activeTool === 'select' && marquee && (
        <div
          className="marquee-selection-box"
          style={{
            position: 'absolute',
            left: `${Math.min(marquee.x0, marquee.x1)}px`,
            top: `${Math.min(marquee.y0, marquee.y1)}px`,
            width: `${Math.abs(marquee.x1 - marquee.x0)}px`,
            height: `${Math.abs(marquee.y1 - marquee.y0)}px`,
            background: 'rgba(37, 99, 235, 0.08)',
            border: '1.5px solid #2563eb',
            pointerEvents: 'none',
            zIndex: 30,
          }}
        />
      )}

      {/* 4. Canvas Right-click Context Menu (portal ra body: sheet có transform) */}
      {contextMenuPos &&
        createPortal(
          (() => {
          const menuDrawing =
            contextMenuPos.kind === 'drawing'
              ? elements.find((d) => d.id === contextMenuPos.elementId)
              : undefined
          const menuImage =
            contextMenuPos.kind === 'image'
              ? images.find((im) => im.id === contextMenuPos.elementId)
              : undefined
          if (!menuDrawing && !menuImage) return null
          const closeMenu = () => setContextMenuPos(null)
          return (
            <div
              className="object-context-menu"
              style={{
                position: 'fixed',
                left: `${contextMenuPos.x}px`,
                top: `${contextMenuPos.y}px`,
                zIndex: 1000,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {menuDrawing && (
                <>
                  <button
                    type="button"
                    className="obj-context-item"
                    onClick={() => {
                      onUpdateElement(menuDrawing.id, { isLocked: !menuDrawing.isLocked })
                      closeMenu()
                    }}
                  >
                    {menuDrawing.isLocked ? <Unlock size={13} /> : <Lock size={13} />}
                    <span>{menuDrawing.isLocked ? 'Mở khóa' : 'Khóa lại'}</span>
                  </button>

                  {!menuDrawing.isLocked && (
                    <button
                      type="button"
                      className="obj-context-item"
                      onClick={() => {
                        const clone: DrawingElement = JSON.parse(JSON.stringify(menuDrawing))
                        clone.id = `elem_${pageId}_${Date.now()}`
                        if (clone.x !== undefined && clone.y !== undefined) {
                          clone.x += 16
                          clone.y += 16
                        } else if (clone.points) {
                          clone.points = clone.points.map((p) => ({
                            ...p,
                            x: p.x + 16,
                            y: p.y + 16,
                          }))
                        }
                        clone.isLocked = false
                        onAddElement(clone)
                        onSelectElements([clone.id])
                        onSelectElement(clone.id)
                        closeMenu()
                      }}
                    >
                      <Copy size={13} />
                      <span>Nhân bản</span>
                    </button>
                  )}

                  {onReorderElement && (
                    <>
                      <button
                        type="button"
                        className="obj-context-item"
                        onClick={() => {
                          onReorderElement(menuDrawing.id, 'front')
                          closeMenu()
                        }}
                      >
                        <ArrowUp size={13} />
                        <span>Đưa lên trên</span>
                      </button>
                      <button
                        type="button"
                        className="obj-context-item"
                        onClick={() => {
                          onReorderElement(menuDrawing.id, 'back')
                          closeMenu()
                        }}
                      >
                        <ArrowDown size={13} />
                        <span>Đưa xuống dưới</span>
                      </button>
                    </>
                  )}

                  {!menuDrawing.isLocked && (
                    <button
                      type="button"
                      className="obj-context-item danger"
                      onClick={() => {
                        onRemoveElement(menuDrawing.id)
                        // Chỉ loại khỏi mảng, giữ lại các nét khác trong nhóm
                        onSelectElements(
                          selectedElementIds.filter((id) => id !== menuDrawing.id)
                        )
                        closeMenu()
                      }}
                    >
                      <Trash2 size={13} />
                      <span>Xóa (Delete)</span>
                    </button>
                  )}
                </>
              )}

              {menuImage && onUpdateImage && onRemoveImage && (
                <>
                  <button
                    type="button"
                    className="obj-context-item"
                    onClick={() => {
                      onUpdateImage(menuImage.id, { isLocked: !menuImage.isLocked })
                      closeMenu()
                    }}
                  >
                    {menuImage.isLocked ? <Unlock size={13} /> : <Lock size={13} />}
                    <span>{menuImage.isLocked ? 'Mở khóa ảnh' : 'Khóa ảnh'}</span>
                  </button>

                  {!menuImage.isLocked && onDuplicateImage && (
                    <button
                      type="button"
                      className="obj-context-item"
                      onClick={() => {
                        onDuplicateImage(menuImage.id)
                        closeMenu()
                      }}
                    >
                      <Copy size={13} />
                      <span>Nhân bản (Ctrl+D)</span>
                    </button>
                  )}

                  {onUpdateImage && (
                    <button
                      type="button"
                      className="obj-context-item"
                      onClick={() => {
                        onUpdateImage(menuImage.id, { showFrame: !menuImage.showFrame })
                        closeMenu()
                      }}
                    >
                      <Frame size={13} />
                      <span>{menuImage.showFrame ? 'Ẩn khung' : 'Hiển thị khung'}</span>
                    </button>
                  )}

                  {onReorderImage && (
                    <>
                      <button
                        type="button"
                        className="obj-context-item"
                        onClick={() => {
                          onReorderImage(menuImage.id, 'front')
                          closeMenu()
                        }}
                      >
                        <ArrowUp size={13} />
                        <span>Đưa lên trên</span>
                      </button>
                      <button
                        type="button"
                        className="obj-context-item"
                        onClick={() => {
                          onReorderImage(menuImage.id, 'back')
                          closeMenu()
                        }}
                      >
                        <ArrowDown size={13} />
                        <span>Đưa xuống dưới</span>
                      </button>
                    </>
                  )}

                  {!menuImage.isLocked && (
                    <button
                      type="button"
                      className="obj-context-item danger"
                      onClick={() => {
                        onRemoveImage(menuImage.id)
                        onSelectImages(
                          selectedImageIds.filter((id) => id !== menuImage.id)
                        )
                        closeMenu()
                      }}
                    >
                      <Trash2 size={13} />
                      <span>Xóa ảnh (Delete)</span>
                    </button>
                  )}
                </>
              )}
            </div>
          )
        })(),
        document.body
      )}
    </div>
  )
}
