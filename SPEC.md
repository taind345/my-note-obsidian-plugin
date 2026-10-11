# SPEC — Đặc tả kỹ thuật MyBook

> Sổ tay lai số & giấy: vở vật lý (vẽ tay + textbox markdown + ảnh paste) kết hợp
> quản lý file kiểu Obsidian vault. 1 codebase chạy 2 môi trường: web dev (`npm run dev`)
> và app desktop Tauri (`npx tauri build`).
> Tài liệu hướng dẫn sử dụng/build: xem `README.md`.

---

## 1. Tổng quan

| Mục | Nội dung |
|---|---|
| Mục tiêu | Ghi chú nhanh kiểu vở giấy thật, nhưng lưu file Markdown chuẩn, mở được bằng Obsidian |
| Nền tảng | Web (Vite dev server) + Desktop Linux (Tauri: `.AppImage` / `.deb`) |
| Ngôn ngữ | TypeScript + React 19, CSS thuần (1 file `App.css`), không UI framework |
| Trang giấy | Cố định 800×1100px (không canvas vô hạn) — nhẹ RAM, dễ xuất PDF đúng khổ |

---

## 2. Tech stack

| Lớp | Thư viện | Ghi chú |
|---|---|---|
| Build/dev | Vite 8, TypeScript ~6, oxlint | `tsc -b && vite build` |
| Vẽ tay | Canvas 2D + roughjs (nét vẽ tay), Excalidraw (lazy, engine dự phòng) | roughjs là dep trực tiếp |
| Markdown | markdown-it (render), turndown + rule riêng (HTML→MD cho chế độ Simple), KaTeX (công thức `$`/`$$`) | katex tách chunk riêng (~258KB, gzip 77KB) |
| Lưu trữ | idb-keyval (IndexedDB) + filesystem (xem §6) | autosave debounce |
| Desktop | Tauri v2 + plugin-fs + plugin-dialog | quyền FS giới hạn `$HOME/**` |
| PDF | jspdf + html-to-image, **dynamic import** (không nằm bundle chính) | mở modal mới tải |
| Icon | lucide-react | |

---

## 3. Kiến trúc tổng thể

```
┌────────────────────────────── App.tsx (state trung tâm) ──────────────────────────┐
│ Tabs (EditorTab[]) · Pages (PageData[]) · Meta · Tools · Selection · Vault · Theme │
└──────┬──────────────────┬───────────────────┬──────────────────┬───────────────────┘
       │                  │                   │                  │
  ObsidianSidebar   TabBar + Split      PureMarkdownEditor   NotebookPage (vở)
  (cây file, Open    QuickOpenModal      ├─ Reading (preview)  ├─ NotebookTextBox (chữ)
  Vault, CRUD)      SplitPicker         ├─ Live (block edit)  ├─ PageCanvas (vẽ+select)
                                         └─ Simple (WYSIWYG)  └─ PageImageLayer (ảnh)
                                                    │                    │
                                             UnifiedToolbar      (tương tác qua PageCanvas)
                        ┌─────────────────────┴──────────────────┴───────────────────┐
                        │ Services: storage (IDB) · vaultService (web/Tauri)          │
                        │ markdownFile (.mynote.md) · pdfExport · markdown · turndown │
                        └────────────────────────────────────────────────────────────┘
```

**Nguyên tắc state:**
- `App.tsx` giữ state thật duy nhất cho tab đang xem (pages/meta/selection), các pane mynote phụ
  (`SplitMynotePane`) giữ state riêng và đồng bộ về tab qua `onSync` (debounce 1.5s).
- Mọi đột biến nội dung đi qua handler có `pushHistory` (undo/redo, cap 50) + `markPageDirty`
  (autosave debounce 2s → IndexedDB, đồng thời ghi file vault nếu tab có `path`).
- Ba loại object trên trang độc lập nhưng chọn/kéo/xóa nhóm chung: `selectedTextBoxIds`,
  `selectedDrawingIds`, `selectedImageIds`. Sắp xếp lớp: **ảnh < nét vẽ < chữ** (z 3/4/5);
  "Đưa lên trên / Đưa xuống dưới" chỉ reorder trong cùng loại.

