import { useState, useRef, useEffect, useCallback } from 'react'
import { renderMarkdown } from '@/shared/lib/markdown'
import { debounce } from '@/shared/lib/debounce'
import { fontStack } from '@/shared/lib/fonts'
import { LivePreviewEditor } from './LivePreviewEditor'
import { SimpleEditor } from './SimpleEditor'
import { UnifiedToolbar, type UnifiedAction } from '@/features/markdown/toolbar/UnifiedToolbar'
import { Eye, Save, Check, Zap, Smile, ChevronDown, FileDown } from 'lucide-react'

interface PureMarkdownEditorProps {
  filePath: string
  content: string
  title: string
  onSaveContent: (newContent: string) => void
  onNavigateLink: (target: string) => void
  vaultFiles?: { name: string; path: string }[]
  mdFont?: string
}

type EditorViewMode = 'preview' | 'live' | 'simple'

export function PureMarkdownEditor({
  filePath,
  content,
  title,
  onSaveContent,
  onNavigateLink,
  vaultFiles = [],
  mdFont = 'cascadia',
}: PureMarkdownEditorProps) {
  const fileDir = filePath ? filePath.substring(0, filePath.lastIndexOf('/')) : ''

  const [text, setText] = useState(content)
  // Mặc định Live Preview kiểu Obsidian (dòng con trỏ = source, còn lại render đẹp)
  const [viewMode, setViewMode] = useState<EditorViewMode>('live')
  const [renderedHtml, setRenderedHtml] = useState(() => renderMarkdown(content, { fileDir }))
  const [savedStatus, setSavedStatus] = useState<'saved' | 'saving' | 'dirty'>('saved')

  const previewRef = useRef<HTMLDivElement | null>(null)
  const [saveMenuOpen, setSaveMenuOpen] = useState(false)
  const saveMenuRef = useRef<HTMLDivElement | null>(null)

  // 1 toolbar duy nhất cho cả Live + Simple: con đăng ký handler, cha điều phối
  const toolbarHandler = useRef<((a: UnifiedAction, arg?: string) => void) | null>(null)
  const registerToolbar = useCallback(
    (fn: (a: UnifiedAction, arg?: string) => void) => {
      toolbarHandler.current = fn
    },
    []
  )

  // Sync khi file ngoài đổi (đổi tab/file) — autosave dội content về thì GIỮ
  // nguyên mode (không nhảy về live nữa), chỉ đồng bộ text.
  const lastFileRef = useRef(filePath)
  useEffect(() => {
    const fileChanged = lastFileRef.current !== filePath
    lastFileRef.current = filePath
    setText(content)
    setRenderedHtml(renderMarkdown(content, { fileDir }))
    setSavedStatus('saved')
    if (fileChanged) setViewMode('live')
  }, [content, fileDir, filePath])

  // Debounced markdown render
  const debouncedRender = useRef(
    debounce((val: string) => {
      setRenderedHtml(renderMarkdown(val, { fileDir }))
    }, 120)
  ).current

  // Debounced autosave
  const debouncedSave = useRef(
    debounce((val: string) => {
      onSaveContent(val)
      setSavedStatus('saved')
    }, 1200)
  ).current

  const handleManualSave = () => {
    onSaveContent(text)
    setSavedStatus('saved')
  }

  // Live Preview đổi text theo từng dòng
  const handleLiveChange = (val: string) => {
    setText(val)
    setSavedStatus('dirty')
    debouncedRender(val)
    debouncedSave(val)
  }

  // Simple WYSIWYG đổi markdown đã convert
  const handleSimpleSave = (md: string) => {
    if (md === text) return
    setText(md)
    setRenderedHtml(renderMarkdown(md, { fileDir }))
    setSavedStatus('dirty')
    debouncedSave(md)
  }

  // Intercept click on rendered preview links and task checkboxes
  const handlePreviewClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement

    // 1. Task Checkbox toggle
    if (target.classList.contains('obsidian-checkbox-box') || target.closest('.obsidian-checkbox-box')) {
      const li = target.closest('li')
      if (li) {
        const taskText = li.querySelector('.task-text')?.textContent?.trim() || ''
        if (taskText) {
          const lines = text.split('\n')
          let modified = false
          const newLines = lines.map((line) => {
            if (modified) return line
            if (line.includes(taskText.substring(0, 20))) {
              modified = true
              if (line.includes('[ ]')) return line.replace('[ ]', '[x]')
              if (line.includes('[x]') || line.includes('[X]')) return line.replace(/\[[xX]\]/, '[ ]')
            }
            return line
          })
          if (modified) {
            const next = newLines.join('\n')
            setText(next)
            setRenderedHtml(renderMarkdown(next))
            setSavedStatus('dirty')
            debouncedSave(next)
          }
        }
      }
      return
    }

    // 2. Wikilink or Markdown link click
    const anchor = target.closest('a') as HTMLAnchorElement | null
    if (anchor) {
      const href = anchor.getAttribute('href') || ''
      e.preventDefault()

      if (href.startsWith('#')) {
        // Heading jump
        const id = href.substring(1)
        const el = previewRef.current?.querySelector(`#${id}`)
        if (el) el.scrollIntoView({ behavior: 'smooth' })
        return
      }

      if (href.startsWith('http://') || href.startsWith('https://')) {
        window.open(href, '_blank', 'noopener,noreferrer')
        return
      }

      // Vault note link (wikilink or relative md link)
      let cleanTarget = href
      try {
        cleanTarget = decodeURIComponent(href)
      } catch {
        // keep raw
      }
      cleanTarget = cleanTarget.replace(/\.md$/, '').trim()
      onNavigateLink(cleanTarget)
    }
  }

  // Ctrl+S shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        handleManualSave()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [text])

  // Đóng menu Save khi click ra ngoài
  useEffect(() => {
    if (!saveMenuOpen) return
    const close = (e: MouseEvent) => {
      if (saveMenuRef.current && !saveMenuRef.current.contains(e.target as Node)) {
        setSaveMenuOpen(false)
      }
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [saveMenuOpen])

  const escapeHtml = (s: string) => s.split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;')

  // Lưu thành PDF qua trình in của trình duyệt (Save as PDF)
  const handleSavePdf = () => {
    setSaveMenuOpen(false)
    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'
    document.body.appendChild(iframe)
    const doc = iframe.contentDocument
    if (!doc) {
      iframe.remove()
      return
    }
    doc.open()
    doc.write(
      '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' +
        escapeHtml(title) +
        '</title><style>body{font-family:Georgia,serif;max-width:700px;margin:40px auto;padding:0 20px;line-height:1.7;color:#111}h1{font-size:26px;border-bottom:1px solid #ccc;padding-bottom:8px}h2{font-size:21px}h3{font-size:17px}pre{background:#f4f4f4;padding:12px;border-radius:8px;overflow-x:auto}code{font-family:monospace}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px 10px}img{max-width:100%}a{color:#0a6ebd}blockquote{border-left:3px solid #10b981;margin:10px 0;padding:6px 14px;background:#f4faf7}</style>' +
        '</head><body><h1>' +
        escapeHtml(title) +
        '</h1>' +
        renderedHtml +
        '</body></html>'
    )
    doc.close()
    const win = iframe.contentWindow
    if (win) {
      win.focus()
      win.print()
    }
    setTimeout(() => iframe.remove(), 1500)
  }

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0
  const charCount = text.length

  return (
    <div className="pure-markdown-editor-container">
      <div className="md-editor-header">
        <div className="md-editor-title-row">
          <div className="md-editor-left-cluster">
            <span className="md-editor-file-title">📝 {title}</span>
            <div className="md-editor-stats">
              <span>{wordCount} words</span>
              <span>{charCount} chars</span>
              <span className={'save-status-pill ' + savedStatus}>
                {savedStatus === 'saved' ? <Check size={12} /> : savedStatus === 'saving' ? 'Saving...' : 'Unsaved'}
              </span>
            </div>
          </div>
          <div className="md-editor-actions">
            <div className="md-save-split" ref={saveMenuRef}>
              <button type="button" className="md-save-btn" onClick={handleManualSave} title="Save (Ctrl+S)">
                <Save size={14} />
                <span>Save</span>
              </button>
              <button
                type="button"
                className="md-save-chevron"
                onClick={() => setSaveMenuOpen((v) => !v)}
                title="Tùy chọn lưu"
              >
                <ChevronDown size={13} />
              </button>
              {saveMenuOpen && (
                <div className="md-save-dropdown">
                  <button type="button" onClick={() => { setSaveMenuOpen(false); handleManualSave() }}>
                    <Save size={13} />
                    <span>Lưu ghi chú (Ctrl+S)</span>
                  </button>
                  <button type="button" onClick={handleSavePdf}>
                    <FileDown size={13} />
                    <span>Lưu thành PDF</span>
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="view-mode-toggle-group view-mode-centered">
            <button
              type="button"
              className={'view-mode-btn' + (viewMode === 'preview' ? ' active reading' : '')}
              onClick={() => setViewMode('preview')}
              title="Reading View (Chế độ đọc Obsidian)"
            >
              <Eye size={13} />
              <span>Reading</span>
            </button>
            <button
              type="button"
              className={'view-mode-btn' + (viewMode === 'live' ? ' active' : '')}
              onClick={() => setViewMode('live')}
              title="Live Preview (dòng con trỏ hiện source, còn lại render đẹp)"
            >
              <Zap size={13} />
              <span>Live</span>
            </button>
            <button
              type="button"
              className={'view-mode-btn' + (viewMode === 'simple' ? ' active' : '')}
              onClick={() => setViewMode('simple')}
              title="Soạn thảo đơn giản như Word (không cần biết Markdown)"
            >
              <Smile size={13} />
              <span>Simple</span>
            </button>
          </div>
        </div>
      </div>
      {/* 1 toolbar chung cho Live + Simple (nằm trên, căn giữa) */}
      {(viewMode === 'live' || viewMode === 'simple') && (
        <UnifiedToolbar
          onAction={(a, arg) => toolbarHandler.current?.(a, arg)}
          hidden={
            viewMode === 'live'
              ? ['textColor', 'alignLeft', 'alignCenter', 'alignRight', 'clear']
              : []
          }
        />
      )}
      <div className={'md-editor-body view-' + viewMode}>
        {(viewMode === 'live' || viewMode === 'simple') && (
          <div className="md-editor-pane editor-live">
            {viewMode === 'live' ? (
              <LivePreviewEditor
                text={text}
                fileDir={fileDir}
                onChange={handleLiveChange}
                onNavigateLink={onNavigateLink}
                vaultFiles={vaultFiles}
                mdFont={mdFont}
                registerToolbar={registerToolbar}
              />
            ) : (
              <SimpleEditor
                initialHtml={renderedHtml}
                onSaveMarkdown={handleSimpleSave}
                mdFont={mdFont}
                registerToolbar={registerToolbar}
              />
            )}
          </div>
        )}
        {viewMode === 'preview' && (
          <div
            ref={previewRef}
            className="md-editor-pane preview-right obsidian-markdown-body md-preview-pretty"
            style={{ fontFamily: fontStack(mdFont) }}
            onClick={handlePreviewClick}
            onDoubleClick={() => setViewMode('live')}
            dangerouslySetInnerHTML={{
              __html: renderedHtml || '<p class="empty-preview-hint"><em>Note is empty... Double click to start writing.</em></p>',
            }}
          />
        )}
      </div>
    </div>
  )
}
