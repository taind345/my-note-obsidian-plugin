import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const VAULT_PLUGINS = '/home/ti/Desktop/DATA_DESKTOP/0_Obsidian notebook/red/.obsidian/plugins/mynote'

const files = ['main.js', 'manifest.json', 'styles.css']

fs.mkdirSync(VAULT_PLUGINS, { recursive: true })
for (const f of files) {
  const src = path.join(__dirname, f)
  if (!fs.existsSync(src)) {
    console.warn(`skip (không có): ${f}`);
    continue
  }
  fs.copyFileSync(src, path.join(VAULT_PLUGINS, f))
  console.log(`installed: ${f}`)
}
console.log(`\nXong! Vào Obsidian → Settings → Community plugins → bật "MyBook Notebook" → Reload.`);
console.log(`Vault: ${VAULT_PLUGINS}`)
