import { useState, useRef, useEffect, memo } from 'react'
import type { ToolType, PaperPattern, ViewSpreadMode } from '@/shared/types/notebook'
import { ColorSwatches } from './ColorSwatches'
import { WidthPicker } from './WidthPicker'
import {
  MousePointer,
  Pen,
  Highlighter,
  Eraser,
  Minus,
  ArrowUpRight,
  Square,
  Circle,
  Type,
  RotateCcw,
  RotateCw,
  Download,
  Plus,
  CheckCircle2,
  CloudUpload,
  FolderOpen,
  ChevronDown,
  Sparkles,
  Lock,
  Unlock,
  Paintbrush,
  BookOpen,
  Settings,
} from 'lucide-react'

interface HeaderToolbarProps {
  activeTool: ToolType
  strokeColor: string
  strokeWidth: number
  paperPattern: PaperPattern
  viewMode: ViewSpreadMode
  flipAnimation: boolean
  fontFamily: string
  canUndo: boolean
  canRedo: boolean
  autosaveStatus: 'saved' | 'saving' | 'dirty'
  hasSelectedElement?: boolean
  isToolLocked?: boolean
  handDrawnStyle?: boolean
  onSelectTool: (tool: ToolType) => void
  onToggleToolLock: () => void
  onToggleHandDrawnStyle: () => void
  onChangeStrokeColor: (color: string) => void
  onChangeStrokeWidth: (width: number) => void
  onChangePaperPattern: (pattern: PaperPattern) => void
  onChangeViewMode: (mode: ViewSpreadMode) => void
  onToggleFlipAnimation: () => void
  onChangeFontFamily: (font: string) => void
  onUndo: () => void
  onRedo: () => void
  onAddPage: () => void
  onOpenExportModal: () => void
  onNewNotebook: () => void
  onExportMarkdown: () => void
  onImportMarkdown: (file: File) => void
  onOpenSettings?: () => void
}

// Màu/nét dùng chung ở shared/lib/tools-config (STROKE_COLORS/STROKE_WIDTHS)
// + components ColorSwatches/WidthPicker — thêm màu mới chỉ sửa 1 chỗ.

