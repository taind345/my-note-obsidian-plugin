/**
 * Chuẩn bị App.css cho plugin: copy sang src/app.obsidian.css, loại bỏ mọi
 * url('/...') tuyệt đối (fonts/doodles không ship theo plugin, esbuild không
 * resolve được). Decor cần asset đã bị CSS override ẩn (xem obsidian-overrides.css).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const stylesDir = path.join(__dirname, '..', 'src', 'styles')
let src = ''
if (fs.existsSync(stylesDir)) {
  // CSS thật đã tách thành styles/01–13 — concat theo thứ tự để giữ cascade
  const files = fs.readdirSync(stylesDir).filter((f) => f.endsWith('.css')).sort()
  src = files.map((f) => fs.readFileSync(path.join(stylesDir, f), 'utf-8')).join('\n')
} else {
  // Fallback file gộp cũ
  src = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.css'), 'utf-8')
}

let css = src
// 1. @font-face chỉ còn local(...) — giữ nguyên font stack fallback
css = css.replace(/,\s*url\('\/fonts\/[^']*'\)\s*format\('[^']*'\)/g, '')
css = css.replace(/src:\s*url\('\/fonts\/[^']*'\)\s*format\('[^']*'\);/g, 'src: local("sans-serif");')
// 2. Mọi url('/...') tuyệt đối còn lại (doodles) -> none (phần tử chứa đã bị ẩn)
css = css.replace(/url\('\/[^']*'\)/g, 'none')

fs.writeFileSync(path.join(__dirname, 'src', 'app.obsidian.css'), css)
console.log('app.obsidian.css prepared (absolute urls stripped)')
