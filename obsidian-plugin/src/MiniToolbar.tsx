import {
  MousePointer, Pen, Highlighter, Eraser, Minus, ArrowUpRight,
  Square, Circle, Type, Lock, Unlock, Plus, ZoomIn, ZoomOut, RotateCcw, RotateCw,
  Maximize, Download,
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
  onFitZoom: () => void
  onAddPage: () => void
  onExportPdf: () => void
}

/** Nấc nét riêng của plugin (giữ nguyên UX cũ) — map sang WidthDef để dùng chung WidthPicker */
const WIDTHS: WidthDef[] = [1, 2, 4, 6, 10].map((w) => ({ label: `${w}`, value: w, title: `${w}px` }))

function toolBtn(
  active: boolean,
  title: string,
  onClick: () => void,
  children: React.ReactNode
) {
  return (
    <button
      key={title}
      type="button"
      className={`tool-button ${active ? 'active' : ''}`}
      title={title}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

/** Toolbar gọn cho plugin: tool vẽ + màu + nét + undo + zoom + thêm trang */
export function MiniToolbar(p: MiniToolbarProps) {
  return (
    <div className="header-center-tools mybook-mini-toolbar">
      {toolBtn(false, 'Khóa công cụ (giữ tool sau khi vẽ)', p.onToggleLock, p.isToolLocked ? <Lock size={14} /> : <Unlock size={14} />)}
      <div className="tool-divider" />
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
      <ColorSwatches value={p.strokeColor} onChange={p.onChangeColor} />
      <WidthPicker value={p.strokeWidth} onChange={p.onChangeWidth} compact widths={WIDTHS} />
      <div className="tool-divider" />
      <button type="button" className="undo-redo-btn" title="Hoàn tác (Ctrl+Z)" disabled={!p.canUndo} onClick={p.onUndo}>
        <RotateCcw size={13} />
      </button>
      <button type="button" className="undo-redo-btn" title="Làm lại (Ctrl+Y)" disabled={!p.canRedo} onClick={p.onRedo}>
        <RotateCw size={13} />
      </button>
      <div className="tool-divider" />
      <button type="button" className="undo-redo-btn" title="Thu nhỏ" onClick={p.onZoomOut}>
        <ZoomOut size={13} />
      </button>
      <span className="zoom-label" title="Mức zoom hiện tại">
        {p.zoomLabel}
      </span>
      <button type="button" className="undo-redo-btn" title="Phóng to" onClick={p.onZoomIn}>
        <ZoomIn size={13} />
      </button>
      <button type="button" className="undo-redo-btn" title="Fit vừa khung xem" onClick={p.onFitZoom}>
        <Maximize size={13} />
      </button>
      <button type="button" className="undo-redo-btn" title="Thêm trang" onClick={p.onAddPage}>
        <Plus size={13} />
      </button>
      <button type="button" className="undo-redo-btn" title="Xuất vở ra PDF" onClick={p.onExportPdf}>
        <Download size={13} />
      </button>
      <span className={`autosave-indicator status-${p.savedState === 'dirty' ? 'dirty' : 'saved'}`}>
        {p.savedState === 'dirty' ? '●' : '✓'}
      </span>
    </div>
  )
}
