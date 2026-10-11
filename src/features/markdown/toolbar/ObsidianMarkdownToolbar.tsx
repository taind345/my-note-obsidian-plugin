import {
  Heading2,
  Heading3,
  Bold,
  Italic,
  Strikethrough,
  Underline,
  Highlighter,
  Code,
  Box,
  Quote,
  Link,
  Table,
  CheckSquare,
  List,
  ListOrdered,
  ArrowRight,
  Minus,
  Undo2,
  Redo2,
} from 'lucide-react'

export type MarkdownFormatAction =
  | 'undo'
  | 'redo'
  | 'h2'
  | 'h3'
  | 'bold'
  | 'italic'
  | 'strikethrough'
  | 'underline'
  | 'highlight'
  | 'code'
  | 'codeblock'
  | 'quote'
  | 'wikilink'
  | 'table'
  | 'task'
  | 'bullet'
  | 'number'
  | 'arrow'
  | 'hr'

interface ObsidianMarkdownToolbarProps {
  onApplyFormat: (action: MarkdownFormatAction) => void
}

export function ObsidianMarkdownToolbar({ onApplyFormat }: ObsidianMarkdownToolbarProps) {
  const handleAction = (e: React.MouseEvent, action: MarkdownFormatAction) => {
    e.preventDefault()
    e.stopPropagation()
    onApplyFormat(action)
  }

  return (
    <div className="obsidian-markdown-toolbar" onMouseDown={(e) => e.preventDefault()}>
      {/* Undo / Redo */}
      <button
        type="button"
        className="md-toolbar-btn"
        onClick={(e) => handleAction(e, 'undo')}
        title="Undo (Ctrl+Z)"
      >
        <Undo2 size={14} />
      </button>

      <button
        type="button"
        className="md-toolbar-btn"
        onClick={(e) => handleAction(e, 'redo')}
        title="Redo (Ctrl+Y)"
      >
        <Redo2 size={14} />
      </button>

      <div className="md-toolbar-divider" />

      {/* Headings */}
      <button
        type="button"
        className="md-toolbar-btn"
        onClick={(e) => handleAction(e, 'h2')}
        title="Heading 2 (## )"
      >
        <Heading2 size={14} />
      </button>

      <button
        type="button"
        className="md-toolbar-btn"
        onClick={(e) => handleAction(e, 'h3')}
        title="Heading 3 (### )"
      >
        <Heading3 size={14} />
      </button>

      <div className="md-toolbar-divider" />

      {/* Text Styles */}
      <button
        type="button"
        className="md-toolbar-btn"
        onClick={(e) => handleAction(e, 'bold')}
        title="Bold (**text**) - Ctrl+B"
      >
        <Bold size={14} />
      </button>

      <button
        type="button"
        className="md-toolbar-btn"
        onClick={(e) => handleAction(e, 'italic')}
        title="Italic (*text*) - Ctrl+I"
      >
        <Italic size={14} />
      </button>

      <button
        type="button"
        className="md-toolbar-btn"
        onClick={(e) => handleAction(e, 'strikethrough')}
        title="Strikethrough (~~text~~)"
      >
        <Strikethrough size={14} />
      </button>

      <button
        type="button"
        className="md-toolbar-btn"
        onClick={(e) => handleAction(e, 'underline')}
        title="Underline (<u>text</u>)"
      >
        <Underline size={14} />
      </button>

      <button
        type="button"
        className="md-toolbar-btn"
        onClick={(e) => handleAction(e, 'highlight')}
        title="Highlight (==text==)"
      >
        <Highlighter size={14} />
      </button>

      <div className="md-toolbar-divider" />

      {/* Code */}
      <button
        type="button"
        className="md-toolbar-btn"
        onClick={(e) => handleAction(e, 'code')}
        title="Inline Code (`code`)"
      >
        <Code size={14} />
      </button>

      <button
        type="button"
        className="md-toolbar-btn"
        onClick={(e) => handleAction(e, 'codeblock')}
        title="Code Block (```lang)"
      >
        <Box size={14} />
      </button>

      <div className="md-toolbar-divider" />

      {/* Obsidian Specific: Quote, Wikilink, Table, Task */}
      <button
        type="button"
        className="md-toolbar-btn"
        onClick={(e) => handleAction(e, 'quote')}
        title="Callout / Blockquote (> )"
      >
        <Quote size={14} />
      </button>

      <button
        type="button"
        className="md-toolbar-btn wikilink-btn"
        onClick={(e) => handleAction(e, 'wikilink')}
        title="Obsidian Wikilink ([[topic]])"
      >
        <Link size={14} />
      </button>

      <button
        type="button"
        className="md-toolbar-btn"
        onClick={(e) => handleAction(e, 'table')}
        title="Markdown Table (| Col 1 | Col 2 |)"
      >
        <Table size={14} />
      </button>

      <button
        type="button"
        className="md-toolbar-btn"
        onClick={(e) => handleAction(e, 'task')}
        title="Task Checkbox (- [ ] )"
      >
        <CheckSquare size={14} />
      </button>

      {/* Lists */}
      <button
        type="button"
        className="md-toolbar-btn"
        onClick={(e) => handleAction(e, 'bullet')}
        title="Bullet List (- )"
      >
        <List size={14} />
      </button>

      <button
        type="button"
        className="md-toolbar-btn"
        onClick={(e) => handleAction(e, 'number')}
        title="Numbered List (1. )"
      >
        <ListOrdered size={14} />
      </button>

      <div className="md-toolbar-divider" />

      {/* Arrow symbol & Divider line */}
      <button
        type="button"
        className="md-toolbar-btn"
        onClick={(e) => handleAction(e, 'arrow')}
        title="Arrow symbol (==> ⇒)"
      >
        <ArrowRight size={14} />
      </button>

      <button
        type="button"
        className="md-toolbar-btn"
        onClick={(e) => handleAction(e, 'hr')}
        title="Horizontal Line (---)"
      >
        <Minus size={14} />
      </button>
    </div>
  )
}
