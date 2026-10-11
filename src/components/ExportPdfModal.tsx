import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { ExportResolution, PageData } from '../types/notebook'
import { Download, FileText, Loader2, X } from 'lucide-react'
import { exportNotebookPagesToPdf, type PdfExportProgress } from '../services/pdfExport'
import { renderMarkdown } from '../utils/markdown'
import { drawSmoothStroke, drawArrow } from '../utils/smoothing'

interface ExportPdfModalProps {
  isOpen?: boolean
  pages: PageData[]
  currentPage?: PageData
  notebookTitle?: string
  onClose: () => void
}

export function ExportPdfModal({
  isOpen = true,
  pages,
  currentPage,
  notebookTitle: _notebookTitle,
  onClose,
}: ExportPdfModalProps) {
  const activePage = currentPage || pages[0]
  const [resolution, setResolution] = useState<ExportResolution>('medium')
  const [rangeMode, setRangeMode] = useState<'all' | 'current'>('all')
  const [isExporting, setIsExporting] = useState(false)
  const [progress, setProgress] = useState<PdfExportProgress | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  if (!isOpen) return null

  const handleStartExport = async () => {
    setIsExporting(true)
    setErrorMessage(null)

    const targetPages = rangeMode === 'all' ? pages : [activePage]

    try {
      await exportNotebookPagesToPdf(
        targetPages,
        async (page) => {
          // Check if the page is currently mounted in the DOM
          const existing = document.getElementById(`page-sheet-${page.id}`)
          if (existing) {
            return existing
          }

          // Otherwise temporarily mount an offscreen clone
          const offscreenContainer = document.createElement('div')
          offscreenContainer.id = `offscreen-export-${page.id}`
          offscreenContainer.style.position = 'fixed'
          offscreenContainer.style.top = '-9999px'
          offscreenContainer.style.left = '-9999px'
          offscreenContainer.style.zIndex = '-1000'
          document.body.appendChild(offscreenContainer)

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

          // Render drawings on a canvas
          if (page.drawings && page.drawings.length > 0) {
            const canvas = document.createElement('canvas')
            canvas.width = 800
            canvas.height = 1100
            canvas.style.position = 'absolute'
            canvas.style.top = '0'
            canvas.style.left = '0'
            canvas.style.zIndex = '4'
            const ctx = canvas.getContext('2d')
            if (ctx) {
              for (const elem of page.drawings) {
                ctx.save()
                ctx.strokeStyle = elem.color
                ctx.lineWidth = elem.strokeWidth
                ctx.lineCap = 'round'
                ctx.lineJoin = 'round'
                if (elem.type === 'highlighter') {
                  ctx.globalAlpha = elem.opacity || 0.35
                  ctx.lineWidth = elem.strokeWidth * 3
                }
                if (elem.type === 'pen' || elem.type === 'highlighter') {
                  drawSmoothStroke(ctx, elem.points)
                } else if (elem.type === 'line' && elem.points.length >= 2) {
                  ctx.beginPath()
                  ctx.moveTo(elem.points[0].x, elem.points[0].y)
                  ctx.lineTo(elem.points[1].x, elem.points[1].y)
                  ctx.stroke()
                } else if (elem.type === 'arrow' && elem.points.length >= 2) {
                  drawArrow(ctx, elem.points[0].x, elem.points[0].y, elem.points[1].x, elem.points[1].y)
                } else if (elem.type === 'rect' && elem.x !== undefined && elem.y !== undefined) {
                  ctx.strokeRect(elem.x, elem.y, elem.width || 0, elem.height || 0)
                } else if (elem.type === 'circle' && elem.x !== undefined && elem.y !== undefined) {
                  ctx.beginPath()
                  ctx.ellipse(
                    elem.x + (elem.width || 0) / 2,
                    elem.y + (elem.height || 0) / 2,
                    Math.abs((elem.width || 0) / 2),
                    Math.abs((elem.height || 0) / 2),
                    0,
                    0,
                    Math.PI * 2
                  )
                  ctx.stroke()
                }
                ctx.restore()
              }
            }
            sheet.appendChild(canvas)
          }

          // Footer
          const footer = document.createElement('div')
          footer.className = 'notebook-footer'
          footer.innerHTML = `<span class="page-number-label">page ${page.pageNumber}</span>`
          sheet.appendChild(footer)

          offscreenContainer.appendChild(sheet)
          return sheet
        },
        (element) => {
          // Cleanup offscreen element
          if (element.parentElement && element.parentElement.id.startsWith('offscreen-export-')) {
            element.parentElement.remove()
          }
        },
        resolution,
        (p) => setProgress(p)
      )

      setIsExporting(false)
      onClose()
    } catch (err: any) {
      console.error('PDF export error:', err)
      setErrorMessage(err?.message || 'Failed to export PDF.')
      setIsExporting(false)
    }
  }

  const percent = progress ? Math.round((progress.current / progress.total) * 100) : 0

  return createPortal(
    <div className="modal-backdrop" onClick={!isExporting ? onClose : undefined}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-group">
            <FileText size={20} className="modal-icon" />
            <h3>Export Notebook to PDF</h3>
          </div>
          {!isExporting && (
            <button type="button" className="modal-close-btn" onClick={onClose}>
              <X size={18} />
            </button>
          )}
        </div>

        <div className="modal-body">
          {isExporting ? (
            <div className="export-progress-container">
              <Loader2 size={36} className="spin-loader" />
              <h4>{progress?.status || 'Exporting notebook...'}</h4>
              <p className="progress-subtext">
                Pages are exported sequentially one by one to prevent browser memory spikes.
              </p>

              <div className="progress-bar-track">
                <div className="progress-bar-fill" style={{ width: `${percent}%` }} />
              </div>
              <span className="progress-percent">{percent}%</span>
            </div>
          ) : (
            <>
              {errorMessage && <div className="export-error-banner">{errorMessage}</div>}

              {/* Resolution options */}
              <div className="export-section">
                <label className="section-label">Export Resolution & Quality</label>
                <div className="resolution-options">
                  <button
                    type="button"
                    className={`res-btn ${resolution === 'low' ? 'selected' : ''}`}
                    onClick={() => setResolution('low')}
                  >
                    <strong>Low (72 DPI)</strong>
                    <span>Smallest file, instant</span>
                  </button>

                  <button
                    type="button"
                    className={`res-btn ${resolution === 'medium' ? 'selected' : ''}`}
                    onClick={() => setResolution('medium')}
                  >
                    <strong>Medium (150 DPI)</strong>
                    <span>Recommended & sharp</span>
                  </button>

                  <button
                    type="button"
                    className={`res-btn ${resolution === 'high' ? 'selected' : ''}`}
                    onClick={() => setResolution('high')}
                  >
                    <strong>High (300 DPI)</strong>
                    <span>Ultra-crisp print quality</span>
                  </button>
                </div>
              </div>

              {/* Range options */}
              <div className="export-section">
                <label className="section-label">Pages to Export</label>
                <div className="range-options">
                  <label className="radio-label">
                    <input
                      type="radio"
                      name="range"
                      checked={rangeMode === 'all'}
                      onChange={() => setRangeMode('all')}
                    />
                    <span>All Pages ({pages.length} total)</span>
                  </label>

                  <label className="radio-label">
                    <input
                      type="radio"
                      name="range"
                      checked={rangeMode === 'current'}
                      onChange={() => setRangeMode('current')}
                    />
                    <span>Current Page only (Page {activePage?.pageNumber || 1})</span>
                  </label>
                </div>
              </div>
            </>
          )}
        </div>

        {!isExporting && (
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={handleStartExport}>
              <Download size={16} />
              <span>Generate PDF</span>
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
