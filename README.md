# MyNote: Digital-Paper Hybrid Notebook

A bounded-canvas (800×1100px) note-taking application combining freehand drawing, Markdown cards, and Obsidian-style vault file management. Runs on Web (Vite `/api/fs`) and Desktop (Tauri `plugin-fs`).

---

## Key Features

* **Analog Canvas:** Ink, highlighter, eraser, rough.js geometric shapes, 50-step undo/redo, 3D page flip, and multi-page/continuous scroll modes.
* **Markdown Cards:** Checklists, code blocks, tables, callouts, and `[[wikilinks]]` in draggable, resizable containers.
* **Selection & Stacking:** Multi-object selection, group movement, z-ordering (Bring to Front / Send to Back), and duplication.
* **Media:** Paste (`Ctrl+V`) or drag images placed beneath strokes and text for natural annotation.
* **Vault Workspace:** File tree management, split view, multi-tab layout, Quick Open (`Ctrl+O`), and PDF export.

## Key Shortcuts

| Shortcut | Action |
| --- | --- |
| `1–9`, `Q` | Switch / Lock tool |
| `Ctrl+S` | Quick save |
| `Ctrl+Z` / `Ctrl+Y` | Undo / Redo |
| `Ctrl+O` | Quick Open |
| `Ctrl+,` | Settings |
| `Ctrl+\` | Toggle sidebar |
| `Delete` / `Ctrl+D` / `Esc` | Delete / Duplicate / Deselect |

---

## Development & Build

### Web

```bash
cd /mnt/DATA_D/DESKTOP/DATA_DESKTOP/0-CODE/MY_NOTE
npm install
npm run dev # http://localhost:5173

```

### Desktop (Tauri)

**Prerequisites (Fedora):**

```bash
sudo dnf install -y webkit2gtk4.1-devel openssl-devel curl wget file \
  libappindicator-gtk3-devel librsvg2-devel libxdo-devel
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
export PATH="$HOME/.cargo/bin:$PATH"

```

**Build:**

```bash
npx tauri dev   # Live-reload desktop dev
npx tauri build # Outputs AppImage & DEB in src-tauri/target/release/bundle/

```

* Data persists directly in your local vault path and IndexedDB (`~/.local/share/com.mynote.desktop`).

---

## Obsidian Plugin

Enables native editing of `.mynote.md` files directly inside Obsidian.

```bash
cd obsidian-plugin
npm install
npm run build
npm run install-to-vault

```

1. Enable **my note** under **Settings → Community plugins** and reload Obsidian.
2. Ensure note frontmatter uses `mynote-plugin: parsed` to avoid conflicts with Excalidraw.

---

## Common Scripts

```bash
npm run dev      # Start dev server
npm run build    # Type-check and production build
npm run preview  # Preview dist build
npm run lint     # Run oxlint
npm run tauri    # Tauri CLI proxy

```
