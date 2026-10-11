import { useRef, useEffect } from 'react'
import { htmlToMarkdown } from '@/shared/lib/htmlToMarkdown'
import { fontStack } from '@/shared/lib/fonts'
import type { UnifiedAction } from '@/features/markdown/toolbar/UnifiedToolbar'
import { debounce } from '@/shared/lib/debounce'

interface SimpleEditorProps {
  initialHtml: string
  onSaveMarkdown: (md: string) => void
  mdFont?: string
  registerToolbar?: (fn: (a: UnifiedAction, arg?: string) => void) => void
}

/**
 * Chế độ soạn thảo đơn giản cho người không chuyên: toolbar như Word,
 * bôi đen rồi bấm nút là xong, tự chuyển về Markdown khi lưu.
 */
export function SimpleEditor({ initialHtml, onSaveMarkdown, mdFont = 'cascadia', registerToolbar }: SimpleEditorProps) {
  const editableRef = useRef<HTMLDivElement | null>(null)
  const saveRef = useRef(onSaveMarkdown)
  saveRef.current = onSaveMarkdown

  // Đồng bộ khi nội dung ngoài đổi (đổi file) và không đang focus
  useEffect(() => {
    const el = editableRef.current
    if (el && (!document.activeElement || !el.contains(document.activeElement))) {
      el.innerHTML = initialHtml
    }
  }, [initialHtml])

  const debouncedConvert = useRef(
    debounce(() => {
      const el = editableRef.current
      if (!el) return
      saveRef.current(htmlToMarkdown(el.innerHTML))
    }, 600)
  ).current

  const exec = (cmd: string, val?: string) => {
    const el = editableRef.current
    if (!el) return
    el.focus()
    document.execCommand('styleWithCSS', false)
    document.execCommand(cmd, false, val)
    debouncedConvert()
  }

  const selText = () => window.getSelection()?.toString() || ''

  const insertTaskItem = () => {
    const el = editableRef.current
    if (!el) return
    el.focus()
    document.execCommand('insertHTML', false, '- [ ] ')
    debouncedConvert()
  }

  const insertLink = () => {
    const url = window.prompt('Nhập liên kết (URL):', 'https://')
    if (url) exec('createLink', url)
  }

  const insertImage = () => {
    const url = window.prompt('Nhập địa chỉ ảnh (URL):', 'https://')
    if (url) exec('insertImage', url)
  }

  const handleUnifiedAction = (action: UnifiedAction, arg?: string) => {
    switch (action) {
      case 'undo': return exec('undo')
      case 'redo': return exec('redo')
      case 'h1': return exec('formatBlock', 'h1')
      case 'h2': return exec('formatBlock', 'h2')
      case 'h3': return exec('formatBlock', 'h3')
      case 'paragraph': return exec('formatBlock', 'p')
      case 'bold': return exec('bold')
      case 'italic': return exec('italic')
      case 'underline': return exec('underline')
      case 'strike': return exec('strikeThrough')
      case 'highlight': return exec('hiliteColor', '#fef08a')
      case 'textColor': return exec('foreColor', arg || '#0f172a')
      case 'alignLeft': return exec('justifyLeft')
      case 'alignCenter': return exec('justifyCenter')
      case 'alignRight': return exec('justifyRight')
      case 'bullet': return exec('insertUnorderedList')
      case 'number': return exec('insertOrderedList')
      case 'task': return insertTaskItem()
      case 'quote': return exec('formatBlock', 'blockquote')
      case 'codeblock': return exec('formatBlock', 'pre')
      case 'code': {
        const el = editableRef.current
        if (!el) return
        el.focus()
        const s = selText() || 'code'
        document.execCommand('insertHTML', false, `<code>${s}</code>`)
        debouncedConvert()
        return
      }
      case 'link': return insertLink()
      case 'image': return insertImage()
      case 'table':
        return exec(
          'insertHTML',
          '<table><tbody><tr><td>Cột 1</td><td>Cột 2</td></tr><tr><td></td><td></td></tr></tbody></table><p><br></p>'
        )
      case 'hr': return exec('insertHorizontalRule')
      case 'clear': return exec('removeFormat')
      case 'latexInline': {
        const f = window.prompt('Công thức LaTeX trong dòng:', 'E=mc^2')
        if (f === null) return
        return exec('insertHTML', `$${f}$`)
      }
      case 'latexBlock': {
        const f = window.prompt('Công thức LaTeX khối:', '\\frac{a}{b}')
        if (f === null) return
        return exec('insertHTML', `<p>$$${f}$$</p>`)
      }
      case 'wikilink': {
        const name = window.prompt('Tên note liên kết:', '')
        if (name === null || !name.trim()) return
        return exec('insertHTML', `[[${name.trim()}]]`)
      }
    }
  }

  // Đăng ký handler cho toolbar chung ở parent (1 toolbar cho cả Live + Simple)
  useEffect(() => {
    registerToolbar?.(handleUnifiedAction)
  })

  // Ctrl+Z / Ctrl+Y trong khung soạn
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault()
      exec('undo')
    } else if (
      (e.ctrlKey || e.metaKey) &&
      (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))
    ) {
      e.preventDefault()
      exec('redo')
    }
  }

  return (
    <div className="simple-editor-container">
      <div
        ref={editableRef}
        className="simple-editable"
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        style={{ fontFamily: fontStack(mdFont), textAlign: 'left' }}
        data-placeholder="Viết ở đây... bôi đen chữ rồi bấm nút trên thanh công cụ (như Word)."
        onInput={debouncedConvert}
        onKeyDown={handleKeyDown}
      />
    </div>
  )
}
