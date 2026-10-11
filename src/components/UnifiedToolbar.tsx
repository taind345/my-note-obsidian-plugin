import {
  Bold, Italic, Underline, Strikethrough, List, ListOrdered, Quote,
  Code, Link, Image, Highlighter, AlignLeft, AlignCenter, AlignRight,
  Undo, Redo, Eraser, Minus, CheckSquare, Table, Sigma, Braces, AtSign,
} from 'lucide-react'

/** Tập thao tác soạn thảo thống nhất cho cả Live (markdown) và Simple (WYSIWYG) */
export type UnifiedAction =
  | 'undo' | 'redo'
  | 'h1' | 'h2' | 'h3' | 'paragraph'
  | 'bold' | 'italic' | 'underline' | 'strike' | 'highlight' | 'textColor'
  | 'alignLeft' | 'alignCenter' | 'alignRight'
  | 'bullet' | 'number' | 'task' | 'quote' | 'codeblock' | 'code'
  | 'link' | 'image' | 'table' | 'hr' | 'clear'
  | 'latexInline' | 'latexBlock' | 'wikilink'

interface UnifiedToolbarProps {
  onAction: (action: UnifiedAction, arg?: string) => void
  /** Ẩn các nút không phù hợp với mode (VD: màu chữ ở Live) */
  hidden?: UnifiedAction[]
}

const TEXT_COLORS = ['#0f172a', '#dc2626', '#2563eb', '#16a34a', '#7c3aed']

/**
 * Thanh công cụ thống nhất (giữ thiết kế Simple, căn giữa): gộp mọi chức năng
 * soạn thảo của Live + Simple + ký hiệu toán LaTeX. Cha tự map action theo mode.
 */
export function UnifiedToolbar({ onAction, hidden = [] }: UnifiedToolbarProps) {
  const hide = new Set(hidden)

  const btn = (
    action: UnifiedAction,
    title: string,
    children: React.ReactNode,
    arg?: string
  ) => {
    if (hide.has(action)) return null
    return (
      <button
        key={action + (arg || '')}
        type="button"
        className="simple-tool-btn"
        title={title}
        onMouseDown={(e) => {
          e.preventDefault()
          onAction(action, arg)
        }}
      >
        {children}
      </button>
    )
  }

  const sep = (k: string) => <span key={k} className="simple-toolbar-sep" />

  return (
    <div className="simple-toolbar unified-toolbar">
      {btn('undo', 'Hoàn tác (Undo)', <Undo size={15} />)}
      {btn('redo', 'Làm lại (Redo)', <Redo size={15} />)}
      {sep('s0')}
      {btn('h1', 'Tiêu đề 1', <span style={{ fontSize: '15px' }}>H1</span>)}
      {btn('h2', 'Tiêu đề 2', <span style={{ fontSize: '14px' }}>H2</span>)}
      {btn('h3', 'Tiêu đề 3', <span style={{ fontSize: '13px' }}>H3</span>)}
      {btn('paragraph', 'Đoạn thường', <span style={{ fontSize: '13px' }}>¶</span>)}
      {sep('s1')}
      {btn('bold', 'In đậm (Bold)', <Bold size={15} />)}
      {btn('italic', 'In nghiêng (Italic)', <Italic size={15} />)}
      {btn('underline', 'Gạch chân (Underline)', <Underline size={15} />)}
      {btn('strike', 'Gạch ngang (Strikethrough)', <Strikethrough size={15} />)}
      {btn('highlight', 'Bôi vàng (Highlight)', <Highlighter size={15} />)}
      {!hide.has('textColor') &&
        TEXT_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            className="simple-color-dot"
            title={`Màu chữ ${c}`}
            style={{ backgroundColor: c }}
            onMouseDown={(e) => {
              e.preventDefault()
              onAction('textColor', c)
            }}
          />
        ))}
      {sep('s2')}
      {btn('alignLeft', 'Căn trái', <AlignLeft size={15} />)}
      {btn('alignCenter', 'Căn giữa', <AlignCenter size={15} />)}
      {btn('alignRight', 'Căn phải', <AlignRight size={15} />)}
      {sep('s3')}
      {btn('bullet', 'Gạch đầu dòng (Bullet)', <List size={15} />)}
      {btn('number', 'Danh sách số (Numbered)', <ListOrdered size={15} />)}
      {btn('task', 'Công việc (Task)', <CheckSquare size={15} />)}
      {btn('quote', 'Trích dẫn (Quote)', <Quote size={15} />)}
      {btn('codeblock', 'Khối code', <Code size={15} />)}
      {btn('code', 'Code trong dòng', <Braces size={13} />)}
      {sep('s4')}
      {btn('link', 'Chèn liên kết', <Link size={15} />)}
      {btn('image', 'Chèn ảnh', <Image size={15} />)}
      {btn('table', 'Chèn bảng 2x2', <Table size={15} />)}
      {btn('wikilink', 'Liên kết note [[...]]', <AtSign size={15} />)}
      {btn('latexInline', 'Công thức toán trong dòng ($...$)', <Sigma size={15} />)}
      {btn('latexBlock', 'Công thức toán khối ($$...$$)', <span style={{ fontSize: '12px' }}>∑¶</span>)}
      {btn('hr', 'Đường kẻ ngang', <Minus size={15} />)}
      {btn('clear', 'Xóa định dạng', <Eraser size={15} />)}
    </div>
  )
}
