import React from 'react'
import {
  MousePointer, Pen, Highlighter, Eraser, Minus, ArrowUpRight,
  Square, Circle, Type, Lock, Unlock, Plus, ZoomIn, ZoomOut, RotateCcw, RotateCw,
  Maximize, Download, Check,
} from 'lucide-react'
import type { ToolType } from '@/shared/types/notebook'
import type { WidthDef } from '@/shared/lib/tools-config'
import { ColorSwatches } from '@/shared/ui/ColorSwatches'
import { WidthPicker } from '@/shared/ui/WidthPicker'

interface MiniToolbarProps {
  activeTool: ToolType
  strokeColor: string
  strokeWidth: number
  isToolLocked: boolean
  canUndo: boolean
  canRedo: boolean
  savedState: 'saved' | 'dirty'
  onSelectTool: (t: ToolType) => void
  onToggleLock: () => void
  onChangeColor: (c: string) => void
  onChangeWidth: (w: number) => void
  onUndo: () => void
  onRedo: () => void
  zoomLabel: string
  onZoomIn: () => void
  onZoomOut: () => void
  onResetZoom?: () => void
  onFitZoom: () => void
  onAddPage: () => void
  onExportPdf: () => void
}

/** Nấc nét riêng của plugin — ngòi 2 và ngòi 3 giảm còn 70% (2px -> 1.4px, 4px -> 2.8px) */
const WIDTHS: WidthDef[] = [
  { label: '1', value: 1, title: '1px' },
  { label: '1.4', value: 1.4, title: '1.4px' },
  { label: '2.8', value: 2.8, title: '2.8px' },
  { label: '6', value: 6, title: '6px' },
  { label: '10', value: 10, title: '10px' },
]

function toolBtn(
  active: boolean,
  title: string,
  onClick: () => void,
  children: React.ReactNode,
  className = ''
) {
  return (
    <button
      key={title}
      type="button"
      className={`tool-button ${active ? 'active' : ''} ${className}`.trim()}
      title={title}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

/** Toolbar gọn cho plugin: Undo/Redo + Lock bên trái, tools + color ở giữa, Zoom capsule + actions bên phải */
export function MiniToolbar(p: MiniToolbarProps) {
  return (
    <div className="header-center-tools mybook-mini-toolbar">
      {/* 1. BÊN TRÁI: Hoàn tác / Làm lại (Ctrl+Z / Ctrl+Y) & Khóa tool */}
      <div className="mini-toolbar-left-group">
        <button
          type="button"
          className="tool-button"
          title="Hoàn tác (Ctrl+Z)"
          disabled={!p.canUndo}
          onClick={p.onUndo}
        >
          <RotateCcw size={15} />
        </button>
        <button
          type="button"
          className="tool-button"
          title="Làm lại (Ctrl+Y)"
          disabled={!p.canRedo}
          onClick={p.onRedo}
        >
          <RotateCw size={15} />
        </button>
        <div className="tool-divider" />
        <button
          type="button"
          className={`tool-button lock-button ${p.isToolLocked ? 'active locked' : ''}`}
          title={p.isToolLocked ? 'Mở khóa công cụ (Q)' : 'Khóa công cụ (giữ tool sau khi vẽ) (Q)'}
          onClick={p.onToggleLock}
        >
          {p.isToolLocked ? <Lock size={15} /> : <Unlock size={15} />}
        </button>
      </div>

      <div className="tool-divider" />

      {/* 2. CÔNG CỤ VẼ CƠ BẢN */}
      {toolBtn(p.activeTool === 'select', 'Chọn / di chuyển (1)', () => p.onSelectTool('select'), <MousePointer size={15} />)}
      {toolBtn(p.activeTool === 'rect', 'Hình chữ nhật (2)', () => p.onSelectTool('rect'), <Square size={15} />)}
      {toolBtn(p.activeTool === 'circle', 'Hình tròn (3)', () => p.onSelectTool('circle'), <Circle size={15} />)}
      {toolBtn(p.activeTool === 'arrow', 'Mũi tên (4)', () => p.onSelectTool('arrow'), <ArrowUpRight size={15} />)}
      {toolBtn(p.activeTool === 'line', 'Đoạn thẳng (5)', () => p.onSelectTool('line'), <Minus size={15} />)}
      {toolBtn(p.activeTool === 'pen', 'Bút viết (6)', () => p.onSelectTool('pen'), <Pen size={15} />)}
      {toolBtn(p.activeTool === 'highlighter', 'Bút dạ quang (7)', () => p.onSelectTool('highlighter'), <Highlighter size={15} />)}
      {toolBtn(p.activeTool === 'text', 'Hộp chữ (8)', () => p.onSelectTool('text'), <Type size={15} />)}
      {toolBtn(p.activeTool === 'eraser', 'Tẩy (9)', () => p.onSelectTool('eraser'), <Eraser size={15} />)}

      <div className="tool-divider" />

      {/* 3. BẢNG MÀU & ĐỘ DÀY NÉT */}
      <ColorSwatches value={p.strokeColor} onChange={p.onChangeColor} />
      <WidthPicker value={p.strokeWidth} onChange={p.onChangeWidth} compact widths={WIDTHS} strokeColor={p.strokeColor} />

      <div className="tool-divider" />

      {/* 4. BÊN PHẢI: Zoom Capsule + Actions (Thêm trang, PDF) + Autosave Status */}
      <div className="mini-toolbar-right-group">
        <div className="mini-zoom-pill">
          <button
            type="button"
            className="mini-pill-btn"
            title="Thu nhỏ"
            onClick={p.onZoomOut}
          >
            <ZoomOut size={13} />
          </button>
          <button
            type="button"
            className="mini-zoom-label"
            title="Mức zoom hiện tại (Click để đặt lại 100%)"
            onClick={p.onResetZoom}
          >
            {p.zoomLabel}
          </button>
          <button
            type="button"
            className="mini-pill-btn"
            title="Phóng to"
            onClick={p.onZoomIn}
          >
            <ZoomIn size={13} />
          </button>
          <div className="mini-pill-divider" />
          <button
            type="button"
            className="mini-pill-btn"
            title="Fit vừa khung xem"
            onClick={p.onFitZoom}
          >
            <Maximize size={13} />
          </button>
        </div>

        <div className="mini-actions-group">
          <button
            type="button"
            className="tool-button"
            title="Thêm trang mới"
            onClick={p.onAddPage}
          >
            <Plus size={15} />
          </button>
          <button
            type="button"
            className="tool-button"
            title="Xuất vở ra PDF"
            onClick={p.onExportPdf}
          >
            <Download size={15} />
          </button>
        </div>

        <div
          className={`mini-save-badge status-${p.savedState === 'dirty' ? 'dirty' : 'saved'}`}
          title={p.savedState === 'dirty' ? 'Đang có thay đổi (chờ tự động lưu...)' : 'Đã lưu vào file'}
        >
          {p.savedState === 'dirty' ? (
            <span className="mini-save-dot">●</span>
          ) : (
            <Check size={12} strokeWidth={2.6} />
          )}
        </div>
      </div>
    </div>
  )
}
