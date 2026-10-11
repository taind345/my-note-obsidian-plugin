# SPEC — Plugin Obsidian "MyBook Notebook"

> Dùng trang vở vật lý MyBook (đúng 4 mảnh: `NotebookPage` + `NotebookTextBox` +
> `PageCanvas` + `PageImageLayer`) **ngay trong app Obsidian** cho file `.mynote.md`.
> Không bê cả app web (không sidebar/tab/markdown editor/split/settings).
> Đặc tả app gốc: xem `../SPEC.md`.

---

## 1. Phạm vi (scope)

**Có:**
- Mở `.mynote.md` bằng view vở: click file (tự chuyển view), chuột phải → *Mở bằng vở MyBook*,
  ribbon + command tạo vở mới / mở file đang xem.
- Đầy đủ tương tác vở: gõ/sửa textbox markdown, bút/tẩy/hình (native engine), paste +
  kéo-thả ảnh (lưu base64 trong file), marquee đa chọn, kéo nhóm, resize, khóa,
  nhân bản, Đưa lên/xuống, khung card, undo/redo (`Ctrl+Z/Y`), zoom + fit, thêm trang,
  autosave về file (debounce 1.2s), theo dõi rename/delete.
- Ảnh `![[...]]` trong chữ resolve qua Vault API (`resourcePath`).

**Không có (cố ý):**
- Sidebar, tab, markdown editor (Reading/Live/Simple), split view, QuickOpen, settings,
  theme pastel đầy đủ (giữ tone mặc định), export PDF, engine Excalidraw (stub báo rõ).

---

## 2. Cấu trúc package (`obsidian-plugin/`)

```
manifest.json          # id mybook-notebook, name, version 1.0.0, minAppVersion 0.15.0
package.json           # scripts: build / dev / typecheck / install-to-vault
tsconfig.json          # strict, jsx react-jsx, bundler (chỉ include file cần thiết)
esbuild.config.mjs     # bundle CJS + alias 1 bản React + stub excalidraw + css/file loaders
prepare-css.mjs        # copy App.css -> src/app.obsidian.css, strip url('/fonts|/doodles')
scope-css.mjs          # prefix mọi selector vào .mybook-obsidian-host -> styles.css
install-to-vault.mjs   # copy main.js/manifest.json/styles.css vào vault red
src/main.ts            # Plugin: view, lệnh, routing file, asset resolver (~390 dòng)
src/MyBookNotebook.tsx # state vở + history + toolbar + render pages (~500 dòng)
src/MiniToolbar.tsx    # tool vẽ + màu + nét + undo + zoom/fit + thêm trang (~120 dòng)
src/obsidian-overrides.css  # layout view + sticky toolbar + ẩn decor cần asset ngoài
src/excalidraw-stub.ts # thay engine Excalidraw (không ship 1MB+)
src/css.d.ts           # declare module '*.css' cho tsc
```

Build ra: `main.js` (~1.6MB), `styles.css` (~156KB). Deps bundle: react 19 (1 bản duy nhất
nhờ alias), lucide, markdown-it, katex, roughjs, idb-keyval. External: `obsidian`,
`electron`, codemirror/lezer.

---

## 3. Vòng đời view

```
click .mynote.md
  → Obsidian mở markdown view (đuôi sau chấm cuối là .md, registerExtensions không khớp)
  → event file-open → đợi 80ms cho view gán file xong
  → nếu đúng file + view markdown → setViewState MYBOOK + loadPath trực tiếp
  → parse JSON nhúng → createRoot → render (bọc ErrorBoundary hiện lỗi ra view)
Lưu: debounce 1.2s → vault.modify (đọc path mới nhất lúc lưu, theo dõi rename/delete)
Đóng: unmount root, clear path. setAssetResolver(null) khi unload plugin.
```

- `MyBookView.getState()/setState()` giữ `{file}` để Obsidian lưu/khôi phục layout.
- Tạo vở mới: thử `vault.create` thật, trùng tên thì tăng số (tối đa 100), tạo trong
  thư mục file đang mở → thư mục vở mở gần nhất → vault root.
- `openInMyBook` tự lái `view.loadPath()` sau `setViewState` (không trông chờ Obsidian
  gọi `setState`), mọi lỗi hiện Notice + console.

## 4. Nhận diện file vở

`isMyBookNote(app, file)` = đúng đuôi `.mynote.md` **HOẶC** frontmatter có key
`mybook-plugin` (trường hợp user đổi tên mất đuôi). Cố ý KHÔNG dùng marker
`excalidraw-plugin` (của plugin Excalidraw — xem §7).

## 5. Data flow (giống app gốc, scope 1 file)

```
.mynote.md --vault.read--> importNotebookFromMarkdown --> {meta, pages}
  --> state pages/meta/selections/history (MyBookNotebook)
  --> mutate (push history cap 30, mark dirty)
  --> debounce 1.2s --> exportNotebookToMarkdown --> vault.modify
```

- Ảnh paste: `FileReader` → dataURL, nằm dưới chữ/nét vẽ, undo được.
- Sắp xếp lớp: ảnh < nét vẽ < chữ; reorder trong cùng loại.
- Chữ trong textbox render qua `renderMarkdown` (chung code app gốc) + `setAssetResolver`
  trỏ sang `vault.getResourcePath`.

