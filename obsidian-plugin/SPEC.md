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
- Xuất PDF: nút Download trên toolbar + command *Xuất vở đang mở ra PDF* (modal
  chọn độ phân giải/phạm vi dùng chung `ExportPdfModal`, file lưu cạnh vở,
  tên trùng tự tăng số).

**Không có (cố ý):**
- Sidebar, tab, markdown editor (Reading/Live/Simple), split view, QuickOpen, settings,
  theme pastel đầy đủ (giữ tone mặc định), engine Excalidraw (stub báo rõ).

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
src/MiniToolbar.tsx    # tool vẽ + màu + nét + undo + zoom/fit + thêm trang + xuất PDF
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
click .mynote.md (hoặc openLinkText / quick switcher)
  → Monkey-patch đồng bộ trên `WorkspaceLeaf.prototype.setViewState` (chuẩn Excalidraw) chặn trước frame 0:
      1. BẤT BIẾN 1 file = 1 leaf vở: nếu file đã có leaf vở đang mở, chỉ chuyển focus về đó
         (setActiveLeaf {focus: true}) + dọn tab rỗng vừa tạo (nếu có); KHÔNG bao giờ đẻ tab trùng.
      2. Nếu file chưa mở: đổi thẳng viewState.type = "mybook-notebook".
         → Obsidian trực tiếp khởi tạo MyBookView, MarkdownView hoàn toàn KHÔNG bao giờ được tạo hay vẽ.
         → Tab header sinh ra là có sẵn icon "notebook-pen" và tên vở ngay từ frame đầu tiên (không chớp icon/title).
  → MyBookView.setState(state) → loadPath(state.file) (ngưỡng 80ms không chớp text loading)
  → parse JSON nhúng → createRoot → render (bọc ErrorBoundary hiện lỗi ra view)
Lưu: debounce 1.2s → vault.modify (đọc path mới nhất lúc lưu, theo dõi rename/delete)
Đóng: unmount root, clear path. setAssetResolver(null) khi unload plugin.
```

- `MyBookView.getState()/setState()` giữ `{file}` để Obsidian lưu/khôi phục layout.
- Tạo vở mới (`note_1.mynote.md`, trùng thì `note_2...`, lấp số trống, tối đa 100 lần thử): thử `vault.create` thật, tạo trong
  thư mục file đang mở → thư mục vở mở gần nhất → vault root.
- `openInMyBook` và `patchWorkspaceLeaf` khởi tạo `MyBookView` trực tiếp, mọi lỗi hiện Notice + console.

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
  toolbar ĐỨNG NGOÀI khung cuộn (con trực tiếp view, `position:sticky; top:0` — chi tiết §9) + nút export PDF,
  ẩn decor cần asset ngoài (`sheet-watermark`,
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
node install-to-vault.mjs   # copy vào red/.obsidian/plugins/mynote/
node /tmp/mybook-smoke.cjs  # smoke onload/onunload với Obsidian API giả lập
```
Rồi trong Obsidian: bật plugin → Reload (`Ctrl+P`) → mở 1 file `.mynote.md`.

