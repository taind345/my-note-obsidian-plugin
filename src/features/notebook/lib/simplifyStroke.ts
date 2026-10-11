import type { Point } from '@/shared/types/notebook'

/**
 * Ngưỡng đơn giản hóa nét vẽ (px). RDP đảm bảo đa tuyến sau khi gọn lệch
 * tối đa < epsilon so với nét gốc. 0.3px = dưới ngưỡng mắt thấy ngay cả khi
 * zoom 2x (0.6px CSS), nên thả bút không còn cảm giác nét "co lại".
 * Preview lúc đang kéo vẫn dùng points thô nên cảm giác vẽ không đổi;
 * chỉ lúc commit mới gọn.
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

const round1dp = (v: number): number => Math.round(v * 10) / 10

/**
 * Chốt nét vẽ lúc thả bút: lọc điểm trùng (<0.8px, giữ logic cũ) → RDP →
 * bỏ `pressure`/`time` (render chỉ đọc x/y) + làm tròn 1dp. File gọn ~4-5x,
 * undo/autosave/parse/render nhẹ theo mà hình vẽ không đổi.
 */
export function finalizeStrokePoints(
  rawPoints: Point[],
  epsilon: number = STROKE_SIMPLIFY_EPSILON
): Point[] {
  const deduped: Point[] = []
  for (const p of rawPoints) {
    const prev = deduped[deduped.length - 1]
    if (!prev || Math.hypot(p.x - prev.x, p.y - prev.y) >= 0.8) {
      deduped.push(p)
    }
  }
  if (deduped.length === 0) return []
  const simplified = simplifyPolyline(deduped, epsilon)
  return simplified.map((p) => ({ x: round1dp(p.x), y: round1dp(p.y) }))
}
