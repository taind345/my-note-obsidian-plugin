import { useState, useRef, useEffect } from 'react'
import { Save, Copy, Check, Code as CodeIcon } from 'lucide-react'
import { debounce } from '@/shared/lib/debounce'
import { fontStack } from '@/shared/lib/fonts'

interface CodeEditorProps {
  filePath: string
  content: string
  title: string
  onSaveContent: (newContent: string) => void
  fontFamily?: string
}

export function CodeEditor({ filePath: _filePath, content, title, onSaveContent, fontFamily = 'cascadia' }: CodeEditorProps) {
  const [code, setCode] = useState(content)
  const [savedStatus, setSavedStatus] = useState<'saved' | 'saving' | 'dirty'>('saved')
  const [copied, setCopied] = useState(false)
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 })

  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const lineNumbersRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setCode(content)
    setSavedStatus('saved')
  }, [content])

  const debouncedSave = useRef(
    debounce((val: string) => {
      onSaveContent(val)
      setSavedStatus('saved')
    }, 1500)
  ).current

  const handleCodeChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setCode(val)
    setSavedStatus('dirty')
    debouncedSave(val)
    updateCursor()
  }

  const handleManualSave = () => {
    onSaveContent(code)
    setSavedStatus('saved')
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  // Handle Tab key indentation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      handleManualSave()
      return
    }

    if (e.key === 'Tab') {
      e.preventDefault()
      const textarea = textareaRef.current
      if (!textarea) return

      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const val = textarea.value

      const next = val.substring(0, start) + '  ' + val.substring(end)
      setCode(next)
      setSavedStatus('dirty')
      debouncedSave(next)

      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2
      }, 0)
    }
  }

  const updateCursor = () => {
    const el = textareaRef.current
    if (!el) return
    const textBefore = el.value.substring(0, el.selectionStart)
    const lines = textBefore.split('\n')
    setCursorPos({
      line: lines.length,
      col: lines[lines.length - 1].length + 1,
    })
  }

  // Synchronize scrolling between textarea and line numbers gutter
  const handleScroll = () => {
    if (lineNumbersRef.current && textareaRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop
    }
  }

  const lines = code.split('\n')
  const ext = title.split('.').pop()?.toUpperCase() || 'CODE'

  return (
    <div className="code-editor-container">
      {/* Code Editor Header */}
      <div className="code-editor-header">
        <div className="code-header-left">
          <CodeIcon size={15} className="code-icon" />
          <span className="code-filename">{title}</span>
          <span className="code-lang-tag">{ext}</span>
          <span className={`save-status-pill ${savedStatus}`}>
            {savedStatus === 'saved' ? 'Saved' : savedStatus === 'saving' ? 'Saving...' : 'Unsaved'}
          </span>
        </div>

        <div className="code-header-right">
          <button
            type="button"
            className="code-action-btn"
            onClick={handleCopy}
            title="Copy code to clipboard"
          >
            {copied ? <Check size={14} className="color-green" /> : <Copy size={14} />}
            <span>{copied ? 'Copied!' : 'Copy'}</span>
          </button>

          <button
            type="button"
            className="code-action-btn primary"
            onClick={handleManualSave}
            title="Save code (Ctrl+S)"
          >
            <Save size={14} />
            <span>Save</span>
          </button>
        </div>
      </div>

      {/* Editor Body with Line Numbers */}
      <div className="code-editor-body">
        <div ref={lineNumbersRef} className="code-gutter-line-numbers">
          {lines.map((_, idx) => (
            <div key={idx} className="gutter-number">
              {idx + 1}
            </div>
          ))}
        </div>

        <textarea
          ref={textareaRef}
          className="code-textarea"
          style={{ fontFamily: fontStack(fontFamily) }}
          value={code}
          onChange={handleCodeChange}
          onKeyDown={handleKeyDown}
          onScroll={handleScroll}
          onClick={updateCursor}
          onKeyUp={updateCursor}
          spellCheck={false}
          autoCapitalize="none"
          autoComplete="off"
          wrap="off"
        />
      </div>

      {/* Status Bar */}
      <div className="code-status-bar">
        <span>Ln {cursorPos.line}, Col {cursorPos.col}</span>
        <span>{lines.length} lines</span>
        <span>{code.length} characters</span>
        <span>UTF-8</span>
      </div>
    </div>
  )
}
