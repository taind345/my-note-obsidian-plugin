import type { Point } from '@/shared/types/notebook'
import { STROKE_SIMPLIFY_EPSILON } from './simplifyStroke'

/**
 * Luồng điểm nét vẽ tay — thiết kế để preview == nét đã lưu (kiểu Excalidraw:
 * phần tử đang vẽ CHÍNH LÀ phần tử sẽ commit, chỉ append điểm, không sửa lại
 * quá khứ).
 *
 * Trước đây: RDP chạy lại trên cửa sổ điểm mỗi frame → các đỉnh ở đuôi bị chọn
 * lại liên tục, đường cong ở đoạn vừa viết "rung nhẹ" rồi mới đứng yên khi bị
 * đóng băng. Giờ: lọc NHÂN QUẢ (sleeve / Reumann–Witkam):
 *
 * - `out`: các đỉnh ĐÃ CHỐT. Chỉ append, không bao giờ sửa/xóa → mọi frame
 *   preview, commit, lần mở lại file đều vẽ cùng đường đó (đồng bộ tuyệt đối).
 * - `run`: các điểm raw từ đỉnh chốt cuối tới điểm mới nhất (tip). Điểm raw mới
 *   được gộp vào `run` miễn là mọi điểm trong `run` còn nằm trong `epsilon` của
 *   dây (anchor → điểm mới); vượt ngưỡng thì chốt điểm liền trước làm đỉnh mới.
 * - `snapshot()` = out + tip (đầu bút thật). Chỉ đoạn nối tip là thay đổi giữa
 *   các frame — đúng chỗ bút đang chạy, không thể thấy được.
 *
 * Mỗi điểm O(|run|) với |run| ≤ MAX_RUN → không còn công việc theo độ dài nét.
 */
export class StrokeStream {
  /** Bỏ điểm trùng/gần trùng (sau làm tròn 0.1). Thấp vì coalesced events dày. */
  private static readonly MIN_GAP = 0.4
  /** Chặn đường thẳng dài vô hạn trong 1 đoạn gộp (giữ preview bám tay). */
  private static readonly MAX_RUN = 24

  private out: Point[] = []
  private run: Point[] = []
  private readonly epsilon: number

  constructor(epsilon: number = STROKE_SIMPLIFY_EPSILON) {
    this.epsilon = epsilon
  }

  private static round1(v: number): number {
    return Math.round(v * 10) / 10
  }

  private tip(): Point | null {
    if (this.run.length > 0) return this.run[this.run.length - 1]
    if (this.out.length > 0) return this.out[this.out.length - 1]
    return null
  }

  /** Đẩy 1 điểm raw. Trả về true nếu được nhận (qua lọc khoảng cách). */
  push(raw: Point): boolean {
    // Làm tròn + strip {x,y} NGAY khi nhận: mảng preview và mảng lưu là cùng số.
    const p: Point = { x: StrokeStream.round1(raw.x), y: StrokeStream.round1(raw.y) }
    const last = this.tip()
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < StrokeStream.MIN_GAP) {
      return false
    }
    if (this.out.length === 0) {
      this.out.push(p)
      return true
    }
    if (this.run.length === 0) {
      this.run.push(p)
      return true
    }

    const anchor = this.out[this.out.length - 1]
    if (this.run.length < StrokeStream.MAX_RUN && this.fits(anchor, p)) {
      this.run.push(p)
      return true
    }
    // Dây (anchor → p) làm lệch điểm giữa quá ngưỡng: chốt điểm liền trước p
    this.out.push(this.run[this.run.length - 1])
    this.run = [p]
    return true
  }

  /** Mọi điểm đang chờ trong run còn nằm trong epsilon của dây a→b? */
  private fits(a: Point, b: Point): boolean {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const lenSq = dx * dx + dy * dy
    for (const q of this.run) {
      let d: number
      if (lenSq === 0) {
        d = Math.hypot(q.x - a.x, q.y - a.y)
      } else {
        // khoảng cách tới ĐOẠN (không phải đường thẳng): quay đầu 180° không bị
        // gộp nhầm thành nét thẳng
        const t = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / lenSq))
        d = Math.hypot(q.x - (a.x + t * dx), q.y - (a.y + t * dy))
      }
      if (d > this.epsilon) return false
    }
    return true
  }

  /** Điểm đã nhận cuối cùng (để kẹp release teleport). */
  lastAcceptedPoint(): Point | null {
    return this.tip()
  }

  /**
   * CỬA DUY NHẤT ra dữ liệu vẽ: preview, commit, test đều qua đây. Mảng trả về
   * = các đỉnh đã chốt (bất biến) + đầu bút hiện tại.
   */
  snapshot(): Point[] {
    const t = this.run.length > 0 ? this.run[this.run.length - 1] : null
    return t ? [...this.out, t] : this.out.slice()
  }

  /**
   * Chốt nét = snapshot cuối + điểm thả bút (nếu khác biệt). Chạm không di
   * chuyển (chấm chữ i, dấu chấm câu...) trả về 2 điểm trùng nhau → vẽ thành
   * chấm tròn; không có điểm nào thì [].
   */
  finish(release?: Point): Point[] {
    const pts = this.snapshot()
    if (release) {
      const last = pts.length > 0 ? pts[pts.length - 1] : null
      const r = { x: StrokeStream.round1(release.x), y: StrokeStream.round1(release.y) }
      if (!last || Math.hypot(r.x - last.x, r.y - last.y) >= StrokeStream.MIN_GAP) {
        pts.push(r)
      }
    }
    if (pts.length === 0) return []
    if (pts.length === 1) return [pts[0], { ...pts[0] }]
    return pts
  }
}
