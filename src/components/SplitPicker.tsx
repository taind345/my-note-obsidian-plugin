import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { FileText, BookOpen, Code, Search, X, Columns } from 'lucide-react'
import type { EditorTab, EditorMode } from '../types/notebook'
import { fuzzyScore, type QuickOpenFile } from './QuickOpenModal'

interface SplitPickerProps {
  isOpen: boolean
  tabs: EditorTab[]
  activeTabId: string
  files: QuickOpenFile[]
  onClose: () => void
  onPickTab: (tabId: string) => void
  onPickFile: (path: string) => void
  onNewTabForSplit: (mode: EditorMode) => void
}

function tabIcon(mode: EditorTab['mode']) {
  if (mode === 'mynote') return <BookOpen size={14} className="color-mynote" />
  if (mode === 'code') return <Code size={14} className="color-code" />
  return <FileText size={14} className="color-md" />
}

/**
 * Panel chia màn hình: nửa trên list tab đang mở, nửa dưới tìm file trong máy
 * (mini quick-open). UI gọn bên phải, căn cùng hàng tab.
 */
export function SplitPicker({
  isOpen,
  tabs,
  activeTabId,
  files,
  onClose,
  onPickTab,
  onPickFile,
  onNewTabForSplit,
}: SplitPickerProps) {
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setActiveIdx(0)
      setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [isOpen ])

  useEffect(() => {
    if (!isOpen) return
    const handleOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose()
    }
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', handleOutside)
    window.addEventListener('keydown', handleEsc)
    return () => {
      window.removeEventListener('mousedown', handleOutside)
      window.removeEventListener('keydown', handleEsc)
    }
  }, [isOpen, onClose])

  const results = useMemo(() => {
    const q = query.trim()
    if (!q) return files.slice(0, 8)
    return files
      .map((f) => {
        const nameScore = fuzzyScore(q, f.name.replace(/\.(md|mynote\.md|excalidraw\.md)$/i, ''))
        const pathScore = fuzzyScore(q, f.path)
        return { f, best: Math.max(nameScore, pathScore * 0.5) }
      })
      .filter((r) => r.best >= 0)
      .sort((a, b) => b.best - a.best)
      .slice(0, 8)
      .map((r) => r.f)
  }, [query, files])

  useEffect(() => {
    setActiveIdx(0)
  }, [query])

  if (!isOpen) return null

  const openActiveFile = () => {
    const t = results[activeIdx]
    if (t) {
      onPickFile(t.path)
      onClose()
    }
  }

  const otherTabs = tabs.filter((t) => t.id !== activeTabId)

  return createPortal(
    <div ref={panelRef} className="split-picker-panel">
      <div className="split-picker-header">
        <Columns size={14} />
        <span>Chia màn hình — chọn pane phải</span>
        <button type="button" className="split-picker-close" onClick={onClose} title="Đóng">
          <X size={14} />
        </button>
      </div>

      <div className="split-picker-section-label">Tab đang mở</div>
      <div className="split-picker-tabs">
        {otherTabs.length === 0 && (
          <div className="split-picker-empty">Chưa có tab nào khác.</div>
        )}
        {otherTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className="split-picker-tab"
            onClick={() => {
              onPickTab(t.id)
              onClose()
            }}
            title={t.path || t.title}
          >
            {tabIcon(t.mode)}
            <span className="split-picker-tab-title">{t.title}</span>
          </button>
        ))}
        <div className="split-picker-newrow">
          <button type="button" onClick={() => { onNewTabForSplit('markdown'); onClose() }}>
            + Note
          </button>
          <button type="button" onClick={() => { onNewTabForSplit('mynote'); onClose() }}>
            + MyNote
          </button>
          <button type="button" onClick={() => { onNewTabForSplit('code'); onClose() }}>
            + Code
          </button>
        </div>
      </div>

      <div className="split-picker-section-label">Mở file trong máy</div>
      <div className="split-picker-search">
        <Search size={13} />
        <input
          ref={inputRef}
          type="text"
          placeholder="Gõ tên file..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActiveIdx((i) => Math.min(results.length - 1, i + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActiveIdx((i) => Math.max(0, i - 1))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              openActiveFile()
            }
          }}
        />
      </div>
      <div className="split-picker-files">
        {results.map((f, i) => (
          <button
            key={f.path}
            type="button"
            className={`split-picker-file ${i === activeIdx ? 'active' : ''}`}
            onClick={() => {
              onPickFile(f.path)
              onClose()
            }}
            onMouseEnter={() => setActiveIdx(i)}
            title={f.path}
          >
            <span className="split-picker-file-name">{f.name}</span>
          </button>
        ))}
      </div>
    </div>,
    document.body
  )
}
