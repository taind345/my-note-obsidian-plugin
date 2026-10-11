import rough from 'roughjs'
import type { PageData } from '@/shared/types/notebook'
import { renderMarkdown } from '@/shared/lib/markdown'
import { drawSmoothStroke, drawArrow } from '@/shared/lib/smoothing'
import { getElementSeed } from '@/features/notebook/lib/elementSeed'

export interface OffscreenRenderOptions {
  /** = pixelRatio export (1/1.5/2): canvas vẽ backing theo để nét xuất ra sắc */
  pixelRatio: number
  /**
   * Nơi gắn node offscreen. Web app CSS global → document.body.
   * Plugin Obsidian CSS scope dưới host → truyền element host để style áp đúng.
   */
  mountRoot?: HTMLElement | null
}

/**
 * Dựng 1 trang vở thành DOM (ưu tiên dùng node đang mount thật, không thì
 * clone offscreen) để html-to-image chụp ra PDF. Dùng CHUNG routine + seed
 * với màn hình (rough.js + drawSmoothStroke) nên PDF giống hệt những gì thấy.
 */
export async function renderOffscreenPageSheet(
  page: PageData,
  opts: OffscreenRenderOptions
): Promise<HTMLElement> {
  const { pixelRatio, mountRoot } = opts
  // Trang đang hiển thị thật thì chụp luôn (khỏi clone)
  const existing = document.getElementById(`page-sheet-${page.id}`)
  if (existing) {
    return existing
  }

  const mount = mountRoot ?? document.body
  const offscreenContainer = document.createElement('div')
  offscreenContainer.id = `offscreen-export-${page.id}`
  offscreenContainer.style.position = 'fixed'
  offscreenContainer.style.top = '-9999px'
  offscreenContainer.style.left = '-9999px'
  offscreenContainer.style.zIndex = '-1000'
  mount.appendChild(offscreenContainer)

  // Create a static visual representation of the page
  const sheet = document.createElement('div')
  sheet.className = `notebook-sheet pattern-${page.pattern || 'ruled'}`
  sheet.style.width = '800px'
  sheet.style.height = '1100px'
  sheet.style.position = 'relative'
  sheet.style.backgroundColor = '#ffffff'

  // Add margin line
  if (page.pattern === 'ruled') {
    const marginLine = document.createElement('div')
    marginLine.className = 'notebook-margin-line'
    sheet.appendChild(marginLine)
  }

  // Render text boxes
  for (const box of page.textBoxes) {
    const boxDiv = document.createElement('div')
    boxDiv.className = 'notebook-textbox'
    boxDiv.style.transform = `translate3d(${box.x}px, ${box.y}px, 0)`
    boxDiv.style.width = `${box.width}px`
    boxDiv.style.position = 'absolute'

    const contentDiv = document.createElement('div')
    contentDiv.className = 'textbox-rendered markdown-body'
    contentDiv.style.lineHeight = '32px'
    contentDiv.innerHTML = renderMarkdown(box.content)
    boxDiv.appendChild(contentDiv)
    sheet.appendChild(boxDiv)
  }

  // Render drawings on a canvas (backing × pixelRatio để export sắc,
  // rough.js + seed ổn định → giống hệt màn hình)
  if (page.drawings && page.drawings.length > 0) {
    const S = pixelRatio
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(800 * S)
    canvas.height = Math.round(1100 * S)
    canvas.style.position = 'absolute'
    canvas.style.top = '0'
    canvas.style.left = '0'
    canvas.style.width = '800px'
    canvas.style.height = '1100px'
    canvas.style.zIndex = '4'
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.setTransform(S, 0, 0, S, 0, 0)
      const rc = rough.canvas(canvas)
      for (const elem of page.drawings) {
        const roughOpts: any = {
          stroke: elem.color,
          strokeWidth: elem.strokeWidth,
          roughness: elem.roughness ?? 1.0,
          bowing: 0.8,
          seed: elem.seed || getElementSeed(elem.id),
        }
        if (elem.fillColor && elem.fillColor !== 'transparent') {
          roughOpts.fill = elem.fillColor
          roughOpts.fillStyle = 'solid'
        }
        ctx.save()
        ctx.strokeStyle = elem.color
        ctx.lineWidth = elem.strokeWidth
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        if (elem.type === 'highlighter') {
          ctx.globalAlpha = elem.opacity || 0.35
          ctx.lineWidth = elem.strokeWidth * 3
          drawSmoothStroke(ctx, elem.points)
        } else if (elem.type === 'pen') {
          ctx.globalAlpha = elem.opacity || 1.0
          drawSmoothStroke(ctx, elem.points)
        } else if (elem.type === 'line' && elem.points.length >= 2) {
          const p0 = elem.points[0]
          const p1 = elem.points[elem.points.length - 1]
          rc.line(p0.x, p0.y, p1.x, p1.y, roughOpts)
        } else if (elem.type === 'arrow' && elem.points.length >= 2) {
          const pts = elem.points
          const p0 = pts[0]
          const p1 = pts[pts.length - 1]
          drawArrow(ctx, p0.x, p0.y, p1.x, p1.y)
        } else if (elem.type === 'rect' && elem.x !== undefined && elem.y !== undefined) {
          const rx = (elem.width || 0) < 0 ? elem.x + (elem.width || 0) : elem.x
          const ry = (elem.height || 0) < 0 ? elem.y + (elem.height || 0) : elem.y
          rc.rectangle(rx, ry, Math.abs(elem.width || 0), Math.abs(elem.height || 0), roughOpts)
        } else if (elem.type === 'circle' && elem.x !== undefined && elem.y !== undefined) {
          rc.ellipse(
            elem.x + (elem.width || 0) / 2,
            elem.y + (elem.height || 0) / 2,
            Math.abs((elem.width || 0) / 2),
            Math.abs((elem.height || 0) / 2),
            roughOpts
          )
        }
        ctx.restore()
      }
    }
    sheet.appendChild(canvas)
  }

  // Render pasted images (dataURL/vault URL) đúng tọa độ
  for (const img of page.images ?? []) {
    const el = document.createElement('img')
    el.src = img.src
    el.style.position = 'absolute'
    el.style.left = `${img.x}px`
    el.style.top = `${img.y}px`
    el.style.width = `${img.width}px`
    el.style.height = `${img.height}px`
    el.style.zIndex = '3'
    sheet.appendChild(el)
  }

  // Footer
  const footer = document.createElement('div')
  footer.className = 'notebook-footer'
  footer.innerHTML = `<span class="page-number-label">page ${page.pageNumber}</span>`
  sheet.appendChild(footer)

  offscreenContainer.appendChild(sheet)
  return sheet
}

/** Gỡ node offscreen ngay sau khi chụp để nhẹ DOM/RAM. */
export function cleanupOffscreenPageSheet(element: HTMLElement): void {
  if (element.parentElement && element.parentElement.id.startsWith('offscreen-export-')) {
    element.parentElement.remove()
  }
}
