import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { ExportResolution, PageData } from '@/shared/types/notebook'
import { Download, FileText, Loader2, X } from 'lucide-react'
import {
  exportNotebookPagesToPdf,
  renderNotebookPdf,
  type PdfExportProgress,
} from '@/services/pdfExport'
import { renderOffscreenPageSheet, cleanupOffscreenPageSheet } from '@/services/exportPageRender'

interface ExportPdfModalProps {
  isOpen?: boolean
  pages: PageData[]
  currentPage?: PageData
  notebookTitle?: string
  onClose: () => void
  /** Nơi portal modal. Web: document.body. Plugin: element host (CSS scope). */
  portalTarget?: HTMLElement
  /** Nơi gắn node offscreen khi chụp. Plugin truyền host để style áp đúng. */
  mountRoot?: HTMLElement
  /** Tên file gợi ý (plugin: "<tên vở>.pdf"). Web: tự sinh theo timestamp. */
  filename?: string
  /**
   * Host tự lưu bytes PDF. Có → render + gọi callback (plugin lưu vào vault).
   * Không → render + tải về (web giữ nguyên UX cũ).
   */
  onSavePdf?: (data: ArrayBuffer, filename: string) => Promise<void>
}

export function ExportPdfModal({
  isOpen = true,
  pages,
  currentPage,
  notebookTitle: _notebookTitle,
  onClose,
  portalTarget,
  mountRoot,
  filename,
  onSavePdf,
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
    // Offscreen render dùng chung service (web + plugin): node gắn vào mountRoot
    // để CSS áp đúng (plugin scope dưới host), canvas backing theo resolution.
    const pixelRatioMap: Record<ExportResolution, number> = {
      low: 1.0,
      medium: 1.5,
      high: 2.0,
    }
    const renderPage = (page: PageData) =>
      renderOffscreenPageSheet(page, {
        pixelRatio: pixelRatioMap[resolution] || 1.5,
        mountRoot,
      })

    try {
      if (onSavePdf) {
        const { data, filename: name } = await renderNotebookPdf(
          targetPages,
          renderPage,
          cleanupOffscreenPageSheet,
          resolution,
          (p) => setProgress(p),
          filename
        )
        await onSavePdf(data, name)
      } else {
        await exportNotebookPagesToPdf(
          targetPages,
          renderPage,
          cleanupOffscreenPageSheet,
          resolution,
          (p) => setProgress(p),
          filename
        )
      }

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
    portalTarget ?? document.body
  )
}
