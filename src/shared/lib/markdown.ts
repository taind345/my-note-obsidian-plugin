import MarkdownIt from 'markdown-it'
import katex from 'katex'
import { isTauri, resolveVaultAsset, tauriAssetUrl } from './tauriFs'

// Instantiate a single shared lightweight MarkdownIt instance
const md = new MarkdownIt({
  html: true, // Allow <u> and simple formatting tags
  xhtmlOut: false,
  breaks: true, // Soft line breaks become <br> to match physical notebook lines
  linkify: true,
  typographer: false, // Keep wikilinks and arrows intact
})

export interface MarkdownRenderOptions {
  currentFilePath?: string
  vaultDir?: string
  fileDir?: string
}

/**
 * Resolver ảnh ngoài (VD: Obsidian plugin resolve tên file vault -> resource URL).
 * Được ưu tiên trước mọi cách build URL mặc định. Trả null = fallback mặc định.
 */
let assetResolver: ((filename: string, fileDir?: string, vaultDir?: string) => string | null) | null = null

export function setAssetResolver(
  fn: ((filename: string, fileDir?: string, vaultDir?: string) => string | null) | null
): void {
  assetResolver = fn
}

/**
 * Resolve đường dẫn ảnh (data:, http:, app:, hoặc tên file trong vault) thành URL hiển thị được.
 */
export function resolveAssetUrl(src: string): string {
  if (!src) return ''
  if (
    src.startsWith('data:') ||
    src.startsWith('http://') ||
    src.startsWith('https://') ||
    src.startsWith('app://') ||
    src.startsWith('blob:')
  ) {
    return src
  }
  if (assetResolver) {
    const resolved = assetResolver(src)
    if (resolved) return resolved
  }
  return src
}

/**
 * Parses markdown to Obsidian-style HTML string with checkboxes,
 * wikilinks, embedded images, emerald green links, callouts, arrows, and code blocks.
 */
