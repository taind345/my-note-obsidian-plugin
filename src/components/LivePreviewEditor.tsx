import { useState, useRef, useEffect, useMemo } from 'react'
import { renderMarkdown } from '../utils/markdown'
import { fontStack } from '../utils/fonts'
import type { UnifiedAction } from './UnifiedToolbar'

interface LivePreviewEditorProps {
  text: string
  fileDir: string
  onChange: (newText: string) => void
  onNavigateLink: (target: string) => void
  vaultFiles?: { name: string; path: string }[]
  mdFont?: string
  registerToolbar?: (fn: (a: UnifiedAction, arg?: string) => void) => void
}

/**
 * Live Preview kiểu Obsidian: toàn bộ note render chỉn chu, dòng nào con trỏ
 * đang đứng thì hiện markdown source để sửa, rời đi là render lại ngay.
 */
export function LivePreviewEditor({ text, fileDir, onChange, onNavigateLink, vaultFiles = [], mdFont = 'cascadia', registerToolbar }: LivePreviewEditorProps) {
  const lines = useMemo(() => text.split('\n'), [text])
  const [activeIdx, setActiveIdx] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const activeTaRef = useRef<HTMLTextAreaElement | null>(null)

  // Cache HTML theo nội dung dòng: gõ 1 dòng chỉ parse lại dòng đó,
  // các dòng còn lại dùng cache (note dài không lag khi gõ)
  const lineHtmlCache = useRef(new Map<string, string>())
  useEffect(() => {
    lineHtmlCache.current.clear()
  }, [fileDir])
  const getLineHtml = (src: string): string => {
    const hit = lineHtmlCache.current.get(src)
    if (hit !== undefined) return hit
    const html = renderMarkdown(src, { fileDir })
    const cache = lineHtmlCache.current
    if (cache.size > 2000) cache.clear()
    cache.set(src, html)
    return html
  }

  // Lịch sử undo/redo riêng (set text qua code làm mất undo native của textarea)
  const pastRef = useRef<string[]>([])
  const futureRef = useRef<string[]>([])
  const lastRef = useRef(text)
  const commitHistory = (val: string) => {
    if (val === lastRef.current) return
    pastRef.current.push(lastRef.current)
    if (pastRef.current.length > 100) pastRef.current.shift()
    futureRef.current = []
    lastRef.current = val
  }
  // Gõ thường: chốt lịch sử sau khi ngừng gõ 800ms
  useEffect(() => {
    const t = setTimeout(() => commitHistory(text), 800)
    return () => clearTimeout(t)
  }, [text])

  const clampActive = (val: string) => {
    const n = val.split('\n').length
    setActiveIdx((i) => (i === null ? null : Math.min(i, n - 1)))
  }

  const doUndo = () => {
    const prev = pastRef.current.pop()
    if (prev === undefined) return
    futureRef.current.push(lastRef.current)
    lastRef.current = prev
    onChange(prev)
    clampActive(prev)
  }

  const doRedo = () => {
    const nxt = futureRef.current.pop()
    if (nxt === undefined) return
    pastRef.current.push(lastRef.current)
    lastRef.current = nxt
    onChange(nxt)
    clampActive(nxt)
  }

  const handleHistoryKey = (e: React.KeyboardEvent): boolean => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault()
      doUndo()
      return true
    }
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
      e.preventDefault()
      doRedo()
      return true
    }
    return false
  }

  // Gợi ý [[wikilink]] khi gõ trong dòng đang sửa
  const [suggest, setSuggest] = useState<{ query: string; index: number } | null>(null)
  const suggestMatches = useMemo(() => {
    if (suggest === null || activeIdx === null) return []
    const q = suggest.query.toLowerCase()
    return vaultFiles
      .filter(
        (f) =>
          !q ||
          f.name.toLowerCase().includes(q) ||
          f.name.replace(/\.md$/i, '').toLowerCase().includes(q)
      )
      .slice(0, 8)
  }, [suggest, vaultFiles, activeIdx])

  const detectSuggest = (lineVal: string, cursor: number) => {
    const m = lineVal.slice(0, cursor).match(/\[\[([^\[\]\n]*)$/)
    if (m) {
      setSuggest((prev) => ({ query: m[1], index: prev ? Math.min(prev.index, 7) : 0 }))
    } else {
      setSuggest(null)
    }
  }

  const completeSuggest = (fileName: string) => {
    if (activeIdx === null) return
    const ta = activeTaRef.current
    const fence = fenceOf(activeIdx)
    // Trong khối code: thao tác trên text đã join
    const base = fence
      ? lines.slice(fence.from, fence.to + 1).join('\n')
      : lines[activeIdx] ?? ''
    const cursor = ta ? ta.selectionStart : base.length
    const m = base.slice(0, cursor).match(/\[\[([^\[\]\n]*)$/)
    if (!m) {
      setSuggest(null)
      return
    }
    const start = cursor - m[0].length
    const linkName = fileName.replace(/\.mynote\.md$/i, '').replace(/\.md$/i, '')
    const insert = `[[${linkName}]]`
    const nextBase = base.slice(0, start) + insert + base.slice(cursor)
    if (fence) updateFence(fence.from, fence.to, nextBase)
    else updateLine(activeIdx, nextBase)
    setSuggest(null)
    requestAnimationFrame(() => {
      const el = activeTaRef.current
      if (el) {
        el.focus()
        const pos = start + insert.length
        el.setSelectionRange(pos, pos)
        autoGrow(el)
      }
    })
  }

  // Không cho click checkbox/link trong dòng đang edit (đang là textarea)
  const handleRenderedClick = (e: React.MouseEvent, lineIdx: number, lineText: string) => {
    const target = e.target as HTMLElement

    // Toggle checkbox trực tiếp không cần vào edit
    const box = target.closest('.obsidian-checkbox-box')
    if (box) {
      e.stopPropagation()
      const toggled = /\[ \]/.test(lineText)
        ? lineText.replace('[ ]', '[x]')
        : lineText.replace(/\[[xX]\]/, '[ ]')
      if (toggled !== lineText) {
        const next = [...lines]
        next[lineIdx] = toggled
        onChange(next.join('\n'))
      }
      return
    }

    // Click link thì điều hướng, không vào edit
    const anchor = target.closest('a') as HTMLAnchorElement | null
    if (anchor) {
      e.preventDefault()
      e.stopPropagation()
      const href = anchor.getAttribute('href') || ''
      if (href.startsWith('http://') || href.startsWith('https://')) {
        window.open(href, '_blank', 'noopener,noreferrer')
        return
      }
      let cleanTarget = href
      try {
        cleanTarget = decodeURIComponent(href)
      } catch {}
      cleanTarget = cleanTarget.replace(/\.md$/, '').trim()
      if (cleanTarget && !cleanTarget.startsWith('#')) onNavigateLink(cleanTarget)
      return
    }

    // Chặn bubble lên container (kẻo container tưởng click vùng trống mà nhảy dòng cuối)
    e.stopPropagation()
    setActiveIdx(lineIdx)
  }

  const updateLine = (idx: number, val: string) => {
    const next = [...lines]
    next[idx] = val
    onChange(next.join('\n'))
  }

  // Nhóm dòng thành blocks: cặp ```...``` render nguyên khối code (không vỡ fence)
  type LineBlock = { type: 'single'; idx: number } | { type: 'fence'; from: number; to: number }
  const blocks = useMemo<LineBlock[]>(() => {
    const out: LineBlock[] = []
    let i = 0
    while (i < lines.length) {
      if (/^\s*```/.test(lines[i])) {
        let j = i + 1
        while (j < lines.length && !/^\s*```/.test(lines[j])) j++
        const to = j < lines.length ? j : lines.length - 1
        out.push({ type: 'fence', from: i, to })
        i = to + 1
      } else {
        out.push({ type: 'single', idx: i })
        i++
      }
    }
    return out
  }, [lines])

  const fenceOf = (idx: number): { from: number; to: number } | null => {
    for (const b of blocks) {
      if (b.type === 'fence' && idx >= b.from && idx <= b.to) return b
    }
    return null
  }

  const updateFence = (from: number, to: number, val: string) => {
    const parts = val.split('\n')
    const next = [...lines]
    next.splice(from, to - from + 1, ...parts)
    onChange(next.join('\n'))
  }

  const autoGrow = (ta: HTMLTextAreaElement | null) => {
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${ta.scrollHeight}px`
  }

  useEffect(() => {
    if (activeIdx !== null) autoGrow(activeTaRef.current)
  }, [activeIdx, text])

  // Toolbar thống nhất cho dòng đang sửa (markdown syntax)
  const applyFormat = (action: UnifiedAction) => {
    if (activeIdx === null) return
    const ta = activeTaRef.current
    const line = lines[activeIdx] ?? ''
    const apply = (nextLine: string, cursorOffset?: number) => {
      const full = [...lines]
      full[activeIdx] = nextLine
      const fullText = full.join('\n')
      updateLine(activeIdx, nextLine)
      commitHistory(fullText)
      requestAnimationFrame(() => {
        const el = activeTaRef.current
        if (!el) return
        el.focus()
        const pos = cursorOffset ?? nextLine.length
        el.setSelectionRange(pos, pos)
        autoGrow(el)
      })
    }
    const stripHead = line.replace(/^#+\s*/, '')
    if (!ta) {
      // Dòng render (không focus): transform cả dòng
      switch (action) {
        case 'bold': return apply(`**${line}**`)
        case 'italic': return apply(`*${line}*`)
        case 'underline': return apply(`<u>${line}</u>`)
        case 'strike': return apply(`~~${line}~~`)
        case 'highlight': return apply(`==${line}==`)
        case 'code': return apply(`\`${line}\``)
        case 'h1': return apply(`# ${stripHead}`)
        case 'h2': return apply(`## ${stripHead}`)
        case 'h3': return apply(`### ${stripHead}`)
        case 'paragraph': return apply(stripHead)
        case 'quote': return apply(line.startsWith('> ') ? line.slice(2) : `> ${line}`)
        case 'bullet': return apply(line.match(/^[-*]\s/) ? line : `- ${line}`)
        case 'number': return apply(line.match(/^\d+\.\s/) ? line : `1. ${line}`)
        case 'task': return apply(line.includes('[ ]') ? line.replace('[ ]', '[x]') : `- [ ] ${line.replace(/^[-*]\s*(\[[ xX]\]\s*)?/, '')}`)
        case 'hr': return apply(`${line}\n\n---`)
        default: return
      }
    }
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const sel = line.substring(start, end)
    const wrap = (a: string, b: string, placeholder: string) => {
      if (sel) apply(line.substring(0, start) + a + sel + b + line.substring(end), start + a.length + sel.length + b.length)
      else {
        const ins = `${a}${placeholder}${b}`
        apply(line.substring(0, start) + ins + line.substring(end), start + a.length)
      }
    }
    const insertAtCursor = (ins: string) => {
      apply(line.substring(0, start) + ins + line.substring(end), start + ins.length)
    }
    const promptOf = (msg: string, def: string) => {
      const v = window.prompt(msg, def)
      return v === null ? null : v
    }
    switch (action) {
      case 'undo': return doUndo()
      case 'redo': return doRedo()
      case 'bold': return wrap('**', '**', 'bold')
      case 'italic': return wrap('*', '*', 'italic')
      case 'underline': return wrap('<u>', '</u>', 'underline')
      case 'strike': return wrap('~~', '~~', 'text')
      case 'highlight': return wrap('==', '==', 'highlight')
      case 'code': return wrap('`', '`', 'code')
      case 'h1': return apply(`# ${stripHead}`, 2)
      case 'h2': return apply(`## ${stripHead}`, 3)
      case 'h3': return apply(`### ${stripHead}`, 4)
      case 'paragraph': return apply(stripHead, 0)
      case 'quote': return apply(line.startsWith('> ') ? line.slice(2) : `> ${line}`)
      case 'bullet': return apply(line.match(/^[-*]\s/) ? line : `- ${line}`, 2)
      case 'number': return apply(line.match(/^\d+\.\s/) ? line : `1. ${line}`, 3)
      case 'task': return apply(line.includes('[ ]') ? line.replace('[ ]', '[x]') : `- [ ] ${line.replace(/^[-*]\s*(\[[ xX]\]\s*)?/, '')}`, 6)
      case 'codeblock': {
        const body = sel || 'code'
        return insertAtCursor(`\n\`\`\`\n${body}\n\`\`\`\n`)
      }
      case 'link': {
        const url = promptOf('Nhập liên kết (URL):', 'https://')
        if (url === null) return
        return sel ? insertAtCursor(`[${sel}](${url})`) : insertAtCursor(`[text](${url})`)
      }
      case 'image': {
        const url = promptOf('Nhập địa chỉ ảnh (URL):', 'https://')
        if (url === null) return
        return insertAtCursor(`![](${url})`)
      }
      case 'table':
        return insertAtCursor(`\n| Cột 1 | Cột 2 |\n| :--- | :--- |\n|  |  |\n`)
      case 'hr': return insertAtCursor(`\n---\n`)
      case 'latexInline': {
        const f = promptOf('Công thức LaTeX trong dòng:', 'E=mc^2')
        if (f === null) return
        return sel ? insertAtCursor(`$${sel}$`) : insertAtCursor(`$${f}$`)
      }
      case 'latexBlock': {
        const f = promptOf('Công thức LaTeX khối:', '\\frac{a}{b}')
        if (f === null) return
        return insertAtCursor(`\n$$${f}$$\n`)
      }
      case 'wikilink': {
        const name = promptOf('Tên note liên kết:', '')
        if (name === null || !name.trim()) return
        return insertAtCursor(`[[${name.trim()}]]`)
      }
      default: return
    }
  }

  /** Điều hướng popup [[suggest]] — trả true nếu đã xử lý phím */
  const handleSuggestKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (!suggest || suggestMatches.length === 0) return false
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSuggest((p) => (p ? { ...p, index: (p.index + 1) % suggestMatches.length } : p))
      return true
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSuggest((p) =>
        p ? { ...p, index: (p.index - 1 + suggestMatches.length) % suggestMatches.length } : p
      )
      return true
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      completeSuggest(suggestMatches[suggest.index]?.name || suggestMatches[0].name)
      return true
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      setSuggest(null)
      return true
    }
    return false
  }

  /** Phím trong khối code đang sửa: Enter xuống dòng, Tab thụt 2 space, Esc thoát */
  const handleFenceKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (handleHistoryKey(e)) return
    if (handleSuggestKeyDown(e)) return
    const ta = e.currentTarget
    if (e.key === 'Escape') {
      ta.blur()
      setActiveIdx(null)
      setSuggest(null)
    } else if (e.key === 'Tab') {
      // Trong code: Tab thụt 2 space (giữ undo native qua execCommand)
      e.preventDefault()
      document.execCommand('insertText', false, '  ')
    }
  }

  const handleLineKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, idx: number) => {
    const ta = e.currentTarget
    if (handleHistoryKey(e)) return
    // Popup gợi ý [[wikilink]] ưu tiên trước điều hướng dòng
    if (handleSuggestKeyDown(e)) return
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const pos = ta.selectionStart
      const line = lines[idx]
      const before = line.substring(0, pos)
      const after = line.substring(pos)
      const next = [...lines]
      next[idx] = before
      next.splice(idx + 1, 0, after)
      const fullText = next.join('\n')
      onChange(fullText)
      commitHistory(fullText)
      setActiveIdx(idx + 1)
      requestAnimationFrame(() => {
        const el = activeTaRef.current
        if (el) {
          el.focus()
          el.setSelectionRange(0, 0)
          autoGrow(el)
        }
      })
    } else if (e.key === 'Backspace' && ta.selectionStart === 0 && ta.selectionEnd === 0 && idx > 0) {
      e.preventDefault()
      const prevLen = lines[idx - 1].length
      const next = [...lines]
      next[idx - 1] = next[idx - 1] + next[idx]
      next.splice(idx, 1)
      const fullText = next.join('\n')
      onChange(fullText)
      commitHistory(fullText)
      setActiveIdx(idx - 1)
      requestAnimationFrame(() => {
        const el = activeTaRef.current
        if (el) {
          el.focus()
          el.setSelectionRange(prevLen, prevLen)
          autoGrow(el)
        }
      })
    } else if (e.key === 'ArrowUp' && ta.selectionStart === 0) {
      e.preventDefault()
      if (idx > 0) {
        setActiveIdx(idx - 1)
        requestAnimationFrame(() => {
          const el = activeTaRef.current
          if (el) {
            el.focus()
            el.setSelectionRange(el.value.length, el.value.length)
            autoGrow(el)
          }
        })
      }
    } else if (e.key === 'ArrowDown' && ta.selectionStart === ta.value.length) {
      e.preventDefault()
      if (idx < lines.length - 1) {
        setActiveIdx(idx + 1)
        requestAnimationFrame(() => {
          const el = activeTaRef.current
          if (el) {
            el.focus()
            el.setSelectionRange(0, 0)
            autoGrow(el)
          }
        })
      }
    } else if (e.key === 'Escape') {
      ta.blur()
      setActiveIdx(null)
    }
  }

  // Đăng ký handler cho toolbar chung ở parent
  useEffect(() => {
    registerToolbar?.(applyFormat)
  })

  return (
    <div className="live-preview-container">
      {/* Popup gợi ý [[wikilink]] */}
      {suggest !== null && activeIdx !== null && suggestMatches.length > 0 && (
        <div className="wikilink-suggest-popup live-suggest-popup">
          {suggestMatches.map((f, i) => (
            <button
              key={f.path}
              type="button"
              className={`wikilink-suggest-item ${i === suggest.index ? 'active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault()
                completeSuggest(f.name)
              }}
              onMouseEnter={() => setSuggest((p) => (p ? { ...p, index: i } : p))}
              title={f.path}
            >
              <span className="wikilink-suggest-name">
                {f.name.replace(/\.mynote\.md$/i, '').replace(/\.md$/i, '')}
              </span>
              <span className="wikilink-suggest-path">{f.path}</span>
            </button>
          ))}
        </div>
      )}
      <div
        ref={containerRef}
        className="live-preview-doc"
        style={{ fontFamily: fontStack(mdFont) }}
        onClick={(e) => {
          // Chỉ nhảy khi click đúng vùng trống (không phải dòng nào)
          if (e.target === e.currentTarget && lines.length > 0) {
            setActiveIdx(lines.length - 1)
          }
        }}
      >
        {lines.length === 1 && lines[0] === '' && activeIdx === null ? (
          <div className="live-empty-hint" onClick={() => setActiveIdx(0)}>
            Click để bắt đầu viết... (hỗ trợ Markdown: # tiêu đề, - [ ] task, [[link]], bảng)
          </div>
        ) : (
          blocks.map((b) => {
            // Khối code fence: render nguyên khối, click vào sửa cả khối dạng source
            if (b.type === 'fence') {
              const isActive = activeIdx !== null && activeIdx >= b.from && activeIdx <= b.to
              if (isActive) {
                const joined = lines.slice(b.from, b.to + 1).join('\n')
                return (
                  <div key={`f${b.from}`} className="live-line active">
                    <textarea
                      ref={activeTaRef}
                      className="live-fence-edit"
                      value={joined}
                      autoFocus
                      onChange={(e) => {
                        updateFence(b.from, b.to, e.target.value)
                        autoGrow(e.target)
                        detectSuggest(e.target.value, e.target.selectionStart ?? 0)
                      }}
                      onBlur={() => {
                        setActiveIdx(null)
                        setSuggest(null)
                      }}
                      onKeyDown={handleFenceKeyDown}
                      onClick={(e) => e.stopPropagation()}
                      spellCheck={false}
                    />
                  </div>
                )
              }
              const html = getLineHtml(lines.slice(b.from, b.to + 1).join('\n'))
              return (
                <div
                  key={`f${b.from}`}
                  className="live-line"
                  onClick={(e) => {
                    e.stopPropagation()
                    setActiveIdx(b.from)
                  }}
                >
                  <div
                    className="live-line-rendered obsidian-markdown-body"
                    dangerouslySetInnerHTML={{ __html: html }}
                  />
                </div>
              )
            }
            const i = b.idx
            const line = lines[i]
            const isActive = i === activeIdx
            if (isActive) {
              return (
                <div key={i} className="live-line active">
                  <textarea
                    ref={activeTaRef}
                    className="live-line-edit"
                    style={{ fontFamily: fontStack(mdFont) }}
                    value={line}
                    rows={1}
                    autoFocus
                    onChange={(e) => {
                      updateLine(i, e.target.value)
                      autoGrow(e.target)
                      detectSuggest(e.target.value, e.target.selectionStart ?? 0)
                    }}
                    onBlur={() => {
                      setActiveIdx(null)
                      setSuggest(null)
                    }}
                    onKeyDown={(e) => handleLineKeyDown(e, i)}
                    onClick={(e) => e.stopPropagation()}
                    spellCheck={false}
                  />
                </div>
              )
            }
            const html = getLineHtml(line)
            return (
              <div
                key={i}
                className="live-line"
                onClick={(e) => handleRenderedClick(e, i, line)}
              >
                {html ? (
                  <div
                    className="live-line-rendered obsidian-markdown-body"
                    dangerouslySetInnerHTML={{ __html: html }}
                  />
                ) : (
                  <div className="live-line-rendered live-line-blank">&nbsp;</div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