export const HeaderToolbar = memo(function HeaderToolbar({
  activeTool,
  strokeColor,
  strokeWidth,
  paperPattern,
  viewMode,
  flipAnimation,
  fontFamily,
  canUndo,
  canRedo,
  autosaveStatus,
  hasSelectedElement: _hasSelectedElement = false,
  isToolLocked = false,
  handDrawnStyle = true,
  onSelectTool,
  onToggleToolLock,
  onToggleHandDrawnStyle,
  onChangeStrokeColor,
  onChangeStrokeWidth,
  onChangePaperPattern,
  onChangeViewMode,
  onToggleFlipAnimation,
  onChangeFontFamily,
  onUndo,
  onRedo,
  onAddPage,
  onOpenExportModal,
  onNewNotebook,
  onExportMarkdown,
  onImportMarkdown,
  onOpenSettings,
}: HeaderToolbarProps) {
  const [showFileMenu, setShowFileMenu] = useState(false)
  const fileMenuRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Close file menu on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (fileMenuRef.current && !fileMenuRef.current.contains(e.target as Node)) {
        setShowFileMenu(false)
      }
    }
    if (showFileMenu) {
      window.addEventListener('mousedown', handleClickOutside)
    }
    return () => window.removeEventListener('mousedown', handleClickOutside)
  }, [showFileMenu])

  const isDrawingOrShape =
    activeTool === 'pen' ||
    activeTool === 'highlighter' ||
    activeTool === 'line' ||
    activeTool === 'arrow' ||
    activeTool === 'rect' ||
    activeTool === 'circle'

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      onImportMarkdown(file)
      e.target.value = ''
    }
  }

  return (
    <header className="app-header">
      {/* Hidden file input for importing Markdown / .excalidraw.md */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".md,.markdown,.excalidraw.md,text/markdown"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* LEFT SECTION: Brand & File Menu (nút sidebar chỉ nằm trên thanh tab) */}
      <div className="header-left">

        {/* File Dropdown Menu */}
        <div className="file-menu-container" ref={fileMenuRef}>
          <button
            type="button"
            className={`file-menu-btn ${showFileMenu ? 'active' : ''}`}
            onClick={() => setShowFileMenu((prev) => !prev)}
            title="File Management (.md / .excalidraw.md)"
          >
            <span>File</span>
            <ChevronDown size={13} />
          </button>

          {showFileMenu && (
            <div className="file-dropdown-menu">
              <button
                type="button"
                className="dropdown-item"
                onClick={() => {
                  setShowFileMenu(false)
                  onNewNotebook()
                }}
              >
                <BookOpen size={15} />
                <span>New Notebook</span>
              </button>

              <button
                type="button"
                className="dropdown-item"
                onClick={() => {
                  setShowFileMenu(false)
                  fileInputRef.current?.click()
                }}
              >
                <FolderOpen size={15} />
                <span>Open File (.md / .mynote.md)</span>
              </button>

              <button
                type="button"
                className="dropdown-item highlight"
                onClick={() => {
                  setShowFileMenu(false)
                  onExportMarkdown()
                }}
              >
                <Download size={15} />
                <span>Save Markdown (.excalidraw.md)</span>
              </button>

              <div className="dropdown-divider" />

              <button
                type="button"
                className="dropdown-item"
                onClick={() => {
                  setShowFileMenu(false)
                  onOpenExportModal()
                }}
              >
                <Download size={15} />
                <span>Export PDF</span>
              </button>
            </div>
          )}
        </div>

        {/* Autosave status indicator */}
        <div className={`autosave-indicator status-${autosaveStatus}`} title="Autosave Status">
          {autosaveStatus === 'saving' ? (
            <>
              <CloudUpload size={13} className="spin-icon" />
              <span className="autosave-label">Saving</span>
            </>
          ) : (
            <>
              <CheckCircle2 size={13} />
              <span className="autosave-label">Saved</span>
            </>
          )}
        </div>
      </div>

      {/* CENTER SECTION: Excalidraw Toolbar with Tool Lock & Number Shortcuts */}
      <div className="header-center-tools">
        {/* Tool Lock Button (Q) */}
        <button
          type="button"
          className={`tool-button lock-button ${isToolLocked ? 'active locked' : ''}`}
          onClick={onToggleToolLock}
          title={`Tool Lock (Q) — ${isToolLocked ? 'Locked (stays on current tool)' : 'Unlocked (auto-switches to select after drawing)'}`}
        >
          {isToolLocked ? <Lock size={15} /> : <Unlock size={15} />}
          <span className="tool-shortcut-badge">Q</span>
        </button>

        <div className="tool-divider" />

        {/* 1: Selection (1 or V) */}
        <button
          type="button"
          className={`tool-button ${activeTool === 'select' ? 'active' : ''}`}
          onClick={() => onSelectTool('select')}
          title="Select & Edit (1 or V)"
        >
          <MousePointer size={16} />
          <span className="tool-shortcut-badge">1</span>
        </button>

        {/* 2: Rectangle (2 or R) */}
        <button
          type="button"
          className={`tool-button ${activeTool === 'rect' ? 'active' : ''}`}
          onClick={() => onSelectTool('rect')}
          title="Rectangle (2 or R)"
        >
          <Square size={16} />
          <span className="tool-shortcut-badge">2</span>
        </button>

        {/* 3: Circle / Ellipse (3 or C) */}
        <button
          type="button"
          className={`tool-button ${activeTool === 'circle' ? 'active' : ''}`}
          onClick={() => onSelectTool('circle')}
          title="Circle / Ellipse (3 or C)"
        >
          <Circle size={16} />
          <span className="tool-shortcut-badge">3</span>
        </button>

        {/* 4: Arrow with Curvature (4 or A) */}
        <button
          type="button"
          className={`tool-button ${activeTool === 'arrow' ? 'active' : ''}`}
          onClick={() => onSelectTool('arrow')}
          title="Curved / Straight Arrow (4 or A)"
        >
          <ArrowUpRight size={16} />
          <span className="tool-shortcut-badge">4</span>
        </button>

        {/* 5: Line (5 or L) */}
        <button
          type="button"
          className={`tool-button ${activeTool === 'line' ? 'active' : ''}`}
          onClick={() => onSelectTool('line')}
          title="Line (5 or L)"
        >
          <Minus size={16} />
          <span className="tool-shortcut-badge">5</span>
        </button>

        {/* 6: Pen (6 or P) */}
        <button
          type="button"
          className={`tool-button ${activeTool === 'pen' ? 'active' : ''}`}
          onClick={() => onSelectTool('pen')}
          title="Freehand Ink Pen (6 or P)"
        >
          <Pen size={16} />
          <span className="tool-shortcut-badge">6</span>
        </button>

        {/* 7: Text (7 or T) */}
        <button
          type="button"
          className={`tool-button ${activeTool === 'text' ? 'active' : ''}`}
          onClick={() => onSelectTool('text')}
          title="Markdown Text Box (7 or T)"
        >
          <Type size={16} />
          <span className="tool-shortcut-badge">7</span>
        </button>

        {/* 8: Eraser (8 or E) */}
        <button
          type="button"
          className={`tool-button ${activeTool === 'eraser' ? 'active' : ''}`}
          onClick={() => onSelectTool('eraser')}
          title="Eraser (8 or E)"
        >
          <Eraser size={16} />
          <span className="tool-shortcut-badge">8</span>
        </button>

        {/* 9: Highlighter (9 or H) */}
        <button
          type="button"
          className={`tool-button ${activeTool === 'highlighter' ? 'active' : ''}`}
          onClick={() => onSelectTool('highlighter')}
          title="Highlighter (9 or H)"
        >
          <Highlighter size={16} />
          <span className="tool-shortcut-badge">9</span>
        </button>
      </div>

      {/* RIGHT SECTION: Styles, Hand-drawn Toggle, View Modes, Pagination, Undo/Redo & Actions */}
      <div className="header-right">
        {/* Stroke Colors & Width Levels (dùng chung tools-config) */}
        {isDrawingOrShape && (
          <div className="stroke-controls-pill">
            <ColorSwatches value={strokeColor} onChange={onChangeStrokeColor} />
            <WidthPicker value={strokeWidth} onChange={onChangeStrokeWidth} />
          </div>
        )}

        {/* Hand-drawn vs Clean Mode Toggle */}
        <button
          type="button"
          className={`handdrawn-toggle-btn ${handDrawnStyle ? 'active' : ''}`}
          onClick={onToggleHandDrawnStyle}
          title={handDrawnStyle ? 'Chế độ vẽ tay (Rough)' : 'Chế độ hình học phẳng (Clean)'}
        >
          <Paintbrush size={13} />
          <span>{handDrawnStyle ? 'Rough' : 'Clean'}</span>
        </button>

        {/* Paper Rule Pattern */}
        <select
          className="compact-select pattern-select"
          value={paperPattern}
          onChange={(e) => onChangePaperPattern(e.target.value as PaperPattern)}
          title="Dòng kẻ vở (Paper Pattern)"
        >
          <option value="ruled">Kẻ ngang</option>
          <option value="grid">Ô vuông</option>
          <option value="dots">Chấm bi</option>
          <option value="blank">Trơn</option>
        </select>

        {/* Font Family */}
        <select
          className="compact-select font-select"
          value={fontFamily}
          onChange={(e) => onChangeFontFamily(e.target.value)}
          title="Font chữ vở viết"
        >
          <option value="cascadia">Cascadia</option>
          <option value="dfvn-excalidraw">DFVN Excalidraw</option>
          <option value="handwriting">Chữ viết tay</option>
          <option value="sans">Sans</option>
          <option value="mono">Mono</option>
          <option value="serif">Serif</option>
          <option value="custom">Tùy chọn (Custom)</option>
        </select>

        {/* View Mode Dropdown */}
        <select
          className="compact-select view-mode-select"
          value={viewMode}
          onChange={(e) => onChangeViewMode(e.target.value as ViewSpreadMode)}
          title="Chế độ xem trang (View Mode)"
        >
          <option value="spread">2 Trang</option>
          <option value="single-horizontal">1 Trang Ngang</option>
          <option value="single-vertical">1 Trang Dọc</option>
        </select>

        {/* 3D Flip Animation Toggle */}
        {viewMode === 'spread' && (
          <button
            type="button"
            className={`compact-icon-btn flip-toggle-btn ${flipAnimation ? 'active' : ''}`}
            onClick={onToggleFlipAnimation}
            title={flipAnimation ? 'Hiệu ứng lật 3D: Đang BẬT' : 'Hiệu ứng lật 3D: Đang TẮT'}
          >
            <Sparkles size={14} />
            <span className="btn-label-text">{flipAnimation ? 'Lật' : 'Tĩnh'}</span>
          </button>
        )}

        {/* Undo / Redo Segmented */}
        <div className="header-undo-redo-group" title="Hoàn tác / Làm lại (Ctrl+Z / Ctrl+Y)">
          <button
            type="button"
            className="undo-redo-btn"
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
          >
            <RotateCcw size={13} />
          </button>
          <div className="undo-redo-sep" />
          <button
            type="button"
            className="undo-redo-btn"
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
          >
            <RotateCw size={13} />
          </button>
        </div>

        {/* Add Page Button */}
        <button
          type="button"
          className="header-action-btn add-page-btn"
          onClick={onAddPage}
          title="Add New Page (Thêm trang mới)"
        >
          <Plus size={14} />
          <span>Trang</span>
        </button>

        {/* Export PDF Button */}
        <button
          type="button"
          className="header-action-btn icon-only"
          onClick={onOpenExportModal}
          title="Export to PDF (Xuất PDF)"
        >
          <Download size={14} />
        </button>

        {/* Settings & Shortcuts Button */}
        {onOpenSettings && (
          <button
            type="button"
            className="header-action-btn icon-only settings-btn"
            onClick={onOpenSettings}
            title="Settings & Shortcuts [Ctrl+,]"
          >
            <Settings size={14} />
          </button>
        )}
      </div>
    </header>
  )
})
