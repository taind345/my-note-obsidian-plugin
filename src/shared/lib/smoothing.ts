import type { Point } from '@/shared/types/notebook'

/**
 * Renders smooth quadratic bezier curve path through points.
 * Ensures 100% pixel-perfect matching between live drawing and static canvas.
 */
export function drawSmoothStroke(ctx: CanvasRenderingContext2D, points: Point[]): void {
  if (points.length === 0) return
  if (points.length === 1) {
    ctx.save()
    ctx.fillStyle = ctx.strokeStyle
    ctx.beginPath()
    ctx.arc(points[0].x, points[0].y, ctx.lineWidth / 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    return
  }

  if (points.length === 2) {
    const [a, b] = points
    if (a.x === b.x && a.y === b.y) {
      // Chạm không di chuyển (chấm chữ i, dấu chấm): lineTo cùng điểm có thể
      // không ra gì tùy engine → vẽ chấm tròn tường minh bằng màu nét
      drawSmoothStroke(ctx, [a])
      return
    }
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
    return
  }

  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)

  for (let i = 1; i < points.length - 1; i++) {
    const xc = (points[i].x + points[i + 1].x) / 2
    const yc = (points[i].y + points[i + 1].y) / 2
    ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc)
  }

  // Curve to the last point
  const last = points[points.length - 1]
  const secondLast = points[points.length - 2]
  ctx.quadraticCurveTo(secondLast.x, secondLast.y, last.x, last.y)
  ctx.stroke()
}

/**
 * Draws an arrow with a head on a 2D canvas context.
 */
export function drawArrow(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  headLength = 14
): void {
  const dx = toX - fromX
  const dy = toY - fromY
  const angle = Math.atan2(dy, dx)

  ctx.beginPath()
  ctx.moveTo(fromX, fromY)
  ctx.lineTo(toX, toY)
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(toX, toY)
  ctx.lineTo(
    toX - headLength * Math.cos(angle - Math.PI / 6),
    toY - headLength * Math.sin(angle - Math.PI / 6)
  )
  ctx.moveTo(toX, toY)
  ctx.lineTo(
    toX - headLength * Math.cos(angle + Math.PI / 6),
    toY - headLength * Math.sin(angle + Math.PI / 6)
  )
  ctx.stroke()
}