---

## 4. Mô hình dữ liệu (`src/types/notebook.ts`)

```ts
PageData        { id, pageNumber, pattern, textBoxes: TextBoxData[], drawings: DrawingElement[], images?: PageImageData[], updatedAt }
TextBoxData     { id, x, y, width, height?, content /*markdown*/, isEditing?, isLocked?, showFrame? }
PageImageData   { id, x, y, width, height, src /*dataURL|vault URL*/, name?, isLocked?, showFrame? }
DrawingElement  { id, type: pen|highlighter|line|arrow|rect|circle, points: Point[], x?, y?, width?, height?,
                  color, strokeWidth, opacity?, roughness?, fillColor?, strokeStyle?, isCurved?, isLocked?, seed? }
NotebookMetadata{ id, title, pageIds, createdAt, updatedAt, settings: { fontFamily, linePitch, theme, defaultPattern, ... } }
EditorTab       { id, path, title, mode: mynote|markdown|code, isDirty?, content?, notebookData? }
VaultFileItem   { name, path, isDirectory, ext, size, children? }
```

---

## 5. Định dạng file `.mynote.md` (tương thích Obsidian)

```
---
excalidraw-plugin: parsed
tags: [digital-notebook, excalidraw]
title: "..." | pageCount | updated (ISO)
---
# Page 1
<nội dung text thuần từng trang, cách nhau --->

%% # Digital Notebook Excalidraw Data
```json
{ type, version, source, meta, pages: [{ id, pageNumber, pattern, textBoxes, drawings, images, updatedAt }] }
```
%%
```

- Obsidian đọc được phần text thuần; app đọc khối JSON để dựng lại trang pixel-perfect
  (ảnh paste lưu base64 trong `images[].src`).
- `exportNotebookToMarkdown` / `importNotebookFromMarkdown` (`services/markdownFile.ts`).

---

## 6. Backend filesystem (2 môi trường, 1 API)

`services/vaultService.ts` tự chọn backend qua `isTauri()` (`__TAURI_INTERNALS__`):

| Hàm | Web dev (`vite.config.ts` plugin `/api/fs/*`) | Tauri (`plugin-fs`) |
|---|---|---|
| `listVault` | GET `/list?dir=` (cây sâu 6) | `readDir` đệ quy tay, sâu 6, ẩn dot/node_modules |
| `readFileFromVault` | GET `/read?path=` | `exists` + `readTextFile` |
| `writeFileToVault` | POST `/write` (tự tạo dir) | `mkdir -p` + `writeTextFile` |
| `createVaultItem` | POST `/create` (409 nếu trùng) | như trên |
| `deleteVaultItem` | POST `/delete` (đệ quy) | `remove(recursive)` |
| `renameVaultItem` | POST `/rename` | `rename` |

- Ảnh vault trong Markdown: web dùng `/api/fs/raw` (tự tìm file theo tên trong vault);
  Tauri resolve qua index tên→path (`utils/tauriFs.setVaultFileIndex`, App cập nhật mỗi khi
  `vaultItems` đổi) rồi ra URL `asset://` (`assetProtocol.scope: $HOME/**`).
- Modal Open Vault trả `boolean` để báo lỗi đường dẫn; nút **Browse...** (chỉ Tauri) dùng
  `plugin-dialog` (`dynamic import` → không vào bundle web).
- Quyền Tauri (`capabilities/default.json`): `core:default`, `dialog:default`, fs
  read/write/remove/rename/mkdir/exists/stat/copy — tất cả scope `$HOME/**`.

---

## 7. Markdown pipeline (`utils/markdown.ts`)

```
raw ─▶ protect ==> / -> ─▶ protect $math$ (KaTeX→HTML, giữ tex gốc trong data-tex)
    ─▶ image ![[a|300]] ─▶ wikilink [[a]] ─▶ markdown-it (html, breaks, linkify)
    ─▶ restore embeds/images ─▶ task checkbox ─▶ wikilink/link (tối giản, không icon)
    ─▶ highlight == == ─▶ arrows (text gốc) ─▶ code-card ─▶ callout ─▶ HTML
```