## 9. Lịch sử sửa lỗi & Giới hạn đã biết (2026-10)

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
2. **Lỗi giật nét & lệch preview vs render chữ viết tay (Handwriting) — ĐÃ FIX (2026-10):**
   - **Hiện tượng lỗi:**
     - Khi viết chữ nhanh (cursive/ngoáy tay), nét ở phần preview bị rung/giật nhẹ ở đoạn đuôi vừa viết.
     - Sau khi thả bút/chuột (commit), hình dạng nét vẽ đôi khi bị nảy hoặc lệch so với hình ảnh lúc đang preview.
     - Viết nhanh chữ bị góc cạnh, thô ráp; nhấp bút chấm chữ "i" hay dấu chấm câu bị mất nét hoặc hóa đen.
   - **Nguyên nhân gốc rễ:**
     - *RDP chạy lại trên cửa sổ trượt (sliding window) mỗi frame:* Thuật toán Ramer–Douglas–Peucker (RDP) được gọi liên tục trên buffer điểm chưa chốt. Khi có điểm mới, các đỉnh tối ưu được chọn lại khiến đường cong ở đuôi nét bị biến dạng liên tục -> nét chữ vừa viết bị rung đuôi (tail-shift đo được ~0.37px) trước khi được đóng băng.
     - *Thiếu mẫu do Chromium Pointer Event Coalescing:* Trình duyệt Chromium chỉ phát 1 sự kiện `pointermove` mỗi frame (~60Hz) dù cảm biến chuột/bút lấy mẫu ở tần số 125–1000Hz. Khi rê bút nhanh, số điểm quá thưa làm nét bị gãy khúc, góc cạnh và sai số hình học lên đến ~5.4px.
     - *Phân kỳ render & Full-Canvas Clear:* Nhánh preview tự vẽ bằng routine riêng (`drawSmoothStroke` với param tay) thay vì dùng chung `drawStaticElement` như nét commit. Đồng thời mỗi frame đều `clearRect` toàn bộ trang (lên tới 800×1100 × backing 4x = 14M px/frame), gây quá tải GPU/CPU và sụt khung hình.
     - *Lỗi xử lý điểm chấm đơn (tap):* `StrokeStream` bỏ qua hoặc tạo 1 điểm duy nhất; `drawSmoothStroke` khi vẽ 1 điểm lại dùng `ctx.fillStyle` mặc định (màu đen) thay vì màu nét bút (`ctx.strokeStyle`).
   - **Giải pháp áp dụng (học từ cơ chế Excalidraw):**
     - *StrokeStream nhân quả append-only (sleeve / Reumann–Witkam):* Các đỉnh đã chốt (`out`) là bất biến, không bao giờ tính toán lại quá khứ. Preview = `out` + đầu bút (`tip`). Tail-shift giảm từ 0.37px về **0.000px** (khớp bit-exact giữa preview và commit).
     - *Bổ sung Coalesced Events:* Sử dụng `e.nativeEvent.getCoalescedEvents()` để thu thập toàn bộ các điểm trung gian bị gộp giữa các frame. Sai số hình học khi viết nhanh giảm từ ~5.4px xuống ~0.76px.
     - *Thống nhất hàm vẽ & Dirty-Rect Preview:* Preview gọi thẳng `drawStaticElement` (chung logic, thuộc tính với nét commit). Mỗi frame preview chỉ tính bounding box của nét hiện tại (+ padding nét & AA) và chỉ clear/vẽ trong vùng bọc này. Test điểm ảnh so với vẽ sạch: 0 px lệch.
     - *Hỗ trợ điểm chấm tròn:* Tap tạo cặp điểm trùng nhau; `drawSmoothStroke` vẽ chấm tròn bằng `arc()` với `fillStyle = strokeStyle` chuẩn màu nét.
