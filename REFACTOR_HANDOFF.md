# HANDOFF — Refactor MyBook (cho AI session mới)

> Đọc file này TRƯỚC khi đụng code. Vi phạm các bất biến bên dưới = regression
> đã từng mất nhiều turn để fix. Spec chi tiết: `SPEC.md`, `obsidian-plugin/SPEC.md`.

## 0. Bối cảnh nhanh

- Repo: `/mnt/DATA_D/DESKTOP/DATA_DESKTOP/0-CODE/MY_BOOK` (**chưa có git** — nên `git init` + commit trước khi refactor!).
- Stack: React 19 + Vite 8 + TS strict (`tsc -b` chặn `noUnusedLocals`), CSS 1 file `src/App.css` (~5800 dòng).
- 2 sản phẩm chung 1 `src/`: app web/Tauri + plugin Obsidian (`obsidian-plugin/`, bundle CJS).
- Vault thật của user: `/home/ti/Desktop/DATA_DESKTOP/0_Obsidian notebook/red` (plugin đã cài ở `.obsidian/plugins/mybook-notebook/`).
- Môi trường: Fedora 44, Node 22, Rust đã cài (`~/.cargo/bin`), thiếu gói `-devel` nếu build Tauri từ đầu.
- Lệnh verify sau MỖI sửa đổi: root `npx tsc -b && npm run build`; plugin `npx tsc --noEmit -p tsconfig.json && npm run build && node install-to-vault.mjs && node /tmp/mybook-smoke.cjs`.
- Tool bash đôi khi lỗi `FileSystem.access` transient với workdir lạ — retry hoặc dùng workdir project root (đường dẫn tuyệt đối cho read/edit/write luôn ổn).

## 1. BẤT BIẾN — cấm phá vỡ

1. **1 bản React duy nhất trong plugin.** `esbuild.config.mjs` alias `react`/`react-dom`
   về root `node_modules`. Không `npm i react` trong `obsidian-plugin/`.
2. **CSS plugin phải scope.** Mọi selector trong `App.css` được `scope-css.mjs` prefix
   `.mybook-obsidian-host`, bỏ rule `html,body,#root`, strip `url('/fonts|/doodles')`.
   Không import CSS trần vào plugin.
3. **Context menu dùng portal ra `document.body`.** Trang giấy có `transform`
   (tạo containing block) làm `position:fixed` trong sheet bị lệch tọa độ — trang phải
   từng bị hẳn. File: `NotebookTextBox.tsx`, `PageCanvas.tsx`.
4. **Selection wrappers là forward thuần túy.** `NotebookPage` KHÔNG tự xóa chéo loại khác
   trong `onSelectElements/onSelectImages` (từng gây bug marquee xóa kết quả lẫn nhau).
   Mọi điểm chọn đơn trong `PageCanvas` đã clear tường minh.
5. **`App.handleSelectDrawingId` là replace-semantics** (`setSelectedDrawingIds([id])`).
   Đừng gọi nó khi đang giữ multi-selection (sẽ sập nhóm) — các nhánh multi trong
   `PageCanvas` đã tránh, giữ nguyên.
6. **Marquee dùng ref (`marqueeStartRef`), không dùng state** ở pointerup (tránh stale closure).
7. **Obsidian view lifecycle:** `leaf.getViewState().state` KHÔNG đáng tin (Obsidian đọc qua
   `view.getState()`). Luồng đúng: `setViewState({state:{file}})` → `view.setState(state)`
   → `loadPath(path)` + `getState()` trả `{file}`; `openInMyBook` tự lái `loadPath` trực tiếp.
8. **Frontmatter vở là `mybook-plugin: parsed`.** Marker cũ `excalidraw-plugin:` khiến plugin
   Excalidraw cướp file (`fileShouldDefaultAsExcalidraw`) và báo lỗi JSON. Detect mode trong
   `vaultService.detectEditorMode` phải nhận CẢ hai marker (file cũ vẫn mở được).
   Đừng bao giờ ghi lại marker cũ (plugin bundle cũ từng revert migration qua autosave).