- Chiều ngược (Simple/WYSIWYG → `.md`): `utils/htmlToMarkdown.ts` — turndown + rule riêng
  cho từng construct Obsidian (wikilink `data-wikilink`, task `- [x]`, `==hl==`, `<u>`,
  code-card, callout→`>`, bảng tay, căn lề, màu chữ, `data-tex`→`$...$`).
- Live editor parse từng dòng có **cache Map theo nội dung** (cap 2000) — gõ 1 dòng chỉ
  parse lại dòng đó.

---

## 8. Editor Markdown (3 mode)

| Mode | Mô tả |
|---|---|
| Reading | Preview đẹp khổ 760px (typography Obsidian-like), click checkbox/link trực tiếp |
| Live (mặc định) | Block editor: dòng có con trỏ hiện source, còn lại render; Enter tách dòng, Backspace nối dòng, ↑↓ nhảy dòng, code fence render nguyên khối (click sửa cả khối), undo/redo riêng 100 bước (`Ctrl+Z/Y`), gợi ý `[[...]]` |
| Simple | WYSIWYG `contentEditable` + 1 toolbar chung, auto convert về Markdown (debounce 600ms) |

`UnifiedToolbar` duy nhất cho Live+Simple (con đăng ký handler qua ref, cha điều phối);
Live ẩn nút màu/căn lề/undo-riêng. Header: tiêu đề trái, cụm mode căn giữa, Save sát phải
kèm menu **Save as PDF** (in qua iframe ẩn).

---

## 9. Vở vật lý (NotebookPage)

- **TextBox**: click chọn, double-click sửa (chế độ bút: click chỉ chọn), grip kéo, resize,
  menu chuột phải (khóa/nhân bản/**khung card**/xóa), kéo nhóm multi-select, `Esc` thoát edit
  ở tool text thì về select. Chế độ bút/vẽ **khóa tạm thời** mọi textbox (chỉ vẽ).
- **PageCanvas**: 2 canvas (tĩnh rough.js + preview rAF), select đơn/nhóm (marquee + Shift),
  kéo nhóm xuyên loại, resize/endpoint handles, menu Đưa lên/xuống, tẩy xóa cả ảnh,
  double-click tạo textbox. Redraw tĩnh throttle theo frame.
- **Ảnh paste**: `Ctrl+V` (cả khi focus ngoài trang) / kéo-thả / nút Ảnh → đúng tọa độ con trỏ
  (chuẩn hóa zoom), mặc định nằm đáy layer, resize giữ tỉ lệ, khung card tùy chọn.
- Context menu dùng portal ra `body` (tránh lệch tọa độ do `transform` của trang giấy).

---

## 10. Vault & Tab & Split

- Sidebar: cây thư mục (mở/đóng nhớ localStorage), lọc tên, CRUD + rename, đặt vault root,
  refresh; trượt mượt 0.28s (luôn mount, collapsed = width 0).
- Tab: mở file (trùng path thì activate), tab trắng 3 loại, dirty dot.
- Split view: nút chia → panel phải gọn (list tab mở + tìm file + tạo tab mới cho pane phải);
  mynote pane phải state độc lập, luôn cuộn dọc; 2 pane không bao giờ trùng tab.
- Quick Open (`Ctrl+O`): fuzzy subsequence, ↑↓/Enter/Esc; nút `+` trên tab bar cũng mở nó
  (kèm 3 hàng tạo tab mới khi chưa gõ).

---

## 11. Theme & font

- `AppTheme = default | pastel`, đổi ở Settings → General, lưu `localStorage`, class
  `theme-pastel` trên root. Pastel: nền kem, caro periwinkle, pill bo tròn, washi tape,
  doodle/watermark asset thật (`public/doodles/`, ~400KB).
