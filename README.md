# 📓 MyBook — Sổ tay lai số & giấy

Sổ tay vật lý số hoá: **vẽ tay + textbox markdown + paste ảnh** trên trang giấy giới hạn (800×1100px), quản lý file kiểu **Obsidian vault** (tab markdown / mynote / code, split view, quick open, wikilink), theme Pastel "Better Notes", xuất PDF.

> 1 code chạy 2 môi trường: `npm run dev` (web + plugin `/api/fs`) và app desktop **Tauri** (đọc/ghi file thật qua plugin-fs).

---

## ✨ Tính năng chính

- **Vở vật lý**: bút mực, dạ quang, tẩy, line/arrow/rect/circle (rough.js), undo/redo 50 bước, lật trang 3D, 3 chế độ xem (2 trang / 1 trang / cuộn dọc)
- **Textbox markdown**: checkbox, highlight, wikilink `[[...]]`, bảng, code, callout; kéo-thả, resize, khóa, nhân bản, **khung card** (chuột phải → Hiển thị khung)
- **Select kiểu Excalidraw**: kéo vùng chọn nhiều object (nét + ảnh + chữ), Shift+Click cộng dồn, kéo cả nhóm, chuột phải **Đưa lên trên / Đưa xuống dưới**, `Delete` / `Ctrl+D`
- **Paste ảnh** (`Ctrl+V`, kéo-thả, nút Ảnh) ngay vị trí con trỏ — nằm dưới chữ/nét vẽ để viết đè lên
- **Vault**: cây thư mục, tạo/sửa/xóa/đổi tên file & folder, Open Vault đổi thư mục, tìm kiếm
- **Tab + Split view**: nhiều tab, chia đôi màn hình 2 note (mynote ép cuộn dọc), nút `+` mở tab mới
- **Ctrl+O** Quick Open tìm file; gợi ý `[[wikilink]]` khi gõ trong markdown editor
- **Theme**: Mặc định / Pastel "Better Notes" (Settings `Ctrl+,`), doodle + watermark asset thật trên giấy
- **Lưu trữ**: autosave IndexedDB + ghi thẳng file `.md` / `.mynote.md` ra vault; xuất PDF nhiều độ phân giải

## ⌨️ Phím tắt hay dùng

| Phím | Tác dụng |
|---|---|
| `1–9`, `Q` | Đổi tool / khóa tool |
| `Ctrl+S` | Lưu nhanh |
| `Ctrl+Z` / `Ctrl+Y` | Undo / Redo |
| `Ctrl+O` | Tìm và mở file (Quick Open) |
| `Ctrl+,` | Cài đặt (đổi theme, font, phím tắt) |
| `Ctrl+\` | Đóng/mở sidebar |
| `Delete` / `Ctrl+D` / `Esc` | Xóa / nhân bản / bỏ chọn vùng đang chọn |

---

## 🛠️ Chạy web (dev)

```bash
cd /mnt/DATA_D/DESKTOP/DATA_DESKTOP/0-CODE/MY_BOOK
npm install      # lần đầu
npm run dev      # mở http://localhost:5173 (giữ port 5173 cho Tauri)
```

Chế độ này đầy đủ nhất để code/test vì vault đọc/ghi qua plugin `/api/fs` của Vite.

## 📦 Build app desktop (Tauri)

### Lần đầu: cài môi trường

```bash
# 1. System libs (Fedora) — cần mật khẩu sudo
sudo dnf install -y webkit2gtk4.1-devel openssl-devel curl wget file \
  libappindicator-gtk3-devel librsvg2-devel libxdo-devel

