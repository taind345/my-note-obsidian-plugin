import TurndownService from 'turndown'

let singleton: TurndownService | null = null

function cleanText(el: Element): string {
  return (el.textContent || '').replace(/📍|↗|✓/g, '').trim()
}

/** Turndown cấu hình riêng để chuyển HTML preview (kiểu Obsidian) về Markdown sạch */
export function getTurndown(): TurndownService {
  if (singleton) return singleton

  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    fence: '```',
    bulletListMarker: '-',
    emDelimiter: '*',
    strongDelimiter: '**',
  })

  // Bỏ các mảnh UI trang trí (không phải nội dung)
  td.addRule('dropDecor', {
    filter: (node) =>
      node instanceof HTMLElement &&
      node.matches(
        '.code-card-header, .code-card-copy-btn, .callout-chevron, .link-pin, .link-external-icon, .obsidian-checkbox-box, .empty-preview-hint, script, style'
      ),
    replacement: () => '',
  })

  // Công thức toán: giữ tex gốc từ data-tex (-> $...$ / $$...$$)
  td.addRule('mathSrc', {
    filter: (node) =>
      node instanceof HTMLElement && node.matches('.math-src'),
    replacement: (_content, node) => {
      const el = node as HTMLElement
      let tex = el.getAttribute('data-tex') || ''
      try {
        tex = decodeURIComponent(tex)
      } catch {}
      if (!tex) return el.textContent || ''
      return el.classList.contains('math-block') ? `\n\n$$${tex}$$\n\n` : `$${tex}$`
    },
  })

  // <p> nằm trong <li> thì giữ inline (tránh tách dòng làm vỡ list)
  td.addRule('liParagraph', {
    filter: (node) =>
      node.nodeName === 'P' && !!node.parentNode && node.parentNode.nodeName === 'LI',
    replacement: (content) => content.trim(),
  })

  // Task list Obsidian: - [ ] / - [x]
  td.addRule('obsidianTask', {
    filter: (node) =>
      node instanceof HTMLElement && node.matches('li.obsidian-task-item'),
    replacement: (_content, node) => {
      const el = node as HTMLElement
      const checked = el.classList.contains('is-checked')
      const textEl = el.querySelector('.task-text')
      const text = textEl ? (textEl.textContent || '').trim() : cleanText(el)
      return `${checked ? '- [x]' : '- [ ]'} ${text}`;
    },
  })

  // Wikilink [[note]]
  td.addRule('obsidianWikilink', {
    filter: (node) =>
      node instanceof HTMLElement && node.matches('a.obsidian-wikilink'),
    replacement: (_content, node) => {
      const target = (node as HTMLElement).getAttribute('data-wikilink') || cleanText(node as Element)
      return `[[${target}]]`
    },
  })

  // Link thường [text](href)
  td.addRule('obsidianLink', {
    filter: (node) =>
      node instanceof HTMLElement && node.matches('a.obsidian-link'),
    replacement: (content, node) => {
      const href = (node as HTMLElement).getAttribute('data-link') || (node as HTMLAnchorElement).href || ''
      const label = cleanText(node as Element) || content.trim()
      if (!href) return label
      return `[${label}](${href})`
    },
  })

  // Highlight ==text==
  td.addRule('obsidianHighlight', {
    filter: (node) =>
      node instanceof HTMLElement && node.matches('mark.obsidian-highlight, mark'),
    replacement: (content) => `==${content.trim()}==`,
  })

  // Gạch chân <u>
  td.addRule('underlineKeep', {
    filter: ['u'],
    replacement: (content) => `<u>${content}</u>`,
  })

  // Mũi tên ⇒ / → (render từ ==> / ->)
  td.addRule('obsidianArrow', {
    filter: (node) =>
      node instanceof HTMLElement && node.matches('span.obsidian-arrow'),
    replacement: (_content, node) =>
      (node as HTMLElement).classList.contains('bold-arrow') ? '==>' : '->',
  })

  // Code card Obsidian -> ```lang fenced
  td.addRule('obsidianCodeCard', {
    filter: (node) =>
      node instanceof HTMLElement && node.matches('div.obsidian-code-card'),
    replacement: (_content, node) => {
      const el = node as HTMLElement
      const lang = el.querySelector('.code-card-lang')?.textContent?.trim() || ''
      const code = el.querySelector('code')?.textContent?.replace(/\n$/, '') ?? ''
      const language = lang === 'code' ? '' : lang
      return `\n\n\`\`\`${language}\n${code}\n\`\`\`\n\n`
    },
  })

  // Callout Obsidian -> blockquote >
  td.addRule('obsidianCallout', {
    filter: (node) =>
      node instanceof HTMLElement && node.matches('div.obsidian-callout'),
    replacement: (_content, node) => {
      const el = node as HTMLElement
      const body = el.querySelector('.callout-content')?.textContent ?? el.textContent ?? ''
      const lines = body
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => `> ${l}`)
      return `\n\n${lines.join('\n')}\n\n`
    },
  })

  // Span bôi màu chữ từ Word-toolbar (<font color> / span background) giữ gần đúng
  td.addRule('fontColorKeep', {
    filter: (node) =>
      node instanceof HTMLElement &&
      ((node.nodeName === 'FONT' && !!node.getAttribute('color')) ||
        (node.nodeName === 'SPAN' &&
          !node.className &&
          /background-color/i.test(node.getAttribute('style') || ''))),
    replacement: (content, node) => {
      const el = node as HTMLElement
      if (el.nodeName === 'FONT') {
        const c = el.getAttribute('color') || ''
        return `<font color="${c}">${content}</font>`
      }
      return `==${content}==`
    },
  })

  // Căn lề từ Word-toolbar -> div align (markdown-it giữ nguyên HTML)
  td.addRule('alignKeep', {
    filter: (node) => {
      if (!(node instanceof HTMLElement)) return false
      if (node.className) return false
      if (!/^(P|DIV|H1|H2|H3)$/.test(node.nodeName)) return false
      const align = node.getAttribute('align') || node.style.textAlign
      return !!align && align !== 'left' && align !== 'start'
    },
    replacement: (content, node) => {
      const el = node as HTMLElement
      const align = el.getAttribute('align') || el.style.textAlign || 'left'
      const body = content.trim()
      if (!body) return ''
      return `\n\n<div align="${align}">${body}</div>\n\n`
    },
  })

  // Bảng (table) viết tay vì turndown core không hỗ trợ
  td.addRule('tableKeep', {
    filter: ['table'],
    replacement: (_content, node) => {
      const table = node as HTMLTableElement
      const rows = Array.from(table.querySelectorAll('tr'))
      if (rows.length === 0) return ''
      const cellsOf = (tr: HTMLTableRowElement) =>
        Array.from(tr.querySelectorAll('th, td')).map((c) =>
          (c.textContent || '').trim().replace(/\|/g, '\\|').replace(/\n+/g, ' ')
        )
      const header = cellsOf(rows[0] as HTMLTableRowElement)
      const sep = header.map(() => '---')
      const body = rows.slice(1).map((r) => cellsOf(r as HTMLTableRowElement))
      const line = (cells: string[]) => `| ${cells.join(' | ')} |`
      return `\n\n${line(header)}\n${line(sep)}\n${body.map(line).join('\n')}\n\n`
    },
  })

  singleton = td
  return td
}

/** Chuyển HTML trong khung soạn thảo về Markdown để lưu file .md */
export function htmlToMarkdown(html: string): string {
  if (!html || !html.trim()) return ''
  const md = getTurndown()
    .turndown(html)
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return md
}
