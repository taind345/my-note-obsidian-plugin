import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { FileText, Search, BookOpen, Code, Plus } from 'lucide-react'
import type { EditorMode } from '@/shared/types/notebook'

export interface QuickOpenFile {
  name: string
  path: string
}

interface QuickOpenModalProps {
  isOpen: boolean
  files: QuickOpenFile[]
  onClose: () => void
  onOpen: (path: string) => void
  /** Tạo tab mới trống (hiện 3 lựa chọn đầu khi chưa gõ gì) */
  onCreateTab?: (mode: EditorMode) => void
}

/** Đối sánh mờ: mọi ký tự query phải xuất hiện theo thứ tự trong target */
export function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  if (!q) return 0
  if (t.includes(q)) return 100 - t.indexOf(q)
  let qi = 0
  let score = 0
  let lastPos = -1
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      score += lastPos === i - 1 ? 2 : 1
      lastPos = i
      qi++
    }
  }
  return qi === q.length ? score : -1
}

/** Quick Open kiểu Obsidian: Ctrl+O, gõ tên file, Enter để mở */
export function QuickOpenModal({ isOpen, files, onClose, onOpen, onCreateTab }: QuickOpenModalProps) {
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setActiveIdx(0)
      setTimeout(() => inputRef.current?.focus(), 20)
    }
  }, [isOpen])

  const results = useMemo(() => {
    const q = query.trim()
    if (!q) return files.slice(0, 30)
    return files
      .map((f) => {
        const nameScore = fuzzyScore(q, f.name.replace(/\.(md|mynote\.md|excalidraw\.md)$/i, ''))
        const pathScore = fuzzyScore(q, f.path)
        const best = Math.max(nameScore, pathScore * 0.5)
        return { f, best }
      })
      .filter((r) => r.best >= 0)
      .sort((a, b) => b.best - a.best)
      .slice(0, 30)
      .map((r) => r.f)
  }, [query, files])

  useEffect(() => {
    setActiveIdx(0)
  }, [query])

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-qo-idx="${activeIdx}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  if (!isOpen) return null

  const openActive = () => {
    const target = results[activeIdx]
    if (target) {
      onOpen(target.path)
      onClose()
    }
  }

  return createPortal(
    <div className="quickopen-overlay" onClick={onClose}>
      <div className="quickopen-modal" onClick={(e) => e.stopPropagation()}>
        <div className="quickopen-input-row">
          <Search size={15} className="quickopen-search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="quickopen-input"
            placeholder="Gõ tên file để mở... (Esc để đóng)"
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
                openActive()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                onClose()
              }
            }}
          />
        </div>
        <div ref={listRef} className="quickopen-list">
          {/* Tạo tab mới khi chưa gõ gì (nút + trên tab bar mở tới đây) */}
          {onCreateTab && !query.trim() && (
            <>
              <div className="quickopen-section-label">Tab mới</div>
              {(
                [
                  { mode: 'markdown', icon: <FileText size={14} className="color-md" />, label: 'Note trống (.md)' },
                  { mode: 'mynote', icon: <BookOpen size={14} className="color-mynote" />, label: 'Vở MyNote mới' },
                  { mode: 'code', icon: <Code size={14} className="color-code" />, label: 'File code mới' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.mode}
                  type="button"
                  className="quickopen-item quickopen-create"
                  onClick={() => {
                    onCreateTab(opt.mode)
                    onClose()
                  }}
                >
                  <Plus size={13} className="quickopen-item-icon" />
                  {opt.icon}
                  <span className="quickopen-item-name">{opt.label}</span>
                </button>
              ))}
              <div className="quickopen-section-label">Mở file vào tab mới</div>
            </>
          )}
          {results.length === 0 && (
            <div className="quickopen-empty">Không tìm thấy file nào.</div>
          )}
          {results.map((f, i) => (
            <button
              key={f.path}
              type="button"
              data-qo-idx={i}
              className={`quickopen-item ${i === activeIdx ? 'active' : ''}`}
              onClick={() => {
                onOpen(f.path)
                onClose()
              }}
              onMouseEnter={() => setActiveIdx(i)}
            >
              <FileText size={14} className="quickopen-item-icon" />
              <span className="quickopen-item-name">{f.name}</span>
              <span className="quickopen-item-path" title={f.path}>
                {f.path}
              </span>
            </button>
          ))}
        </div>
        <div className="quickopen-hint">↑↓ di chuyển • Enter mở • Esc đóng</div>
      </div>
    </div>,
    document.body
  )
}