9. **Tọa độ chuột luôn chia display scale khi zoom** (`displayScale()` trong `lineSnap.ts`):
   áp dụng cho `getCanvasCoords`, resize handles (canvas + ảnh), grip/resize textbox,
   `createTextBoxAt`. Quên chỗ nào là chỗ đó lệch khi zoom ≠ 1.
10. **Grip textbox chỉ `onSelect` khi chưa selected** (giữ nhóm khi kéo).
11. **Pen mode khóa textbox** (`.no-interact` + chặn menu/phím canvas khi `activeTool !== 'select'`).
12. **Autosave echo không được reset viewMode** (`lastFileRef` trong `PureMarkdownEditor`;
    từng gây bug Simple nhảy về Live mỗi 1.2s).
13. **Paste ảnh chống double** (`handledPasteAtRef` giữa onPaste React + window listener).
14. **Không `setState` trong render; không hook trong hàm render có điều kiện**
    (`renderMynoteWorkspace`); multi-select dùng mảng, phần tử [0] là primary.
15. **`useFitScale.ts` ĐÃ XÓA** — thay bằng tính toán tường minh (history: nhiều vòng fix
    layout gây thêm lỗi; user yêu cầu rollback toàn bộ scale, hiện tại chỉ còn zoom tay).
    Đừng reintroduce auto-fit nếu chưa đọc kỹ mục 3 bên dưới.

## 2. Bug đang mở (chưa fix, đừng nhận là xong)

- ~~**Toolbar plugin trôi khi cuộn**~~ — **ĐÃ FIX 2026-10-11**: toolbar chuyển ra ngoài
  `.mybook-pages-scroll` (con trực tiếp của `.mybook-notebook-view`, sticky top:0) +
  `.mybook-obsidian-host`/`.mybook-notebook-view` về `overflow: visible` để sticky bắt
  được scroll ngoài của Obsidian. Đã cài vào vault red (install-to-vault), cần Reload
  Obsidian để kiểm chứng tay: mở vở 2+ trang, cuộn giữa trang 2 xem toolbar còn không.

## 3. Thứ tự refactor gợi ý (ROI cao → thấp) — cập nhật 2026-10-11

ĐÃ XONG (đừng làm lại):
- `tools-config.ts` + `ColorSwatches`/`WidthPicker` dùng chung app + plugin.
- Xóa `console.log('[MyBook]...')` debug (giữ `console.error`).
- `getElementSeed` dùng chung (preview/static/export cùng seed, không morph).
- PDF: `renderNotebookPdf` (trả bytes) + `exportPageRender.renderOffscreenPageSheet`
  (có ảnh paste + canvas backing theo resolution + rough giống màn hình);
  `ExportPdfModal` thêm props `portalTarget`/`mountRoot`/`onSavePdf`/`filename`.
- Backing canvas hợp nhất preview/static (`canvasBackingScale`, max 4x).

CÒN LẠI:
1. Chẻ `obsidian-plugin/src/MyBookNotebook.tsx` (~520 dòng) → `useNotebookHistory` ver
   plugin + `usePageMutations` hooks; `main.ts` tách asset-resolver/open-helpers
   (lưu ý: `main.ts` giờ thêm `onSavePdf` + command export — tách thì mang theo).
2. CSS: xóa rule chết sau scope (VD `.tab-new-dropdown`); `SPEC.md` §13 liệt kê
   những gì đã dọn (đừng dọn lại).
3. Mở rộng smoke Node thành test thật (parse file mẫu, scope-css không rò selector).
4. KHÔNG đụng: format `.mynote.md`, `VaultBackend` interface, `MarkdownRenderOptions.resolveAsset`.

## 4. Lệnh nhanh

```bash
npx tsc -b --force && npm run build          # root: typecheck + web build
npx oxlint src/                              # 0 error (còn ~40 warning style cũ, kệ)
cd obsidian-plugin && npx tsc --noEmit -p tsconfig.json && npm run build && node install-to-vault.mjs
node /tmp/mybook-smoke.cjs                   # smoke onload/onunload (stub trong file)
```
Reload Obsidian sau mỗi lần cài plugin (`Ctrl+P` → Reload app). Bật `?debugfit=1` đã XÓA
rồi (đừng tìm). Muốn debug layout: DevTools `Ctrl+Shift+I` trong Obsidian/Electron.