export function renderMarkdown(content: string, options?: MarkdownRenderOptions): string {
  if (!content) return ''

  const vaultDir =
    options?.vaultDir ||
    (typeof localStorage !== 'undefined' ? localStorage.getItem('mybook_vault_path') : '') ||
    '/home/ti/Desktop/DATA_DESKTOP/0_Obsidian notebook/red'

  const fileDirParam = options?.fileDir ? `&fileDir=${encodeURIComponent(options.fileDir)}` : ''

  // 1. Protect arrows ==> and -> so they aren't confused with highlights
  let processed = content.replace(/==>/g, '§§ARROW_DOUBLE§§')
  processed = processed.replace(/->/g, '§§ARROW_SINGLE§§')

  // 1b. Công thức toán LaTeX: $$khối$$ và $nội dòng$ (render bằng KaTeX, giữ tex gốc)
  const blockMaths: string[] = []
  const inlineMaths: string[] = []
  processed = processed.replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex: string) => {
    let html: string
    try {
      html = katex.renderToString(tex, { displayMode: true, throwOnError: false })
    } catch {
      html = `<code>${tex}</code>`
    }
    blockMaths.push(
      `<div class="math-src math-block" data-tex="${encodeURIComponent(tex)}">${html}</div>`
    )
    return `§§MATH_B_${blockMaths.length - 1}§§`
  })
  processed = processed.replace(/\$([^$\n]+?)\$/g, (_m, tex: string) => {
    let html: string
    try {
      html = katex.renderToString(tex, { displayMode: false, throwOnError: false })
    } catch {
      html = `<code>${tex}</code>`
    }
    inlineMaths.push(
      `<span class="math-src math-inline" data-tex="${encodeURIComponent(tex)}">${html}</span>`
    )
    return `§§MATH_I_${inlineMaths.length - 1}§§`
  })

  // 2. Protect highlights ==text== on a single line
  processed = processed.replace(/==([^\n=]+)==/g, '§§HL_START§§$1§§HL_END§§')

  // 3. Obsidian Image Embeds: ![[image.png]] or ![[image.png|300]]
  processed = processed.replace(/!\[\[(.*?)\]\]/g, (_match, inner) => {
    const clean = inner.trim()
    const parts = clean.split('|').map((s: string) => s.trim())
    const filename = parts[0]
    const sizeOrAlt = parts[1] || ''

    let widthVal = ''
    let heightVal = ''
    if (sizeOrAlt && /^\d+$/.test(sizeOrAlt)) {
      widthVal = `${sizeOrAlt}px`
    } else if (sizeOrAlt && /^(\d+)x(\d+)$/.test(sizeOrAlt)) {
      const [, w, h] = sizeOrAlt.match(/^(\d+)x(\d+)$/) || []
      widthVal = `${w}px`
      heightVal = `${h}px`
    }

    // Tauri (desktop app): resolve file thật trong vault -> asset URL; web: /api/fs/raw
    // Host khác (VD: plugin Obsidian) có thể đăng ký assetResolver riêng — ưu tiên nhất.
    let rawSrc: string
    const customSrc =
      assetResolver && assetResolver(filename, options?.fileDir, vaultDir)
    if (customSrc) {
      rawSrc = customSrc
    } else if (isTauri()) {
      const abs = resolveVaultAsset(filename, options?.fileDir, vaultDir)
      rawSrc = abs ? tauriAssetUrl(abs) : filename
    } else {
      rawSrc = `/api/fs/raw?path=${encodeURIComponent(filename)}&dir=${encodeURIComponent(vaultDir)}${fileDirParam}`
    }
    return `§§IMG_EMBED_START§§${rawSrc}§§IMG_SEP§§${filename}§§IMG_SEP§§${widthVal}§§IMG_SEP§§${heightVal}§§IMG_EMBED_END§§`
  })

  // 4. Protect wikilinks [[topic]]
  processed = processed.replace(/\[\[(.*?)\]\]/g, '§§WIKI_START§§$1§§WIKI_END§§')

  // Render markdown with markdown-it
  let html = md.render(processed)

  // Khôi phục công thức toán (đặt trước các restore khác để HTML katex nguyên vẹn)
  html = html.replace(/§§MATH_B_(\d+)§§/g, (_m, i) => blockMaths[Number(i)] || '')
  html = html.replace(/§§MATH_I_(\d+)§§/g, (_m, i) => inlineMaths[Number(i)] || '')

  // 5. Restore Image Embeds
  html = html.replace(
    /§§IMG_EMBED_START§§([\s\S]*?)§§IMG_SEP§§([\s\S]*?)§§IMG_SEP§§([\s\S]*?)§§IMG_SEP§§([\s\S]*?)§§IMG_EMBED_END§§/g,
    (_m, src, alt, widthVal, heightVal) => {
      let style = ''
      const w = widthVal ? widthVal.trim() : ''
      const h = heightVal ? heightVal.trim() : ''
      if (w) style += `width: ${w}; max-width: 100%; `
      if (h) style += `height: ${h}; `
      const styleAttr = style ? `style="${style}"` : ''
      return `<div class="obsidian-image-container"><img src="${src.trim()}" alt="${alt.trim()}" class="obsidian-embedded-image" ${styleAttr} /></div>`
    }
  )

  // 5.1. Regular markdown images: <img src="..." alt="...">
  html = html.replace(/<img\s+([^>]*?)src="([^"]+)"([^>]*?)>/gi, (match, prefix, src, suffix) => {
    if (match.includes('obsidian-embedded-image')) return match
    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:') || src.startsWith('/api/') || src.startsWith('asset://')) {
      return `<div class="obsidian-image-container"><img ${prefix}src="${src}"${suffix} class="obsidian-embedded-image" /></div>`
    }
    if (isTauri()) {
      const abs = resolveVaultAsset(src, options?.fileDir, vaultDir)
      const resolved = abs ? tauriAssetUrl(abs) : src
      return `<div class="obsidian-image-container"><img ${prefix}src="${resolved}"${suffix} class="obsidian-embedded-image" /></div>`
    }
    const customResolved = assetResolver && assetResolver(src, options?.fileDir, vaultDir)
    if (customResolved) {
      return `<div class="obsidian-image-container"><img ${prefix}src="${customResolved}"${suffix} class="obsidian-embedded-image" /></div>`
    }
    const cleanSrc = `/api/fs/raw?path=${encodeURIComponent(src)}&dir=${encodeURIComponent(vaultDir)}`
    return `<div class="obsidian-image-container"><img ${prefix}src="${cleanSrc}"${suffix} class="obsidian-embedded-image" /></div>`
  })

  // 4. Task lists / Checkboxes: - [ ] and - [x]
  html = html.replace(
    /<li>(?:\s*<p>)?\[ \]\s*([\s\S]*?)(?:<\/p>)?<\/li>/gi,
    '<li class="obsidian-task-item"><span class="obsidian-checkbox-box" role="checkbox" aria-checked="false"></span><span class="task-text">$1</span></li>'
  )
  html = html.replace(
    /<li>(?:\s*<p>)?\[x\]\s*([\s\S]*?)(?:<\/p>)?<\/li>/gi,
    '<li class="obsidian-task-item is-checked"><span class="obsidian-checkbox-box checked" role="checkbox" aria-checked="true">✓</span><span class="task-text task-done">$1</span></li>'
  )

  // 5. Obsidian Wikilinks: [[note-name]] — tối giản, không icon
  html = html.replace(
    /§§WIKI_START§§([\s\S]*?)§§WIKI_END§§/g,
    (_match, target) => {
      const cleanTarget = target.trim()
      const displayName = cleanTarget.includes('|') ? cleanTarget.split('|')[1].trim() : cleanTarget
      const linkTarget = cleanTarget.includes('|') ? cleanTarget.split('|')[0].trim() : cleanTarget
      return `<a href="${encodeURIComponent(linkTarget)}" class="obsidian-wikilink" data-wikilink="${linkTarget}">${displayName}</a>`
    }
  )

  // 6. Regular markdown links: [text](target) — tối giản, không icon
  html = html.replace(
    /<a\s+(?:[^>]*?\s+)?href="([^"]*)"([^>]*)>([\s\S]*?)<\/a>/gi,
    (match, href, extra, label) => {
      if (match.includes('obsidian-wikilink')) return match
      return `<a href="${href}" class="obsidian-link" data-link="${href}" ${extra}>${label}</a>`
    }
  )

  // 7. Obsidian Highlights: ==text==
  html = html.replace(
    /§§HL_START§§([\s\S]*?)§§HL_END§§/g,
    '<mark class="obsidian-highlight">$1</mark>'
  )

  // 8. Arrows: ==> and -> — giữ text gốc tối giản, không bọc span màu
  html = html.replace(/§§ARROW_DOUBLE§§/g, '==>')
  html = html.replace(/§§ARROW_SINGLE§§/g, '->')

  // 9. Code blocks: wrap with Obsidian code card header with copy button
  html = html.replace(
    /<pre><code(?:\s+class="language-(\w+)")?>([\s\S]*?)<\/code><\/pre>/gi,
    (_match, lang, code) => {
      const languageName = lang || 'code'
      return `
<div class="obsidian-code-card">
  <div class="code-card-header">
    <span class="code-card-lang">${languageName}</span>
    <button type="button" class="code-card-copy-btn" title="Copy code" onclick="navigator.clipboard.writeText(this.closest('.obsidian-code-card').querySelector('code').innerText)">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
    </button>
  </div>
  <pre><code>${code}</code></pre>
</div>`
    }
  )

  // 10. Callouts / Blockquotes
  html = html.replace(
    /<blockquote>\s*<p>([\s\S]*?)<\/p>\s*<\/blockquote>/gi,
    '<div class="obsidian-callout"><span class="callout-chevron">›</span><div class="callout-content">$1</div></div>'
  )

  return html
}
