import React, { useState, useEffect, useRef } from 'react'
import {
  MousePointer, Pen, Highlighter, Eraser, Minus, ArrowUpRight,
  Square, Circle, Type, Lock, Unlock, Plus, ZoomIn, ZoomOut, RotateCcw, RotateCw,
  Maximize, Download, Check, AlignJustify, Grid,
} from 'lucide-react'
import type { ToolType, PaperPattern } from '@/shared/types/notebook'
import type { WidthDef } from '@/shared/lib/tools-config'
import { ColorSwatches } from '@/shared/ui/ColorSwatches'
import { WidthPicker } from '@/shared/ui/WidthPicker'
import { type Language, getT } from './i18n'

interface MiniToolbarProps {
  language?: Language
  activeTool: ToolType
  strokeColor: string
  strokeWidth: number
  isToolLocked: boolean
  canUndo: boolean
  canRedo: boolean
  savedState: 'saved' | 'dirty'
  pattern: PaperPattern
  onChangePattern: (p: PaperPattern) => void
  fontFamily?: string
  onChangeFontFamily?: (font: string) => void
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
  const [showFontMenu, setShowFontMenu] = useState(false)
  const fontMenuRef = useRef<HTMLDivElement>(null)
  const t = getT(p.language || 'en')

  const fontOptions = [
    { value: 'cascadia', label: t.fontCascadia, fontStyle: 'var(--font-cascadia)' },
    { value: 'dfvn-excalidraw', label: t.fontDfvn, fontStyle: 'var(--font-dfvn-excalidraw)' },
    { value: 'handwriting', label: t.fontHandwriting, fontStyle: 'var(--font-handwriting)' },
    { value: 'sans', label: t.fontSans, fontStyle: 'var(--font-sans)' },
    { value: 'serif', label: t.fontSerif, fontStyle: 'var(--font-serif)' },
    { value: 'custom', label: t.fontCustom, fontStyle: 'var(--font-custom)' },
  ]

  useEffect(() => {
    if (!showFontMenu) return
    const onMouseDown = (e: MouseEvent) => {
      if (fontMenuRef.current && !fontMenuRef.current.contains(e.target as Node)) {
        setShowFontMenu(false)
      }
    }
    window.addEventListener('mousedown', onMouseDown)
    return () => window.removeEventListener('mousedown', onMouseDown)
  }, [showFontMenu])

