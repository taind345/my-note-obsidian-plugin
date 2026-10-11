/**
 * Độ phân giải backing store cho canvas vẽ tay — DÙNG CHUNG cho cả 2 canvas
 * (static đã xong + active preview đang vẽ) để 2 trạng thái pixel-identical.
 *
 * backing = dpr × zoom (min 1, max 4): zoom to vẫn nét trên màn hidpi.
 * Cap 4x để nhẹ RAM (zoom 2× + dpr 2 → 3200×4400 ≈ 56MB/canvas; các trang
 * ngoài tầm nhìn đã unmount nên chỉ vài canvas tồn tại cùng lúc).
 */
export const MAX_CANVAS_BACKING = 4

/** devicePixelRatio chặn trên 2x (tránh tốn RAM vô ích trên màn dpr 3+). */
export function devicePixelRatioCapped(): number {
  if (typeof window === 'undefined' || !window.devicePixelRatio) return 1
  return Math.min(2, window.devicePixelRatio)
}

/**
 * Backing multiplier theo zoom của view chứa trang (0.3–2.0).
 * VD: zoom 1 + dpr 2 → 2x; zoom 2 + dpr 2 → 4x; zoom 0.5 + dpr 1 → 1x (min).
 */
export function canvasBackingScale(zoom: number): number {
  const z = Number.isFinite(zoom) && zoom > 0 ? zoom : 1
  return Math.min(MAX_CANVAS_BACKING, Math.max(1, devicePixelRatioCapped() * z))
}