## 6. Styling

- `App.css` (5800 dòng app gốc) được **scope toàn bộ** vào `.mybook-obsidian-host`
  (`:root` → host giữ nguyên CSS variables; bỏ rule `html,body,#root`; giữ `@keyframes`;
  strip font/doodle URL tuyệt đối).
- `obsidian-overrides.css`: layout view (`height:100%`, flex column), scroll trang,
  toolbar **sticky trong khung cuộn**, ẩn decor cần asset ngoài (`sheet-watermark`,
  `frame-decor img`, doodles, underline asset) — washi gradient + sparkle text vẫn hiện
  vì không cần file ảnh.
- Font chữ trong vở: var `--font-cascadia` (scope host). Font Virgil/Patrick Hand rớt về
  fallback hệ thống nếu máy chưa cài.

## 7. Xung đột đã biết với plugin Excalidraw

- File vở **cũ** ghi frontmatter `excalidraw-plugin: parsed` sẽ bị Excalidraw cướp
  (`fileShouldDefaultAsExcalidraw`) và báo lỗi JSON. App mới xuất `mybook-plugin: parsed`.
  File cũ trong vault red đã migrate xong; vault khác thì đổi dòng đó là hết.
- Ngược lại, MyBook **không bao giờ** nhận file có marker `excalidraw-plugin` (chỉ nhận
  `mybook-plugin`) để tránh cướp vẽ của Excalidraw.

## 8. Verify

```bash
npm run build        # prepare-css + esbuild + scope-css
npm run typecheck    # tsc --noEmit
node install-to-vault.mjs   # copy vào red/.obsidian/plugins/mybook-notebook/
node /tmp/mybook-smoke.cjs  # smoke onload/onunload với Obsidian API giả lập
```
Rồi trong Obsidian: bật plugin → Reload (`Ctrl+P`) → mở 1 file `.mynote.md`.

## 9. Giới hạn đã biết (2026-10)

1. **Toolbar trôi khi cuộn — ĐÃ FIX (2026-10):** nguyên nhân là toolbar nằm TRONG
   khung cuộn nội bộ (`.mybook-pages-scroll`) + `sticky`, nhưng khi chuỗi
   `height:100%` gãy thì chính container Obsidian mới là thằng cuộn thật — khung
   trong cao bằng content, không cuộn bao giờ nên sticky vô tác dụng. Fix: đưa
   toolbar ra NGOÀI khung cuộn (con trực tiếp của `.mybook-notebook-view`,
   `position:sticky; top:0`) + mở `overflow` của `.mybook-obsidian-host` /
   `.mybook-notebook-view` thành `visible` để sticky bắt được scroll ngoài.
   Khung trong cuộn được → toolbar nằm yên (flex column); Obsidian cuộn cả view
   → sticky dính theo. Nếu tái phát, kiểm tra `overflow` chain trong DevTools
   Obsidian (`Ctrl+Shift+I`) xem phần tử nào scroll thật.
2. Canvas backing tối đa 3x (zoom to + màn hidpi rất lớn có thể hơi mờ khi zoom >200%).
3. Chưa virtualize: vở hàng chục trang + ảnh base64 nặng RAM (mỗi canvas 2x ~14–28MB).
4. Chưa có undo cho thao tác trong textbox đang gõ dở (dùng undo native của textarea).
5. Mobile chưa test (đánh dấu `isDesktopOnly: false` nhưng chưa verify cảm ứng).

## 10. Gợi ý clean/refactor tiếp (cho đợt dọn code)

Ưu tiên theo ROI cao → thấp:

1. **Chẻ `MyBookNotebook.tsx` (~500 dòng)** thành:
   - `useNotebookHistory(pages, pageIds)` — push/undo/redo snapshot
   - `usePageMutations(...)` — add/update/delete/duplicate/reorder text/drawing/image
   - `MyBookNotebook.tsx` chỉ còn render + toolbar wiring.
   - Tương tự `main.ts` (~390 dòng): tách `createObsidianAssetResolver(app)`,
     `openNotebookInLeaf(app, file)`, `findMarkdownLeaf(app, path)`.
2. **Dùng chung toolbar/config với app gốc**: `MiniToolbar` trùng ~70% `HeaderToolbar`
   (colors/widths/tools) — tách `tools-config.ts` + `ColorSwatches`/`WidthPicker` dùng chung.
3. **Zoom/pan logic** (`fitZoom`, scale coords trong `PageCanvas`) đã sửa ở app gốc
   (chia `displayScale`) — kiểm tra plugin đã hưởng chưa (dùng chung file nên có rồi),
   cân nhắc test matrix zoom × tool.
4. **CSS**: `App.css` 5800 dòng là gánh nặng bundle (styles.css 156KB) — tách file CSS
   theo module khi rảnh; xóa rule chết sau scope (VD: `.tab-new-dropdown` không dùng trong plugin).
5. **Test**: mở rộng smoke Node thành test thật: parse file mẫu (đã có script python check
   JSON), render 1 page bằng jsdom + assert số textbox/drawing; test `scope-css.mjs`
   (không rò selector trần, không mất rule).
6. Xóa `console.log('[MyBook] ...')` khi stable, hoặc gom vào flag `DEBUG`.