3. **Lỗi nhấp nháy thanh tab và màn hình khi mở file — ĐÃ FIX (2026-10):**
   - **Hiện tượng lỗi:**
     - Khi mở file `.mynote.md` từ File Explorer hoặc thanh link, thanh tab Obsidian bị chớp/giật (icon đổi từ Markdown sang notebook-pen, tên file nhảy nhót, hoặc sinh thêm 1 tab thừa rồi biến mất).
     - Màn hình bị chớp đen/trắng 1 nhịp do view bị giấu/hiện và trễ vài frame mới hiện vở.
   - **Nguyên nhân gốc rễ:**
     - Obsidian chỉ phân tích đuôi cuối (`.md`) nên core luôn ưu tiên mở bằng `MarkdownView`.
     - Plugin trước đây xử lý sau lưng qua `workspace.on('file-open')`: MarkdownView đã được vẽ lên màn hình, sau đó plugin mới đặt `display: none` để giấu, polling `requestAnimationFrame` 3 frame rồi mới đổi sang `MyBookView`, khiến tab header đổi icon/title và màn hình giật 2 nhịp. Nếu file đã mở ở tab khác, Obsidian đẻ thêm tab mới rồi plugin mới `detach()`, gây giật mạnh thanh tab.
   - **Giải pháp áp dụng (học từ Excalidraw plugin):**
     - Monkey-patch đồng bộ `WorkspaceLeaf.prototype.setViewState` qua tiện ích an toàn `around`:
       1. Ngay khi Obsidian chuẩn bị mở leaf (trước khi bất kỳ view nào được tạo, trước frame 0):
          - Nếu file đã mở ở leaf khác: chuyển focus ngay về leaf đó, đóng tab trống thừa nếu có. Bất biến 1 file = 1 leaf được duy trì êm ái, không giật tab.
          - Nếu file chưa mở: đổi thẳng `viewState.type` từ `markdown` sang `mybook-notebook`.
       2. `MarkdownView` **hoàn toàn không được khởi tạo hay vẽ**, tab sinh ra đã mang sẵn icon `notebook-pen` và tiêu đề từ frame 0.
       3. Xóa bỏ hoàn toàn logic `display: none`, `requestAnimationFrame` polling 3 frame và listener `file-open`.
       4. Thêm ngưỡng 80ms cho loading indicator trong `loadPath` để mở file tức thì mà không chớp text "Đang tải vở...".
4. **Lỗi tê liệt cuộn trang (không cuộn được bằng chuột, touchpad lẫn phím mũi tên) — ĐÃ FIX (2026-10):**
   - **Hiện tượng lỗi:** Sau khi thêm tính năng điều hướng phím mũi tên và chỉnh khoảng cách trang, toàn bộ thao tác cuộn bằng con lăn chuột, vuốt 2 ngón touchpad lẫn bấm phím mũi tên đều bị đơ cứng, không cuộn trang được.
   - **Nguyên nhân gốc rễ:**
     - *`overscroll-behavior-y: contain` kẹt gesture trong Chromium/Electron:* Khi đặt thuộc tính này trên `.mybook-pages-scroll` chứa các phần tử con mang `touch-action: none` (như `.active-canvas` của lớp vẽ), bộ lọc gesture của Chromium nuốt/chặn sự kiện `wheel`, triệt tiêu khả năng cuộn.
     - *Wheel listener `{ passive: false }`:* Bắt buộc Chromium phải chờ luồng JS chính xử lý xong thay vì để compositor thread cuộn phần cứng mượt mà.
     - *Sai lệch Focus Context của Obsidian:* Logic cũ kiểm tra `host.contains(document.activeElement)`, nhưng trong Obsidian khi click vào tab vở thì `activeElement` nằm ở leaf container ngoài, khiến `isInside` trả về `false` và phím mũi tên không hoạt động.
   - **Giải pháp áp dụng:**
     - Xóa bỏ `overscroll-behavior-y: contain` và `-webkit-overflow-scrolling: touch` khỏi `.mybook-pages-scroll`, thiết lập `width: 100%; overflow-y: auto; overflow-x: auto`.
     - Giữ chuẩn khoảng cách giữa các trang `gap: 16px` trên `.mybook-pages-fitwrap`.
     - **Bỏ hoàn toàn listener zoom qua touchpad/wheel** (tránh giật lag và xung đột với cử chỉ 2 ngón của touchpad). Thao tác zoom giữ nguyên qua các nút capsule trên toolbar (+, -, fit, 100%).
     - **Cuộn phím siêu mượt qua requestAnimationFrame (lerp 60-120fps):** Tự động tìm scroller thực tế (`getScroller`), cộng dồn bước cuộn khi nhấp phím liên tục, nội suy mượt mà qua rAF (không dùng `scrollBy({ behavior: 'smooth' })` của trình duyệt vốn bị nghẽn/hủy khi bấm nhanh). Hủy tức thì animation nếu người dùng dùng chuột/touchpad.
