import type { DrawingElement, PageImageData } from '../types/notebook'

export interface Rect {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** Chuẩn hoá 2 điểm kéo chuột thành hình chữ nhật vùng chọn */
export function normalizeRect(x0: number, y0: number, x1: number, y1: number): Rect {
  return {
    minX: Math.min(x0, x1),
    minY: Math.min(y0, y1),
    maxX: Math.max(x0, x1),
    maxY: Math.max(y0, y1),
  }
}

/** Vùng chọn quá nhỏ thì coi như click (không phải marquee) */
export function isClickRect(r: Rect, threshold = 4): boolean {
  return r.maxX - r.minX < threshold && r.maxY - r.minY < threshold
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY
}

/** Bounds của 1 nét vẽ (copy logic từ PageCanvas để dùng chung cho marquee) */
export function getDrawingBounds(elem: DrawingElement): Rect {
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
    return { minX, minY, maxX, maxY }
  }
  return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
}

export function getImageBounds(img: PageImageData): Rect {
  return {
    minX: img.x,
    minY: img.y,
    maxX: img.x + img.width,
    maxY: img.y + img.height,
  }
}

/**
 * Marquee select kiểu Excalidraw: trả về id các drawings + images
 * giao với vùng chọn (kể cả giao 1 phần).
 */
export function marqueeSelect(
  marquee: Rect,
  drawings: DrawingElement[],
  images: PageImageData[]
): { drawingIds: string[]; imageIds: string[] } {
  const drawingIds: string[] = []
  for (const d of drawings) {
    if (rectsIntersect(marquee, getDrawingBounds(d))) drawingIds.push(d.id)
  }
  const imageIds: string[] = []
  for (const im of images) {
    if (rectsIntersect(marquee, getImageBounds(im))) imageIds.push(im.id)
  }
  return { drawingIds, imageIds }
}

/** Toggle 1 id trong mảng multi-select (dùng cho Shift+Click) */
export function toggleInList(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
}
