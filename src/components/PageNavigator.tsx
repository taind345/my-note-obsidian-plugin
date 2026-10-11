import { useState } from 'react'
import type { PageData, ViewSpreadMode } from '../types/notebook'
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  ZoomIn,
  ZoomOut,
  Layers,
} from 'lucide-react'

interface PageNavigatorProps {
  pages: PageData[]
  currentPageIndex: number
  viewMode: ViewSpreadMode
  zoom: number
  onNavigatePage: (index: number) => void
  onAddPage: () => void
  onDeleteCurrentPage: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onZoomReset: () => void
}

export function PageNavigator({
  pages,
  currentPageIndex,
  viewMode,
  zoom,
  onNavigatePage,
  onAddPage,
  onDeleteCurrentPage,
  onZoomIn,
  onZoomOut,
  onZoomReset,
}: PageNavigatorProps) {
  const [showThumbnails, setShowThumbnails] = useState(false)

  const totalPages = pages.length
  const baseIndex =
    viewMode === 'spread' ? Math.floor(currentPageIndex / 2) * 2 : currentPageIndex

  const canPrev = baseIndex > 0
  const canNext =
    viewMode === 'spread'
      ? baseIndex + 2 < totalPages
      : currentPageIndex + 1 < totalPages

  const handlePrev = () => {
    if (canPrev) {
      onNavigatePage(viewMode === 'spread' ? Math.max(0, baseIndex - 2) : Math.max(0, currentPageIndex - 1))
    }
  }

  const handleNext = () => {
    if (canNext) {
      onNavigatePage(viewMode === 'spread' ? baseIndex + 2 : currentPageIndex + 1)
    }
  }

  const pageLabel =
    viewMode === 'spread'
      ? totalPages > baseIndex + 1
        ? `Pages ${baseIndex + 1}–${baseIndex + 2} of ${totalPages}`
        : `Page ${baseIndex + 1} of ${totalPages}`
      : `Page ${currentPageIndex + 1} of ${totalPages}`

  return (
    <>
      {/* Expandable Virtualized Thumbnail Drawer */}
      {showThumbnails && (
        <div className="page-thumbnail-drawer" onClick={(e) => e.stopPropagation()}>
          <div className="thumbnail-header">
            <h4>Notebook Pages ({totalPages})</h4>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                type="button"
                className="add-page-btn"
                style={{ padding: '3px 8px', fontSize: '11px' }}
                onClick={() => {
                  onAddPage()
                }}
              >
                <Plus size={13} />
                <span>Add Page</span>
              </button>
              <button
                type="button"
                className="close-drawer-btn"
                onClick={() => setShowThumbnails(false)}
              >
                ✕
              </button>
            </div>
          </div>

          <div className="thumbnail-list">
            {pages.map((p, idx) => {
              const isSelected =
                viewMode === 'spread'
                  ? idx === currentPageIndex || idx === currentPageIndex + 1
                  : idx === currentPageIndex

              return (
                <div
                  key={p.id}
                  className={`thumbnail-card ${isSelected ? 'active-card' : ''}`}
                  onClick={() => {
                    onNavigatePage(idx)
                    setShowThumbnails(false)
                  }}
                >
                  <div className="thumbnail-sheet-preview">
                    <span className="thumb-lines" />
                    <span className="thumb-counter">
                      {p.textBoxes.length} texts · {p.drawings.length} strokes
                    </span>
                  </div>
                  <div className="thumbnail-label">Page {p.pageNumber}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Floating Bottom Navigation Bar */}
      <footer className="page-navigator-bar">
        {/* Left: Zoom Controls matching mockup */}
        <div className="nav-zoom-controls">
          <button
            type="button"
            className="nav-icon-btn"
            onClick={onZoomOut}
            title="Zoom Out (-)"
          >
            <ZoomOut size={16} />
          </button>

          <button
            type="button"
            className="zoom-percent-btn"
            onClick={onZoomReset}
            title="Reset Zoom to 100%"
          >
            {Math.round(zoom * 100)}%
          </button>

          <button
            type="button"
            className="nav-icon-btn"
            onClick={onZoomIn}
            title="Zoom In (+)"
          >
            <ZoomIn size={16} />
          </button>
        </div>

        {/* Center: Flip Page controls */}
        <div className="nav-page-controls">
          <button
            type="button"
            className="nav-page-btn"
            disabled={!canPrev}
            onClick={handlePrev}
            title="Previous Page (Left Arrow)"
          >
            <ChevronLeft size={18} />
          </button>

          <span className="nav-page-text">{pageLabel}</span>

          <button
            type="button"
            className="nav-page-btn"
            disabled={!canNext}
            onClick={handleNext}
            title="Next Page (Right Arrow)"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Right: Quick actions (thumbnails, delete page) */}
        <div className="nav-right-actions">
          <button
            type="button"
            className={`nav-icon-btn ${showThumbnails ? 'active' : ''}`}
            onClick={() => setShowThumbnails((v) => !v)}
            title="All Pages Overview"
          >
            <Layers size={16} />
          </button>

          {totalPages > 1 && (
            <button
              type="button"
              className="nav-icon-btn danger"
              onClick={onDeleteCurrentPage}
              title="Delete Current Page"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </footer>
    </>
  )
}