# 2. Rust (user-space, không cần sudo)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
export PATH="$HOME/.cargo/bin:$PATH"
```

### Build app

```bash
cd /mnt/DATA_D/DESKTOP/DATA_DESKTOP/0-CODE/MY_BOOK
export PATH="$HOME/.cargo/bin:$PATH"
npx tauri build        # lần đầu ~10 phút (tải crate Rust), lần sau nhanh hơn nhiều
```

File app nằm ở `src-tauri/target/release/bundle/`:

| File | Dùng sao |
|---|---|
| `appimage/MyBook_0.1.0_amd64.AppImage` | **Khuyên dùng.** `chmod +x` rồi chạy trực tiếp, không cần root, không cài đặt |
| `deb/MyBook_0.1.0_amd64.deb` | `sudo dnf install ./....deb` — hiện trong menu ứng dụng |

Test nhanh không cần build: `npx tauri dev` (app chạy live-reload).

### Quy trình fix bug → ra bản mới

```bash
# 1. Sửa code, test bằng npm run dev (hoặc npx tauri dev)
# 2. Build lại
npx tauri build
# 3. Chạy file AppImage mới (đè lên bản cũ là xong)
```

**Dữ liệu không mất** khi build/cài đè:
- File vault nằm trong thư mục Obsidian của bạn (mặc định `.../0_Obsidian notebook/red`)
- Note nháp IndexedDB nằm ở `~/.local/share/com.mybook.desktop`

### Cấu trúc Tauri trong repo

```
src-tauri/
  tauri.conf.json      # app id com.mybook.desktop, cửa sổ 1440×900, target deb+appimage,
                       # asset-protocol scope $HOME/** (để ảnh vault hiện trong app)
  capabilities/default.json  # quyền FS giới hạn $HOME/** (đọc/ghi/xóa/đổi tên/tạo)
  src/{main,lib}.rs    # plugin fs + dialog (+ log khi dev)
src/shared/lib/tauriFs.ts   # isTauri() + index file vault + resolve ảnh sang asset:// URL
src/services/vaultService.ts  # tự chọn backend: plugin-fs (app) hay /api/fs (web)
```

Muốn đổi thư mục vault mặc định: sửa `DEFAULT_VAULT_PATH` trong `src/services/vaultService.ts`.

---

## 🔌 Plugin Obsidian — MyBook Notebook

Dùng trang vở MyBook (textbox + vẽ tay + ảnh paste + select) **ngay trong app Obsidian**
cho file `.mynote.md`, lưu trực tiếp qua Vault API (không cần chạy app MyBook riêng).

```bash
cd obsidian-plugin
npm install        # lần đầu
npm run build      # → main.js + styles.css (đã scope CSS, không rò ra UI Obsidian)
npm run install-to-vault   # copy vào vault red/.obsidian/plugins/mybook-notebook/
```

Rồi trong Obsidian: **Settings → Community plugins → bật "MyBook Notebook" → Reload**
(`Ctrl+P` → "Reload app without saving" cho chắc). Click file `.mynote.md` bất kỳ là mở
bằng vở. Thêm lệnh: *Tạo vở MyBook mới*, *Mở file đang xem bằng MyBook*,
*Xuất vở đang mở ra PDF* (+ icon ribbon, nút Download trên toolbar vở — PDF lưu cạnh file vở).

Lưu ý bản đầu: ảnh `![[...]]` trong textbox resolve qua tên file vault; decor washi/mèo/lá
của theme pastel bị ẩn trong Obsidian (asset không ship theo plugin); engine Excalidraw
thay bằng stub (vở dùng engine vẽ native mặc định).

> **Quan trọng (xung đột plugin Excalidraw):** file vở `.mynote.md` dùng frontmatter
> `mybook-plugin: parsed`. File vở cũ ghi `excalidraw-plugin: parsed` sẽ bị plugin
> Excalidraw cướp và báo lỗi JSON — đổi dòng đó thành `mybook-plugin: parsed` là hết
> (app mới xuất ra đã dùng marker mới; file trong vault red đã migrate xong).

---

## 🧪 Scripts

```bash
npm run dev       # web dev (localhost:5173)
npm run build     # tsc + vite build ra dist/
npm run preview   # xem thử bản dist
npm run lint      # oxlint
npm run tauri     # Tauri CLI (dev/build/icon...)
```
