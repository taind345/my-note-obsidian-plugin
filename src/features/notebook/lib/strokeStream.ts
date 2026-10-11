import type { Point } from '@/shared/types/notebook'
import { simplifyPolyline, STROKE_SIMPLIFY_EPSILON } from './simplifyStroke'

/**
 * Luồng điểm nét vẽ kiểu Excalidraw (`lastCommittedPoint`): đơn giản hóa ngay
 * TRONG LÚC vẽ thay vì RDP lại lúc commit.
 *
 * - `frozen`: prefix đã chốt, KHÔNG BAO GIỜ đổi → mọi frame preview + commit
 *   render cùng pixels ở phần đầu (đồng bộ 1:1 theo kiến trúc, không cần khớp epsilon).
 * - `buf`: cửa sổ raw chưa chốt (bắt đầu bằng anchor = điểm frozen cuối).
 * - Preview vẽ `snapshot()` = frozen + RDP(buf): chỉ đuôi (chỗ bút đang chạy,
 *   mắt không đối chiếu được) được tính lại mỗi frame.
 * - Commit = `finish(releasePoint)`: đẩy nốt điểm thả bút qua cùng pipeline rồi
 *   chốt — đuôi khớp tay, đầu khớp preview. File gọn như RDP batch.
 */
export class StrokeStream {
  private static readonly WINDOW = 40
  private static readonly LIVE_TAIL = 12
  private static readonly MIN_GAP = 0.8

  private frozen: Point[] = []
  private buf: Point[] = []
  private readonly epsilon: number

  constructor(epsilon: number = STROKE_SIMPLIFY_EPSILON) {
    this.epsilon = epsilon
  }

  /** Đẩy 1 điểm raw. Trả về true nếu được nhận (qua lọc khoảng cách). */
  push(p: Point): boolean {
    const last = this.buf.length > 0 ? this.buf[this.buf.length - 1] : null
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < StrokeStream.MIN_GAP) {
      return false
    }
    this.buf.push(p)
    this.freezeWindow()
    return true
  }

  /** Polyline hiện tại để preview: đầu đóng băng + đuôi tính lại. */
  snapshot(): Point[] {
    if (this.buf.length === 0) return this.frozen.slice()
    const win = simplifyPolyline(this.buf, this.epsilon)
    if (this.frozen.length === 0) return win
    return [...this.frozen, ...win.slice(1)]
  }

  /**
   * Chốt nét: đẩy nốt điểm thả bút (nếu khác biệt) qua cùng pipeline rồi trả
   * points gọn (bỏ pressure/time + tròn 1dp — render chỉ cần x/y).
   * Trả về [] nếu không đủ 2 điểm (caller bỏ qua như cũ).
   */
  finish(release?: Point): Point[] {
    if (release) this.push(release)
    const pts = this.snapshot()
    if (pts.length < 2) return []
    return pts.map((p) => ({
      x: Math.round(p.x * 10) / 10,
      y: Math.round(p.y * 10) / 10,
    }))
  }

  private freezeWindow(): void {
    while (this.buf.length > StrokeStream.WINDOW) {
      const s = simplifyPolyline(this.buf, this.epsilon)
      // Đóng băng mọi điểm trừ LIVE_TAIL cuối (giữ ≥1 để buf co lại được).
      // RDP trả về subset (cùng ref) nên tìm được vị trí cắt trong buf.
      // Bỏ s[0] khi frozen đã có anchor đó (tránh trùng), giữ khi frozen rỗng.
      const freezeUpTo = Math.max(1, s.length - StrokeStream.LIVE_TAIL)
      const cut = this.buf.indexOf(s[freezeUpTo])
      if (cut < 1) break
      const skipFirst = this.frozen.length > 0 ? 1 : 0
      this.frozen.push(...s.slice(skipFirst, freezeUpTo + 1))
      this.buf = this.buf.slice(cut)
    }
  }
}
