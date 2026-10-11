import type { ToolType } from '@/shared/types/notebook'

/**
 * Config dùng chung cho toolbar vẽ: app (HeaderToolbar) + plugin (MiniToolbar).
 * Tách ra để thêm tool/màu mới chỉ sửa 1 chỗ (xem REFACTOR_HANDOFF §3.2).
 */

export interface ToolDef {
  tool: ToolType
  shortcutBadge: string
  title: string
}

/** Thứ tự tool chuẩn Excalidraw-like: select → shapes → pen/text/eraser/highlighter */
export const DRAW_TOOLS: ToolDef[] = [
  { tool: 'select', shortcutBadge: '1', title: 'Select & Edit (1 or V)' },
  { tool: 'rect', shortcutBadge: '2', title: 'Rectangle (2 or R)' },
  { tool: 'circle', shortcutBadge: '3', title: 'Circle / Ellipse (3 or C)' },
  { tool: 'arrow', shortcutBadge: '4', title: 'Curved / Straight Arrow (4 or A)' },
  { tool: 'line', shortcutBadge: '5', title: 'Line (5 or L)' },
  { tool: 'pen', shortcutBadge: '6', title: 'Freehand Ink Pen (6 or P)' },
  { tool: 'text', shortcutBadge: '7', title: 'Markdown Text Box (7 or T)' },
  { tool: 'eraser', shortcutBadge: '8', title: 'Eraser (8 or E)' },
  { tool: 'highlighter', shortcutBadge: '9', title: 'Highlighter (9 or H)' },
]

export interface ColorDef {
  label: string
  value: string
}

export const STROKE_COLORS: ColorDef[] = [
  { label: 'Ink Black', value: '#1e293b' },
  { label: 'Royal Blue', value: '#2563eb' },
  { label: 'Crimson Red', value: '#dc2626' },
  { label: 'Forest Green', value: '#16a34a' },
  { label: 'Purple Violet', value: '#7c3aed' },
  { label: 'Highlighter Yellow', value: '#eab308' },
]

export interface WidthDef {
  label: string
  value: number
  title: string
}

export const STROKE_WIDTHS: WidthDef[] = [
  { label: '1', value: 1, title: 'Rất mảnh (1px)' },
  { label: '2', value: 1.4, title: 'Siêu mảnh (1.4px)' },
  { label: '3', value: 2.8, title: 'Mảnh (2.8px)' },
  { label: '4', value: 5, title: 'Vừa (5px)' },
  { label: '5', value: 8, title: 'Đậm (8px)' },
  { label: '6', value: 12, title: 'Siêu đậm (12px)' },
]

/** Bản gọn cho plugin (chỉ value, không label) — map từ cùng 1 nguồn màu. */
export const STROKE_COLOR_VALUES = STROKE_COLORS.map((c) => c.value)
