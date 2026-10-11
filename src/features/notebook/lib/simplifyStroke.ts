import type { Point } from '@/shared/types/notebook'

/**
 * Ngưỡng đơn giản hóa nét vẽ (px). Dùng trong StrokeStream (simplify ngay
 * trong lúc vẽ, đầu đóng băng): 0.3px = dưới ngưỡng mắt thấy ngay cả khi
 * zoom 2x (0.6px CSS).
 */
export const STROKE_SIMPLIFY_EPSILON = 0.3

function perpendicularDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq
  const cx = a.x + t * dx
  const cy = a.y + t * dy
  return Math.hypot(p.x - cx, p.y - cy)
}

/** Ramer–Douglas–Peucker: giữ lại điểm cần thiết, luôn giữ 2 đầu mút. */
export function simplifyPolyline(points: Point[], epsilon: number): Point[] {
  if (points.length <= 2) return points.slice()
  let maxDist = 0
  let maxIndex = 0
  const first = points[0]
  const last = points[points.length - 1]
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], first, last)
    if (d > maxDist) {
      maxDist = d
      maxIndex = i
    }
  }
  if (maxDist > epsilon) {
    const left = simplifyPolyline(points.slice(0, maxIndex + 1), epsilon)
    const right = simplifyPolyline(points.slice(maxIndex), epsilon)
    return left.slice(0, -1).concat(right)
  }
  return [first, last]
}