  return (
    <div className="header-center-tools mybook-mini-toolbar">
      {/* 1. BÊN TRÁI: Hoàn tác / Làm lại (Ctrl+Z / Ctrl+Y) & Khóa tool */}
      <div className="mini-toolbar-left-group">
        <button
          type="button"
          className="tool-button"
          title={t.undo}
          disabled={!p.canUndo}
          onClick={p.onUndo}
        >
          <RotateCcw size={15} />
        </button>
        <button
          type="button"
          className="tool-button"
          title={t.redo}
          disabled={!p.canRedo}
          onClick={p.onRedo}
        >
          <RotateCw size={15} />
        </button>
        <div className="tool-divider" />
        <button
          type="button"
          className={`tool-button lock-button ${p.isToolLocked ? 'active locked' : ''}`}
          title={p.isToolLocked ? t.lockToolActive : t.lockToolInactive}
          onClick={p.onToggleLock}
        >
          {p.isToolLocked ? <Lock size={15} /> : <Unlock size={15} />}
        </button>
      </div>

      <div className="tool-divider" />

      {/* 2. CÔNG CỤ VẼ CƠ BẢN */}
      {toolBtn(p.activeTool === 'select', t.toolSelect, () => p.onSelectTool('select'), <MousePointer size={15} />)}
      {toolBtn(p.activeTool === 'rect', t.toolRect, () => p.onSelectTool('rect'), <Square size={15} />)}
      {toolBtn(p.activeTool === 'circle', t.toolCircle, () => p.onSelectTool('circle'), <Circle size={15} />)}
      {toolBtn(p.activeTool === 'arrow', t.toolArrow, () => p.onSelectTool('arrow'), <ArrowUpRight size={15} />)}
      {toolBtn(p.activeTool === 'line', t.toolLine, () => p.onSelectTool('line'), <Minus size={15} />)}
      {toolBtn(p.activeTool === 'pen', t.toolPen, () => p.onSelectTool('pen'), <Pen size={15} />)}
      {toolBtn(p.activeTool === 'highlighter', t.toolHighlighter, () => p.onSelectTool('highlighter'), <Highlighter size={15} />)}
      {toolBtn(p.activeTool === 'text', t.toolText, () => p.onSelectTool('text'), <Type size={15} />)}
      {toolBtn(p.activeTool === 'eraser', t.toolEraser, () => p.onSelectTool('eraser'), <Eraser size={15} />)}

      <div className="tool-divider" />

      {/* 3. BẢNG MÀU & ĐỘ DÀY NÉT */}
      <ColorSwatches value={p.strokeColor} onChange={p.onChangeColor} />
      <WidthPicker value={p.strokeWidth} onChange={p.onChangeWidth} compact widths={WIDTHS} strokeColor={p.strokeColor} />

      <div className="tool-divider" />

      {/* 4. CHUYỂN ĐỔI KIỂU GIẤY (Dòng kẻ ngang / Lưới ô vuông) */}
      <div className="mini-pattern-group" style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
        <button
          type="button"
          className={`tool-button ${p.pattern === 'ruled' ? 'active' : ''}`}
          title={t.ruled}
          onClick={() => p.onChangePattern('ruled')}
        >
          <AlignJustify size={15} />
        </button>
        <button
          type="button"
          className={`tool-button ${p.pattern === 'grid' ? 'active' : ''}`}
          title={t.grid}
          onClick={() => p.onChangePattern('grid')}
        >
          <Grid size={15} />
        </button>

        {p.onChangeFontFamily && (
          <div className="mini-font-popover-wrap">
            <button
              type="button"
              className={`tool-button ${showFontMenu ? 'active' : ''}`}
              title={t.fontBtnTitle}
              onClick={() => setShowFontMenu((v) => !v)}
            >
              <Type size={15} />
            </button>

            {showFontMenu && (
              <div ref={fontMenuRef} className="mini-font-menu-popover">
                <div className="mini-font-menu-title">{t.fontMenuTitle}</div>
                {fontOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`mini-font-menu-item ${p.fontFamily === opt.value ? 'selected' : ''}`}
                    onClick={() => {
                      p.onChangeFontFamily?.(opt.value)
                      setShowFontMenu(false)
                    }}
                  >
                    <span style={{ fontFamily: opt.fontStyle }}>{opt.label}</span>
                    {p.fontFamily === opt.value && <Check size={13} className="mini-font-menu-check" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="tool-divider" />

      {/* 5. BÊN PHẢI: Zoom Capsule + Actions (Thêm trang, PDF) + Autosave Status */}
      <div className="mini-toolbar-right-group">
        <div className="mini-zoom-pill">
          <button
            type="button"
            className="mini-pill-btn"
            title={t.zoomOut}
            onClick={p.onZoomOut}
          >
            <ZoomOut size={13} />
          </button>
          <button
            type="button"
            className="mini-zoom-label"
            title={t.zoomReset}
            onClick={p.onResetZoom}
          >
            {p.zoomLabel}
          </button>
          <button
            type="button"
            className="mini-pill-btn"
            title={t.zoomIn}
            onClick={p.onZoomIn}
          >
            <ZoomIn size={13} />
          </button>
          <div className="mini-pill-divider" />
          <button
            type="button"
            className="mini-pill-btn"
            title={t.fitZoom}
            onClick={p.onFitZoom}
          >
            <Maximize size={13} />
          </button>
        </div>

        <div className="mini-actions-group">
          <button
            type="button"
            className="tool-button"
            title={t.addPage}
            onClick={p.onAddPage}
          >
            <Plus size={15} />
          </button>
          <button
            type="button"
            className="tool-button"
            title={t.exportPdf}
            onClick={p.onExportPdf}
          >
            <Download size={15} />
          </button>
        </div>

        <div
          className={`mini-save-badge status-${p.savedState === 'dirty' ? 'dirty' : 'saved'}`}
          title={p.savedState === 'dirty' ? t.saving : t.saved}
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
