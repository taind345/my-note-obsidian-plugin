/**
 * Scope toàn bộ CSS bundle của app vào `.mybook-obsidian-host` để không rò rỉ
 * ra UI Obsidian (đặc biệt rule `*` và `html, body, #root`).
 * Đọc main.css (esbuild output) -> ghi styles.css (Obsidian tự load).
 *
 * Quy tắc:
 * - selector `:root` -> `.mybook-obsidian-host` (giữ nguyên CSS variables)
 * - rule `html, body, #root` -> BỎ (sẽ phá layout Obsidian)
 * - selector thường (kể cả nhiều dòng, nhiều selector phẩy) -> prefix từng cái
 * - @font-face: giữ, nhưng strip url('/fonts/...') (font không ship theo plugin)
 * - @keyframes: giữ nguyên, KHÔNG prefix selector from/to/%
 * - @media: giữ wrapper, prefix rule bên trong
 * - Cuối file append obsidian-overrides.css
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const HOST = '.mybook-obsidian-host'

function stripFontUrls(css) {
  // Bỏ url('/fonts/...') tuyệt đối (không tồn tại trong Obsidian), giữ local(...)
  return css
    .replace(/,\s*url\('\/fonts\/[^']*'\)\s*format\('[^']*'\)/g, '')
    .replace(/src:\s*url\('\/fonts\/[^']*'\)\s*format\('[^']*'\);/g, 'src: local("sans-serif");')
}

function splitTopCommas(s) {
  const parts = []
  let depth = 0
  let quote = null
  let cur = ''
  for (let k = 0; k < s.length; k++) {
    const c = s[k]
    if (quote) {
      cur += c
      if (c === quote) quote = null
    } else if (c === '"' || c === "'") {
      quote = c
      cur += c
    } else if (c === '(' || c === '[') {
      depth++
      cur += c
    } else if (c === ')' || c === ']') {
      depth = Math.max(0, depth - 1)
      cur += c
    } else if (c === ',' && depth === 0) {
      parts.push(cur)
      cur = ''
    } else {
      cur += c
    }
  }
  parts.push(cur)
  return parts
}

function prefixSelectors(selectorText) {
  return splitTopCommas(selectorText)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      if (s === ':root') return HOST
      // Bỏ rule trỏ ra ngoài host
      if (/^(html|body|#root)\b/.test(s)) return null
      if (s.startsWith(HOST)) return s
      return `${HOST} ${s}`
    })
    .filter(Boolean)
    .join(',\n')
}

function scopeCss(css) {
  let out = ''
  let i = 0
  const n = css.length

  const skipComment = () => {
    const end = css.indexOf('*/', i + 2)
    const comment = end === -1 ? css.slice(i) : css.slice(i, end + 2)
    i = end === -1 ? n : end + 2
    return comment
  }

  // Đọc 1 rule/block từ vị trí i, trả về. Dùng đệ quy cho @media.
  function readBlock(inKeyframes) {
    // Bỏ whitespace đầu, giữ lại
    let leading = ''
    while (i < n && /\s/.test(css[i])) {
      leading += css[i]
      i++
    }
    if (i >= n) return leading
    if (css.startsWith('/*', i)) {
      return leading + skipComment()
    }
    if (css[i] === '@') {
      // Đọc header @... tới { hoặc ;
      let header = ''
      while (i < n && css[i] !== '{' && css[i] !== ';') {
        header += css[i]
        i++
      }
      const name = header.trim().split(/\s+/)[0].toLowerCase()
      if (i < n && css[i] === ';') {
        i++
        return leading + header + ';'
      }
      i++ // qua {
      if (name === '@keyframes' || name.startsWith('@-')) {
        // Giữ nguyên toàn bộ keyframes (from/to/% không prefix)
        let depth = 1
        let body = ''
        while (i < n && depth > 0) {
          if (css.startsWith('/*', i)) {
            body += skipComment()
            continue
          }
          if (css[i] === '{') depth++
          if (css[i] === '}') depth--
          if (depth > 0) body += css[i]
          i++
        }
        return leading + header + ' {' + body + '}'
      }
      // @media / @supports...: prefix rule con
      let inner = ''
      while (i < n) {
        while (i < n && /\s/.test(css[i])) {
          inner += css[i]
          i++
        }
        if (i >= n) break
        if (css.startsWith('/*', i)) {
          inner += skipComment()
          continue
        }
        if (css[i] === '}') {
          i++
          break
        }
        inner += readBlock(false)
      }
      return leading + header + ' {' + inner + '}'
    }
    // Rule thường: đọc selector tới {
    let sel = ''
    while (i < n && css[i] !== '{') {
      if (css.startsWith('/*', i)) {
        sel += skipComment()
        continue
      }
      sel += css[i]
      i++
    }
    // Tách comment khỏi selector để prefix
    const parts = sel.split(/(\/\*[\s\S]*?\*\/)/g)
    const selOnly = parts
      .filter((_, idx) => idx % 2 === 0)
      .join(' ')
      .trim()
    if (i < n && css[i] === '{') i++
    // Đọc body tới } đóng (cân bằng ngoặc vì có thể có data-uri chứa {})
    let depth = 1
    let body = ''
    while (i < n && depth > 0) {
      if (css.startsWith('/*', i)) {
        body += skipComment()
        continue
      }
      if (css[i] === '{') depth++
      if (css[i] === '}') depth--
      if (depth > 0) body += css[i]
      i++
    }
    const prefixed = inKeyframes ? selOnly : prefixSelectors(selOnly)
    if (!prefixed) return leading // rule bị loại (html/body/#root)
    return leading + prefixed + ' {' + body + '}'
  }

  let result = ''
  while (i < n) {
    result += readBlock(false)
  }
  return result
}

const mainCssPath = path.join(__dirname, 'main.css')
if (!fs.existsSync(mainCssPath)) {
  console.error('main.css chưa có — chạy esbuild trước (node esbuild.config.mjs)')
  process.exit(1)
}

let css = fs.readFileSync(mainCssPath, 'utf-8')
css = stripFontUrls(css)
css = scopeCss(css)

const overridesPath = path.join(__dirname, 'src', 'obsidian-overrides.css')
if (fs.existsSync(overridesPath)) {
  css += '\n\n/* ===== obsidian-overrides.css ===== */\n' + fs.readFileSync(overridesPath, 'utf-8')
}

fs.writeFileSync(path.join(__dirname, 'styles.css'), css)
console.log('styles.css written (scoped under .mybook-obsidian-host)')
