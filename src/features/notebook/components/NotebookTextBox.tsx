import React, { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { PAGE_WIDTH, PAGE_HEIGHT, displayScale, DEFAULT_TEXTBOX_WIDTH, FULL_TEXTBOX_WIDTH } from '@/shared/lib/lineSnap'
import { renderMarkdown } from '@/shared/lib/markdown'
import { debounce } from '@/shared/lib/debounce'
import { GripVertical, Lock, Unlock, Trash2, Copy, Frame } from 'lucide-react'
import type { TextBoxData } from '@/shared/types/notebook'
import { ObsidianMarkdownToolbar, type MarkdownFormatAction } from '@/features/markdown/toolbar/ObsidianMarkdownToolbar'

interface NotebookTextBoxProps {
  data: TextBoxData
  isSelected: boolean
  linePitch: number
  topMargin?: number
  fontFamily: string
  /** Ở chế độ bút/vẽ: click đơn chỉ select, double-click mới edit (mặc định true = click là edit) */
  singleClickEdits?: boolean
  onSelect: (id: string) => void
  onUpdate: (id: string, updates: Partial<TextBoxData>) => void
  onDelete: (id: string) => void
  onDuplicate?: (id: string) => void
  onNavigateLink?: (target: string) => void
  /** Gọi khi vừa nhập xong (blur, box còn nội dung) — cha dùng để auto về select */
  onFinishEditing?: (id: string) => void
  /** Gọi khi bấm Escape trong lúc edit — cha dùng để auto về select */
  onEscapeExit?: () => void
  /** Kéo nhóm multi-select: snapshot các box cùng nhóm khi bắt đầu kéo */
  onGroupDragStart?: (draggedId: string) => void
  /** Kéo nhóm: di chuyển các box cùng nhóm theo delta (tuyệt đối từ điểm bắt đầu) */
  onGroupMove?: (dx: number, dy: number) => void
}

function NotebookTextBoxInner({
  data,
  isSelected,
  linePitch,
  topMargin: _topMargin,
  fontFamily,
  singleClickEdits = true,
  onSelect,
  onUpdate,
  onDelete,
  onDuplicate,
  onNavigateLink,
  onFinishEditing,
  onEscapeExit,
  onGroupDragStart,
  onGroupMove,
}: NotebookTextBoxProps) {
  const { id, x, y, width, content, isLocked, showFrame } = data
  const [isEditing, setIsEditing] = useState(data.isEditing || false)
  const [rawText, setRawText] = useState(content)
  const [renderedHtml, setRenderedHtml] = useState(() => renderMarkdown(content))
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null)

  // Dragging state
  const [isDragging, setIsDragging] = useState(false)
  const [dragPos, setDragPos] = useState({ x, y })
  const isDraggingRef = useRef(false)
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number }>({
    startX: 0,
    startY: 0,
    originX: x,
    originY: y,
  })
  const rafId = useRef<number | null>(null)

  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  // Sync external content update if not actively editing
  useEffect(() => {
    if (!isEditing) {
      setRawText(content)
      setRenderedHtml(renderMarkdown(content))
    }
  }, [content, isEditing])

  // Sync positions when props change and not dragging
  useEffect(() => {
    if (!isDragging) {
      setDragPos({ x, y })
    }
  }, [x, y, isDragging])

  // Chuyển sang chế độ bút/vẽ: khóa tạm thời → chốt nội dung và thoát editor
  useEffect(() => {
    if (!singleClickEdits && isEditing) {
      setIsEditing(false)
      if (rawText && rawText.trim() && rawText !== content) {
        onUpdate(id, { content: rawText })
      }
    }
  }, [singleClickEdits, isEditing])

  // Auto-focus and adjust height on entering edit mode or when width changes
  useEffect(() => {
    if (isEditing && textareaRef.current && !isLocked) {
      textareaRef.current.focus()
      adjustTextareaHeight()
    }
  }, [isEditing, isLocked])

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      adjustTextareaHeight()
    }
  }, [width, isEditing])

  // Close context menu on outside click
  useEffect(() => {
    const handleOutsideClick = () => {
      if (contextMenuPos) setContextMenuPos(null)
    }
    window.addEventListener('click', handleOutsideClick)
    return () => window.removeEventListener('click', handleOutsideClick)
  }, [contextMenuPos])

  const adjustTextareaHeight = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(el.scrollHeight, linePitch)}px`
  }

  // Debounced markdown parsing (120ms)
  const debouncedParse = useRef(
    debounce((text: string) => {
      setRenderedHtml(renderMarkdown(text))
    }, 120)
  ).current

  // Debounced parent state update (200ms)
  const debouncedParentUpdate = useRef(
    debounce((text: string) => {
      onUpdate(id, { content: text })
    }, 200)
  ).current

  // Tự động mở rộng sang kích thước chuẩn (520px) nếu dán văn bản dài
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData?.getData('text')
    if (text && (text.length > 40 || text.includes('\n'))) {
      const fullWidth = Math.min(FULL_TEXTBOX_WIDTH, PAGE_WIDTH - dragPos.x - 20)
      if (width < fullWidth) {
        onUpdate(id, { width: fullWidth })
      }
    }
  }

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    // Nhận biết nếu có đoạn văn bản dài được chèn/paste vào box đang ở kích thước hẹp
    if (val.length - rawText.length > 40 || (val.length > 50 && width <= DEFAULT_TEXTBOX_WIDTH)) {
      const fullWidth = Math.min(FULL_TEXTBOX_WIDTH, PAGE_WIDTH - dragPos.x - 20)
      if (width < fullWidth) {
        onUpdate(id, { width: fullWidth })
      }
    }
    setRawText(val)
    adjustTextareaHeight()
    debouncedParse(val)
    debouncedParentUpdate(val)
  }

  // Single click: luôn select; chỉ vào edit ngay khi singleClickEdits (select/text tool).
  // Ở chế độ bút/vẽ thì click đơn chỉ select khung, double-click mới mở editor.
  const handleSingleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onSelect(id)

    // 1. Check if user clicked an interactive task checkbox in rendered view
    const target = e.target as HTMLElement
    if (target.classList.contains('obsidian-checkbox-box') || target.closest('.obsidian-checkbox-box')) {
      toggleTaskCheckbox(target)
      return
    }

    // 2. Check if user clicked a link
    const anchor = target.closest('a') as HTMLAnchorElement | null
    if (anchor && onNavigateLink) {
      e.preventDefault()
      const targetLink =
        anchor.getAttribute('data-wikilink') ||
        anchor.getAttribute('data-link') ||
        anchor.getAttribute('href') ||
        ''
      if (targetLink && !targetLink.startsWith('#') && !targetLink.startsWith('http')) {
        let clean = targetLink.replace(/\.md$/, '').trim()
        try {
          clean = decodeURIComponent(clean)
        } catch {}
        onNavigateLink(clean)
        return
      }
    }

    if (!isLocked) {
      if (singleClickEdits) {
        setIsEditing(true)
      }
    }
  }

  // Double-click luôn mở editor (cần cho chế độ bút: click chọn, đúp để sửa chữ)
  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onSelect(id)
    if (!isLocked && !isEditing) {
      setIsEditing(true)
    }
  }

  // Right-click context menu
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onSelect(id)
    setContextMenuPos({ x: e.clientX, y: e.clientY })
  }

  // Toggles `- [ ]` <-> `- [x]` on direct click without opening the editor
  const toggleTaskCheckbox = (checkboxEl: HTMLElement) => {
    const li = checkboxEl.closest('li')
    if (!li) return

    const taskText = li.querySelector('.task-text')?.textContent?.trim() || ''
    if (!taskText) return

    const lines = rawText.split('\n')
    let modified = false

    const newLines = lines.map((line) => {
      if (modified) return line
      const cleanLine = line.replace(/^[\s*-]+\[[ xX]\]\s*/, '').trim()
      if (cleanLine.startsWith(taskText.substring(0, 20))) {
        modified = true
        if (line.includes('[ ]')) {
          return line.replace('[ ]', '[x]')
        } else if (line.includes('[x]') || line.includes('[X]')) {
          return line.replace(/\[[xX]\]/, '[ ]')
        }
      }
      return line
    })

    if (modified) {
      const nextContent = newLines.join('\n')
      setRawText(nextContent)
      setRenderedHtml(renderMarkdown(nextContent))
      onUpdate(id, { content: nextContent })
    }
  }

  // Obsidian Markdown Toolbar Action Handler
  const handleApplyFormat = useCallback(
    (action: MarkdownFormatAction) => {
      const textarea = textareaRef.current
      if (!textarea || isLocked) return

      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const text = textarea.value
      const selected = text.substring(start, end)

      let replacement = ''
      let newCursorPos = start

      switch (action) {
        case 'undo':
          document.execCommand('undo')
          return
        case 'redo':
          document.execCommand('redo')
          return
        case 'underline':
          replacement = selected ? `<u>${selected}</u>` : `<u>underline</u>`
          newCursorPos = selected ? start + replacement.length : start + 3
          break
        case 'table':
          replacement = `\n| Header 1 | Header 2 |\n| :--- | :--- |\n| Cell 1 | Cell 2 |\n`
          newCursorPos = start + replacement.length
          break
        case 'bold':
          replacement = selected ? `**${selected}**` : `**bold**`
          newCursorPos = selected ? start + replacement.length : start + 2
          break
        case 'italic':
          replacement = selected ? `*${selected}*` : `*italic*`
          newCursorPos = selected ? start + replacement.length : start + 1
          break
        case 'strikethrough':
          replacement = selected ? `~~${selected}~~` : `~~text~~`
          newCursorPos = selected ? start + replacement.length : start + 2
          break
        case 'highlight':
          replacement = selected ? `==${selected}==` : `==highlight==`
          newCursorPos = selected ? start + replacement.length : start + 2
          break
        case 'code':
          replacement = selected ? `\`${selected}\`` : `\`code\``
          newCursorPos = selected ? start + replacement.length : start + 1
          break
        case 'codeblock':
          replacement = `\`\`\`html\n${selected || '// code here'}\n\`\`\`\n`
          newCursorPos = start + 3
          break
        case 'quote':
          replacement = selected ? `> ${selected}\n` : `> `
          newCursorPos = start + replacement.length
          break
        case 'wikilink':
          replacement = selected ? `[[${selected}]]` : `[[Note Name]]`
          newCursorPos = selected ? start + replacement.length : start + 2
          break
        case 'task':
          replacement = `- [ ] ${selected || 'task item'}\n`
          newCursorPos = start + 6
          break
        case 'bullet':
          replacement = `- ${selected || 'list item'}\n`
          newCursorPos = start + 2
          break
        case 'number':
          replacement = `1. ${selected || 'first item'}\n`
          newCursorPos = start + 3
          break
        case 'h2':
          replacement = `## ${selected || 'Heading 2'}\n`
          newCursorPos = start + 3
          break
        case 'h3':
          replacement = `### ${selected || 'Heading 3'}\n`
          newCursorPos = start + 4
          break
        case 'arrow':
          replacement = `==> `
          newCursorPos = start + replacement.length
          break
        case 'hr':
          replacement = `\n---\n`
          newCursorPos = start + replacement.length
          break
        default:
          return
      }

      const nextText = text.substring(0, start) + replacement + text.substring(end)
      setRawText(nextText)
      setRenderedHtml(renderMarkdown(nextText))
      onUpdate(id, { content: nextText })

      setTimeout(() => {
        textarea.focus()
        textarea.setSelectionRange(newCursorPos, newCursorPos)
        adjustTextareaHeight()
      }, 10)
    },
    [id, onUpdate, isLocked]
  )

  const handleBlur = (e: React.FocusEvent) => {
    if (e.relatedTarget && (e.relatedTarget as HTMLElement).closest('.obsidian-markdown-toolbar')) {
      return
    }

    setIsEditing(false)
    if (!rawText || !rawText.trim()) {
      onDelete(id)
      return
    }
    if (rawText !== content) {
      onUpdate(id, { content: rawText })
    }
    onFinishEditing?.(id)
  }

  // Handle Tab key inside editor
  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const textarea = textareaRef.current
      if (!textarea) return
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const val = textarea.value
      const next = val.substring(0, start) + '  ' + val.substring(end)
      setRawText(next)
      debouncedParse(next)
      debouncedParentUpdate(next)
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2
      }, 0)
    } else if (e.key === 'Escape') {
      setIsEditing(false)
      onEscapeExit?.()
    }
  }

  // Pointer Down Drag (chia scale khi zoom để không chạy nhanh/chậm hơn chuột)
  const handlePointerDownDrag = (e: React.PointerEvent) => {
    if (isEditing || isLocked) return
    e.stopPropagation()
    // Giữ nguyên vùng chọn nhóm nếu box đã nằm trong đó (để kéo cả nhóm)
    if (!isSelected) onSelect(id)

    isDraggingRef.current = true
    setIsDragging(true)
    onGroupDragStart?.(id)

    const boxEl = document.getElementById(`textbox-${id}`)
    const scale = displayScale(boxEl?.getBoundingClientRect(), width)

    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: dragPos.x,
      originY: dragPos.y,
    }

    const onPointerMove = (moveEv: PointerEvent) => {
      if (!isDraggingRef.current) return
      const dx = (moveEv.clientX - dragRef.current.startX) / scale
      const dy = (moveEv.clientY - dragRef.current.startY) / scale

      if (rafId.current === null) {
        rafId.current = requestAnimationFrame(() => {
          rafId.current = null
          const rawNewX = dragRef.current.originX + dx
          const rawNewY = dragRef.current.originY + dy

          const clampedX = Math.max(16, Math.min(PAGE_WIDTH - width - 16, rawNewX))
          const clampedY = Math.max(16, Math.min(PAGE_HEIGHT - 60, rawNewY))

          setDragPos({ x: clampedX, y: clampedY })
          // Kéo cả nhóm textbox cùng chọn đi cùng delta
          onGroupMove?.(dx, dy)
        })
      }
    }

    const onPointerUp = () => {
      isDraggingRef.current = false
      setIsDragging(false)
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current)
        rafId.current = null
      }

      setDragPos((curr) => {
        onUpdate(id, { x: curr.x, y: curr.y })
        return curr
      })

      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  // Handle Resize (chia scale khi zoom)
  const handleResizePointerDown = (e: React.PointerEvent) => {
    if (isLocked) return
    e.stopPropagation()
    const boxEl = document.getElementById(`textbox-${id}`)
    const scale = displayScale(boxEl?.getBoundingClientRect(), width)
    const startX = e.clientX
    const startWidth = width

    const onPointerMove = (moveEv: PointerEvent) => {
      const dx = (moveEv.clientX - startX) / scale
      const newWidth = Math.max(120, Math.min(PAGE_WIDTH - dragPos.x - 20, startWidth + dx))
      onUpdate(id, { width: newWidth })
    }

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  return (
    <div
      id={`textbox-${id}`}
      className={`notebook-textbox ${isSelected ? 'selected' : ''} ${isEditing ? 'editing' : ''} ${
        isDragging ? 'dragging' : ''
      } ${isLocked ? 'is-locked' : ''} ${showFrame ? 'is-framed' : ''}`}
      style={{
        left: `${dragPos.x}px`,
        top: `${dragPos.y}px`,
        width: `${width}px`,
        fontFamily:
          fontFamily === 'dfvn-excalidraw'
            ? 'var(--font-dfvn-excalidraw)'
            : fontFamily === 'custom'
            ? 'var(--font-custom)'
            : fontFamily === 'handwriting'
            ? 'var(--font-handwriting)'
            : fontFamily === 'serif'
            ? 'var(--font-serif)'
            : fontFamily === 'sans'
            ? 'var(--font-sans)'
            : 'var(--font-cascadia)',
      }}
      onClick={handleSingleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      onBlur={handleBlur}
    >
      {/* Obsidian Markdown Formatting Toolbar right above / below active text box */}
      {(isSelected || isEditing) && !isLocked && (
        <div className={`obsidian-toolbar-wrapper ${dragPos.y < 52 ? 'placement-below' : 'placement-above'}`}>
          <ObsidianMarkdownToolbar onApplyFormat={handleApplyFormat} />
        </div>
      )}

      {/* Lock badge if locked */}
      {isLocked && (
        <div className="textbox-lock-badge" title="Object is locked (Right-click to unlock)">
          <Lock size={12} />
        </div>
      )}

      {/* Subtle left grip handle only visible on hover / selection when unlocked */}
      {!isLocked && (
        <div
          className="textbox-hover-grip"
          onPointerDown={handlePointerDownDrag}
          title="Drag to reposition text block"
        >
          <GripVertical size={13} />
        </div>
      )}

      {/* Content Area */}
      <div className="textbox-content-wrapper">
        {isEditing && !isLocked ? (
          <textarea
            ref={textareaRef}
            className="textbox-editor obsidian-editor"
            value={rawText}
            onChange={handleTextChange}
            onKeyDown={handleTextareaKeyDown}
            onPaste={handlePaste}
            placeholder="Type notes in Markdown here (# Heading, - [ ] Todo, [[Note]], - list)..."
            style={{
              lineHeight: `${linePitch}px`,
              fontSize: '15px',
            }}
          />
        ) : (
          <div
            className="textbox-rendered obsidian-markdown-body"
            style={{
              lineHeight: `${linePitch}px`,
            }}
            dangerouslySetInnerHTML={{
              __html: renderedHtml || '<p class="empty-placeholder"><em>Click to write notes...</em></p>',
            }}
          />
        )}
      </div>

      {/* Resize handle when selected and unlocked */}
      {isSelected && !isLocked && (
        <div
          className="textbox-resize-handle"
          onPointerDown={handleResizePointerDown}
          title="Drag to resize text width"
        />
      )}

      {/* Decor khung card kiểu mẫu: mèo ngủ góc phải-dưới, cành lá cạnh phải */}
      {showFrame && (
        <>
          <img
            className="frame-decor frame-cat"
            src="/doodles/sleeping-cat.png"
            alt=""
            draggable={false}
          />
          <img
            className="frame-decor frame-sprig"
            src="/doodles/sprig-small.png"
            alt=""
            draggable={false}
          />
        </>
      )}

      {/* Right-click Context Menu (portal ra body: trang vở có transform nên fixed trong sheet bị lệch) */}
      {contextMenuPos &&
        createPortal(
          <div
            className="object-context-menu"
            style={{
              position: 'fixed',
              left: `${contextMenuPos.x}px`,
              top: `${contextMenuPos.y}px`,
              zIndex: 1000,
            }}
            onClick={(e) => e.stopPropagation()}
          >
          <button
            type="button"
            className="obj-context-item"
            onClick={() => {
              onUpdate(id, { isLocked: !isLocked })
              setContextMenuPos(null)
            }}
          >
            {isLocked ? <Unlock size={13} /> : <Lock size={13} />}
            <span>{isLocked ? 'Unlock Object' : 'Lock Object'}</span>
          </button>

          {onDuplicate && (
            <button
              type="button"
              className="obj-context-item"
              onClick={() => {
                onDuplicate(id)
                setContextMenuPos(null)
              }}
            >
              <Copy size={13} />
              <span>Duplicate</span>
            </button>
          )}

          <button
            type="button"
            className="obj-context-item"
            onClick={() => {
              onUpdate(id, { showFrame: !showFrame })
              setContextMenuPos(null)
            }}
          >
            <Frame size={13} />
            <span>{showFrame ? 'Ẩn khung (Hide frame)' : 'Hiển thị khung (Show frame)'}</span>
          </button>

          <button
            type="button"
            className="obj-context-item danger"
            onClick={() => {
              onDelete(id)
              setContextMenuPos(null)
            }}
          >
            <Trash2 size={13} />
            <span>Delete</span>
          </button>
          </div>,
          document.body
        )}
    </div>
  )
}

export const NotebookTextBox = React.memo(
  NotebookTextBoxInner,
  (prev, next) =>
    prev.data.id === next.data.id &&
    prev.data.x === next.data.x &&
    prev.data.y === next.data.y &&
    prev.data.width === next.data.width &&
    prev.data.content === next.data.content &&
    prev.data.isEditing === next.data.isEditing &&
    prev.data.isLocked === next.data.isLocked &&
    prev.data.showFrame === next.data.showFrame &&
    prev.isSelected === next.isSelected &&
    prev.linePitch === next.linePitch &&
    prev.topMargin === next.topMargin &&
    prev.fontFamily === next.fontFamily &&
    prev.singleClickEdits === next.singleClickEdits
)