5. **Con trỏ vẽ không hiện dấu cộng trên bảng vẽ (drawing tablet / stylus) — ĐÃ FIX (2026-10):**
   - **Hiện tượng lỗi:** Khi cắm bảng vẽ (Wacom, Huion, XP-Pen, stylus) vào vẽ trên Obsidian, con trỏ chỉ hiện mũi tên chuột thông thường thay vì con trỏ dấu cộng (`crosshair`).
   - **Nguyên nhân gốc rễ:**
     - Trong Chromium/Electron (đặc biệt môi trường Wayland/X11 trên Linux mà Obsidian vận hành), thiết bị digitizer/stylus (`pointerType === 'pen'`, `wl_tablet_tool`) được bàn giao trực tiếp cho compositor OS quản lý. Compositor thường bỏ qua các quy tắc CSS `cursor: crosshair` hoặc SVG data-URI của web engine đối với bút bảng vẽ và ép dùng con trỏ hệ thống mặc định (`left_ptr` / mũi tên chuột).
   - **Giải pháp áp dụng (chuẩn công nghiệp như Figma / Photoshop Web / Excalidraw):**
     - **In-Canvas Virtual Crosshair Overlay (`PageCanvas.tsx`):**
       - Tạo phần tử DOM con trỏ ảo `.virtual-drawing-crosshair` vẽ dấu cộng SVG 24×24px, 2 tông màu tương phản cao (viền trắng 3.5px + lõi tối 1.5px + tâm chấm ngắm 1.5px), `pointerEvents: 'none'`, `willChange: 'transform'`.
       - Lắng nghe `onPointerMove`, `onPointerDown`, `onPointerEnter`, `onPointerLeave`, `onPointerCancel` và cập nhật trực tiếp tọa độ qua `ref.style.transform = translate3d(x, y, 0) scale(1/zoom)` (0 React re-renders, tracking mượt 125–1000Hz theo tần số lấy mẫu phần cứng của bảng vẽ).
     - **Triệt tiêu mũi tên chuột hệ thống (`obsidian-overrides.css`, `06-canvas-navigator.css` & React inline styles):**
       - Trên Linux Wayland / Electron, quy tắc `cursor: none` đơn lẻ thường bị compositor bỏ qua (do Wayland gán surface null và fallback về con trỏ mặc định). Chuẩn xử lý trên Electron là sử dụng ảnh PNG trong suốt 1×1 pixel base64: `cursor: url("data:image/png;base64,...") 0 0, none !important`.
       - Khi Chromium nạp một surface PNG hợp lệ (dù trong suốt), compositor hệ thống sẽ chấp nhận và vẽ surface trong suốt đó, làm biến mất hoàn toàn mũi tên chuột.
       - Đã áp dụng đồng bộ từ cấp host (`.mybook-obsidian-host.is-drawing-active`), `.notebook-sheet`, `.page-drawing-layer` cho đến `<canvas className="active-canvas">`.
       - Nhờ đó, mũi tên chuột hệ thống bị triệt tiêu 100%, chỉ còn lại duy nhất dấu cộng ảo `+` sắc nét, chính xác ngay tại đầu ngòi bút. Chế độ tẩy (`eraser`) vẫn hiển thị con trỏ tẩy chuyên biệt, và chế độ chọn (`select` / `text`) vẫn dùng con trỏ hệ thống bình thường.
6. Backing canvas hợp nhất cho preview/static (`canvasBackingScale`: dpr×zoom,
   min 1 max 4) — zoom 2× trên hidpi vẫn nét; cap 4x để nhẹ RAM.
7. Chưa virtualize: vở hàng chục trang + ảnh base64 nặng RAM.
8. Chưa có undo cho thao tác trong textbox đang gõ dở (dùng undo native của textarea).
9. Mobile chưa test (đánh dấu `isDesktopOnly: false` nhưng chưa verify cảm ứng).

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
