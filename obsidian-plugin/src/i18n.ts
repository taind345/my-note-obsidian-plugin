export type Language = 'en' | 'vi'

export const translations = {
  en: {
    // Settings
    settingsTitle: 'MyBook Notebook Settings',

    // Section: Language
    languageSection: 'Language',
    languageName: 'Display Language',
    languageDesc: 'Choose the display language for settings and interface (Default: English).',

    // Section: Attachments
    attachmentSection: 'Pasted Images & Attachments',
    attachmentFolderTitle: 'Pasted Image Folder',
    attachmentFolderDesc: 'Folder in Vault to save pasted images (Ctrl+V / drag & drop). Leave empty to use Obsidian default attachment folder (e.g. 0-asset).',
    attachmentFolderPlaceholder: 'Obsidian default (e.g. 0-asset)',

    // Section: Typography
    typographySection: 'Typography & Fonts',
    defaultFontTitle: 'Default Notebook Font',
    defaultFontDesc: 'Default font applied to notebook text boxes.',
    fontCascadia: 'Cascadia Code (Default)',
    fontDfvn: 'DFVN Excalidraw (Vietnamese Handwriting)',
    fontHandwriting: 'Handwriting (Virgil / Patrick Hand)',
    fontSans: 'Sans-serif (Inter / System)',
    fontSerif: 'Serif (Georgia)',
    fontMono: 'Monospace',
    fontCustom: 'Custom Font',

    customFontPathTitle: 'Custom Font Path in Vault',
    customFontPathDesc: 'Path to a font file (.ttf, .otf, .woff, .woff2) inside your Vault (e.g. 0_Excalidraw/font/DFVN-Excalifont.ttf).',
    customFontNameTitle: 'Custom Font Name',
    customFontNameDesc: 'Display name or system font name (e.g. DFVN Excalifont or Be Vietnam Pro).',

    // Toolbar Tools
    toolSelect: 'Select / Move (1)',
    toolRect: 'Rectangle (2)',
    toolCircle: 'Circle (3)',
    toolArrow: 'Arrow (4)',
    toolLine: 'Line (5)',
    toolPen: 'Pen (6)',
    toolHighlighter: 'Highlighter (7)',
    toolText: 'Text Box (8)',
    toolEraser: 'Eraser (9)',
    lockToolActive: 'Unlock tool (Q)',
    lockToolInactive: 'Lock tool (keep active after drawing) (Q)',

    // Toolbar Actions & Options
    fontMenuTitle: 'Notebook Font',
    undo: 'Undo (Ctrl+Z)',
    redo: 'Redo (Ctrl+Y)',
    ruled: 'Ruled lines',
    grid: 'Grid pattern',
    fontBtnTitle: 'Notebook font (Click to select)',
    zoomOut: 'Zoom out',
    zoomIn: 'Zoom in',
    zoomReset: 'Current zoom level (Click to reset 100%)',
    fitZoom: 'Fit to view',
    addPage: 'Add new page',
    exportPdf: 'Export notebook to PDF',
    saved: 'All changes saved to file',
    saving: 'Unsaved changes (saving...)',

    // Commands & Context Menu
    newNotebookRibbon: 'Open new MyBook notebook',
    newNotebookCmd: 'Create new MyBook notebook',
    openActiveCmd: 'Open active file as MyBook notebook',
    exportPdfCmd: 'Export active notebook to PDF',
    contextOpenMyBook: 'Open as MyBook notebook',
    contextOpenMarkdown: 'Open as raw Markdown',
  },
  vi: {
    // Settings
    settingsTitle: 'Cài đặt Vở viết MyBook',

    // Section: Language
    languageSection: 'Ngôn ngữ (Language)',
    languageName: 'Ngôn ngữ hiển thị',
    languageDesc: 'Chọn ngôn ngữ hiển thị cho phần cài đặt và giao diện (Mặc định: Tiếng Anh).',

    // Section: Attachments
    attachmentSection: 'Ảnh dán & Đính kèm (Pasted Images)',
    attachmentFolderTitle: 'Thư mục lưu ảnh dán',
    attachmentFolderDesc: 'Thư mục trong Vault để lưu file ảnh dán (Ctrl+V / kéo-thả). Để trống để tự động lấy theo thư mục attachment của Obsidian (ví dụ: 0-asset).',
    attachmentFolderPlaceholder: 'Mặc định Obsidian (ví dụ: 0-asset)',

    // Section: Typography
    typographySection: 'Phông chữ & Typography',
    defaultFontTitle: 'Phông chữ mặc định của vở',
    defaultFontDesc: 'Phông chữ mặc định áp dụng cho các ô văn bản ghi chép trong vở.',
    fontCascadia: 'Cascadia Code (Mặc định)',
    fontDfvn: 'DFVN Excalidraw (tiếng Việt)',
    fontHandwriting: 'Chữ viết tay (Virgil / Patrick Hand)',
    fontSans: 'Sans-serif (Inter / Hệ thống)',
    fontSerif: 'Serif (Georgia)',
    fontMono: 'Monospace',
    fontCustom: 'Font tùy chỉnh (Custom Font)',

    customFontPathTitle: 'Đường dẫn file font tùy chọn trong Vault',
    customFontPathDesc: 'Đường dẫn tới file font (.ttf, .otf, .woff, .woff2) trong Vault của bạn (ví dụ: 0_Excalidraw/font/DFVN-Excalifont.ttf).',
    customFontNameTitle: 'Tên phông chữ tùy chọn',
    customFontNameDesc: 'Tên font hiển thị hoặc tên font hệ thống đã cài trên máy bạn (ví dụ: DFVN Excalifont hoặc Be Vietnam Pro).',

    // Toolbar Tools
    toolSelect: 'Chọn / di chuyển (1)',
    toolRect: 'Hình chữ nhật (2)',
    toolCircle: 'Hình tròn (3)',
    toolArrow: 'Mũi tên (4)',
    toolLine: 'Đoạn thẳng (5)',
    toolPen: 'Bút viết (6)',
    toolHighlighter: 'Bút dạ quang (7)',
    toolText: 'Hộp chữ (8)',
    toolEraser: 'Tẩy (9)',
    lockToolActive: 'Mở khóa công cụ (Q)',
    lockToolInactive: 'Khóa công cụ (giữ tool sau khi vẽ) (Q)',

    // Toolbar Actions & Options
    fontMenuTitle: 'Phông chữ vở',
    undo: 'Hoàn tác (Ctrl+Z)',
    redo: 'Làm lại (Ctrl+Y)',
    ruled: 'Dòng kẻ ngang (Ruled)',
    grid: 'Lưới ô vuông (Grid)',
    fontBtnTitle: 'Phông chữ vở viết (Click để chọn font)',
    zoomOut: 'Thu nhỏ',
    zoomIn: 'Phóng to',
    zoomReset: 'Mức zoom hiện tại (Click để đặt lại 100%)',
    fitZoom: 'Fit vừa khung xem',
    addPage: 'Thêm trang mới',
    exportPdf: 'Xuất vở ra PDF',
    saved: 'Đã lưu vào file',
    saving: 'Đang có thay đổi (chờ tự động lưu...)',

    // Commands & Context Menu
    newNotebookRibbon: 'Mở vở MyBook mới',
    newNotebookCmd: 'Tạo vở MyBook mới',
    openActiveCmd: 'Mở file đang xem bằng MyBook',
    exportPdfCmd: 'Xuất vở đang mở ra PDF',
    contextOpenMyBook: 'Mở bằng vở MyBook',
    contextOpenMarkdown: 'Mở dạng Markdown thô',
  },
} as const

export function getT(lang: Language = 'en') {
  return translations[lang] || translations.en
}
