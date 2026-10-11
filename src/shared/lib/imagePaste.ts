import type { PageImageData } from '@/shared/types/notebook'
import { PAGE_WIDTH, PAGE_HEIGHT } from './lineSnap'

export const MAX_PASTE_IMAGE_WIDTH = 520
export const MAX_PASTE_IMAGE_HEIGHT = 420

export function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export function getImageNaturalSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth || 400, height: img.naturalHeight || 300 })
    img.onerror = () => resolve({ width: 400, height: 300 })
    img.src = src
  })
}

function fitSize(naturalW: number, naturalH: number): { width: number; height: number } {
  const safeW = Math.max(1, naturalW)
  const safeH = Math.max(1, naturalH)
  const scale = Math.min(
    1,
    MAX_PASTE_IMAGE_WIDTH / safeW,
    MAX_PASTE_IMAGE_HEIGHT / safeH
  )
  return {
    width: Math.round(safeW * scale),
    height: Math.round(safeH * scale),
  }
}

export async function fileToPageImage(
  pageId: string,
  file: File,
  cascadeIndex = 0,
  anchor?: { x: number; y: number } | null
): Promise<PageImageData> {
  const src = await fileToDataURL(file)
  const natural = await getImageNaturalSize(src)
  const fitted = fitSize(natural.width, natural.height)

  const offset = (cascadeIndex % 8) * 24
  // Paste ngay vị trí con trỏ (canh giữa ảnh vào điểm anchor), không thì giữa trang
  const centerX = anchor ? anchor.x + offset : PAGE_WIDTH / 2 + offset
  const centerY = anchor ? anchor.y + offset : 220 + offset
  const x = Math.max(
    8,
    Math.min(PAGE_WIDTH - fitted.width - 8, Math.round(centerX - fitted.width / 2))
  )
  const y = Math.max(
    8,
    Math.min(PAGE_HEIGHT - fitted.height - 60, Math.round(centerY - fitted.height / 2))
  )

  return {
    id: `img_${pageId}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    x,
    y,
    width: fitted.width,
    height: fitted.height,
    src,
    name: file.name || 'pasted-image.png',
  }
}

/** Lấy tất cả File ảnh từ ClipboardEvent (Ctrl+V screenshot / copy file ảnh) */
export function extractImagesFromClipboard(e: React.ClipboardEvent | ClipboardEvent): File[] {
  const dt = (e as React.ClipboardEvent).clipboardData
  if (!dt) return []
  const files: File[] = []
  // Ưu tiên files (copy file ảnh từ Explorer / screenshot tool)
  if (dt.files && dt.files.length > 0) {
    for (let i = 0; i < dt.files.length; i++) {
      const f = dt.files[i]
      if (f.type.startsWith('image/')) files.push(f)
    }
    if (files.length > 0) return files
  }
  // Fallback: clipboard items (copy ảnh từ web / Paint / Zalo...)
  if (dt.items) {
    for (let i = 0; i < dt.items.length; i++) {
      const item = dt.items[i]
      if (item.type.startsWith('image/')) {
        const f = item.getAsFile()
        if (f) files.push(f)
      }
    }
  }
  return files
}

/** Lấy tất cả File ảnh từ DropEvent (kéo-thả file ảnh vào trang) */
export function extractImagesFromDrop(e: React.DragEvent | DragEvent): File[] {
  const dt = (e as React.DragEvent).dataTransfer
  if (!dt?.files) return []
  const files: File[] = []
  for (let i = 0; i < dt.files.length; i++) {
    const f = dt.files[i]
    if (f.type.startsWith('image/')) files.push(f)
  }
  return files
}