- Khung card đồng bộ theme: mặc định = card trắng tối giản; pastel = + washi/mèo/lá/gạch chân.
- Font riêng từng loại file (Settings, mặc định Cascadia Code, lưu localStorage):
  markdown (reading/live/simple), mynote (đồng bộ vào `meta.settings`), code.

---

## 12. Phím tắt

`1–9` tools · `Q` khóa tool · `Ctrl+S` lưu · `Ctrl+Z/Y` undo/redo (mynote) ·
`Ctrl+O` quick open · `Ctrl+,` settings · `Ctrl+\` sidebar · `Delete/Backspace`,
`Ctrl+D`, `Esc` cho vùng chọn · Trong live: Enter/Shift+Enter, Backspace nối dòng, `[[` gợi ý.
Toàn bộ nhóm chính tùy biến được trong Settings (lưu localStorage).

---

## 13. Hiệu năng (đã áp dụng + đã dọn)

- Không canvas vô hạn: trang cố định, unmount khi lật trang; undo cap 50/100.
- Debounce mọi đường gõ: markdown 120ms, autosave 1.2–2s, convert 600ms, undo-commit 800ms.
- Cache HTML theo dòng (Live), `React.memo` textbox/selection, `useMemo` flatten vault.
- Canvas tĩnh redraw tối đa 1 lần/frame; preview vẽ rough.js tách khỏi preview nét đang vẽ.
- Code-split: Excalidraw (~1MB), jspdf+html-to-image (chỉ khi mở export), katex chunk riêng
  (~259KB), plugin-dialog dynamic import. Bundle chính gzip ~260KB.
- Đã xóa (audit knip 2026-09): `simplification.ts`, `createDefaultNotebook`, `searchVault`,
  `throttleRAF`, `snapYToLine/snapXToMargin`, `drawCalligraphyStroke`, `catch (_)` → `catch`,
  hook conditional trong `ExportPdfModal`, CSS `.vault-error-banner` trùng, dep `roughjs`
  khai báo trực tiếp (trước đó ăn ké excalidraw).
- Lint: `oxlint` 0 error (~40 warning style cũ: exhaustive-deps, set-state-in-effect...).

---

## 14. Build & phát hành

```bash
npm install && npm run dev        # web dev :5173 (giữ port cho Tauri)
npm run build                     # tsc + vite → dist/
npx tauri dev                     # app live-reload
npx tauri build                   # → src-tauri/target/release/bundle/{deb,appimage}/
```

- Lần đầu Tauri cần: `webkit2gtk4.1-devel openssl-devel curl wget file
  libappindicator-gtk3-devel librsvg2-devel libxdo-devel` (Fedora) + Rust (`rustup`, profile minimal).
- Dữ liệu người dùng nằm ngoài app (thư mục vault + IndexedDB
  `~/.local/share/com.mybook.desktop`) nên build/cài đè không mất note.

---

## 15. Cấu trúc file

```
src/
  main.tsx                # entry (StrictMode + App + index.css + katex css)
  App.css                 # entry CSS duy nhất (@import styles/01–13 theo đúng cascade cũ)
  styles/01–13-*.css      # CSS tách từ file 5800 dòng (tokens/header/workspace/textbox/
                          # markdown/canvas-navigator/export-sidebar/modals-tabs/editors/
                          # stroke-settings/split-quickopen/reading-live-simple/frame-images)
  app/App.tsx             # orchestrator: tabs/split/shortcuts/autosave (đã bóc hooks/components)
  app/hooks/useVault.ts   # vault path/items/refresh/flatten/index Tauri
  app/components/MynoteWorkspace.tsx  # render vở (HeaderToolbar + NotebookPage + Navigator)
  app/lib/page-view.ts    # getVisiblePages (spread anchor chẵn / vertical / single)
  features/notebook/      # NotebookPage · PageCanvas · NotebookTextBox · PageImageLayer ·
                          # ExcalidrawPageCanvas · SplitMynotePane + hooks/useNotebookHistory
  features/markdown/      # PureMarkdownEditor · LivePreviewEditor · SimpleEditor · CodeEditor ·
                          # toolbar/UnifiedToolbar + toolbar/ObsidianMarkdownToolbar
  features/vault/         # ObsidianSidebar
  features/workspace/     # TabBar · QuickOpenModal (+fuzzyScore) · SplitPicker · NewFileLinkModal
  shared/types/notebook.ts# mọi model dữ liệu (§4)
  shared/lib/             # debounce · lineSnap · fonts · tauriFs · markdown · htmlToMarkdown ·
                          # selection · smoothing · imagePaste · shortcuts · tools-config
  shared/ui/              # HeaderToolbar · PageNavigator · SettingsModal · ThemeDoodles ·
                          # ExportPdfModal · ColorSwatches · WidthPicker (dùng chung app+plugin)
  services/               # storage (IDB) · vaultService · markdownFile · pdfExport
vite/plugin-local-fs.ts  # plugin /api/fs cho `npm run dev` (tách từ vite.config.ts)
```
Import tuyệt đối `@/...` → `src/...` (vite alias + tsconfig paths);
mỗi feature có `index.ts` barrel để thêm component mới không sửa import cũ.
src-tauri/                # tauri.conf.json · capabilities · icons · main.rs
public/doodles/           # asset theme pastel · public/fonts (Cascadia, Virgil)
demo/theme1/              # ảnh mẫu + asset gốc của designer (không ship app)
```

## 16. Giới hạn đã biết

- Live: bảng/table nhiều dòng và display-math `$$` nhiều dòng render theo từng dòng
  (Reading view vẫn đúng); căn lề/màu chữ trong Simple có thể mất khi qua vòng convert hiếm.
- Paste ảnh clipboard cần focus trong app; undo của vở và của markdown là 2 stack riêng.
- Vault ngoài `$HOME` cần nới `scope` trong `capabilities/default.json` + `assetProtocol`.

## 17. Plugin Obsidian — MyBook Notebook (`obsidian-plugin/`)

Đóng gói đúng 4 mảnh vẽ trong sơ đồ của bạn (NotebookPage + TextBox + PageCanvas +
PageImageLayer) thành plugin Obsidian, mở file `.mynote.md` bằng vở vật lý đầy đủ
tương tác, lưu trực tiếp qua Vault API (debounce 1.2s).

```
obsidian-plugin/
  manifest.json · package.json · tsconfig.json
  esbuild.config.mjs   # bundle CJS, 1 bản React duy nhất (alias root), stub excalidraw
  prepare-css.mjs       # strip url('/fonts|/doodles') tuyệt đối khỏi App.css
  scope-css.mjs         # prefix toàn bộ selector vào .mybook-obsidian-host
  install-to-vault.mjs  # copy main.js/manifest.json/styles.css vào vault
  src/main.ts           # Plugin: registerView + registerExtensions(['mynote.md'])
                        # + ribbon/lệnh tạo vở + mở file + assetResolver ảnh vault
  src/MyBookNotebook.tsx# state pages/meta/selection/undo riêng, autosave, MiniToolbar
  src/MiniToolbar.tsx   # tool vẽ + màu + nét + undo + zoom + thêm trang
  src/obsidian-overrides.css  # layout view + ẩn decor cần asset ngoài
```

- `services/vaultService.ts` có interface `VaultBackend` + `setVaultBackend()` để host khác
  cắm backend riêng (plugin hiện tại dùng Vault API trực tiếp, không qua service này).
- `utils/markdown.ts` có `setAssetResolver()` — plugin resolve `![[ảnh]]` bằng
  `vault.getResourcePath()`; ảnh paste (base64 trong JSON) chạy mọi nơi không cần backend.
- CSS bundle được scope để không rò ra UI Obsidian (bỏ rule `html,body,#root`; `:root`
  thành host; `@keyframes` giữ nguyên); font/doodle asset ngoài bị strip + ẩn.
- Verify: `tsc --noEmit`, esbuild build, smoke-test `onload/onunload` với Obsidian API
  giả lập. Chưa test click thật trong Obsidian GUI — bật plugin và thử tạo/sửa 1 vở.
