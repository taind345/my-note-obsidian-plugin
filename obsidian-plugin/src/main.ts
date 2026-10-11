import { App, ItemView, Notice, Plugin, TFile, WorkspaceLeaf } from 'obsidian'
import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
// CSS app được bundle rồi scope vào .mybook-obsidian-host bởi scope-css.mjs
// (prepare-css.mjs đã strip url tuyệt đối không resolve được trong Obsidian)
import './app.obsidian.css'
import 'katex/dist/katex.min.css'
import { setAssetResolver } from '@/shared/lib/markdown'
import {
  exportNotebookToMarkdown,
  importNotebookFromMarkdown,
} from '@/services/markdownFile'
import { getEmptyNotebook } from '@/services/storage'
import { MyBookNotebook, MyBookErrorBoundary } from './MyBookNotebook'
import { around } from './around'

export const MYBOOK_VIEW_TYPE = 'mybook-notebook'
/** Đuôi file vở MyBook (giữ nguyên .md để Obsidian vẫn đọc text được) */
export const MYBOOK_EXTS = ['mynote.md']

/** Thư mục của vở MyBook mở gần nhất — fallback khi tạo note mới mà không có file active */
let lastMyBookDir = ''

function isMyBookFile(path: string): boolean {
  const lower = path.toLowerCase()
  return MYBOOK_EXTS.some((ext) => lower.endsWith(`.${ext}`))
}

/** Nhận diện vở MyBook: đúng đuôi .mynote.md HOẶC frontmatter có key mybook-plugin
 *  (trường hợp user đổi tên làm mất đuôi). Không dùng marker excalidraw-plugin
 *  vì đó là của plugin Excalidraw (vẽ khác). */
function isMyBookNote(app: App, file: TFile): boolean {
  if (isMyBookFile(file.path)) return true
  try {
    const cache = app.metadataCache.getFileCache(file)
    const fm = cache?.frontmatter as Record<string, unknown> | undefined
    if (fm && fm['mybook-plugin'] !== undefined) return true
  } catch {
    /* bỏ qua */
  }
  return false
}

/** Nhận diện qua filepath hoặc cache vault */
function isMyBookNotePath(app: App, filePath: string): boolean {
  if (isMyBookFile(filePath)) return true
  try {
    const file = app.vault.getAbstractFileByPath(filePath)
    if (file instanceof TFile) {
      const cache = app.metadataCache.getFileCache(file)
      const fm = cache?.frontmatter as Record<string, unknown> | undefined
      if (fm && fm['mybook-plugin'] !== undefined) return true
    }
  } catch {
    /* bỏ qua */
  }
  return false
}

/** Chuẩn hóa path vault để so khớp leaf (tránh lệch trailing slash) */
function normLeafPath(p: string | null | undefined): string {
  return (p || '').trim().replace(/\/+$/, '')
}

/** Mọi leaf vở MyBook đang hiển thị đúng file này */
function findMyBookLeaves(app: App, filePath: string): WorkspaceLeaf[] {
  const want = normLeafPath(filePath)
  const out: WorkspaceLeaf[] = []
  for (const leaf of app.workspace.getLeavesOfType(MYBOOK_VIEW_TYPE)) {
    const v = leaf.view
    if (v instanceof MyBookView) {
      const curPath = v.currentFilePath || (v.leaf.getViewState().state as { file?: string } | undefined)?.file
      if (normLeafPath(curPath) === want) {
        out.push(leaf)
      }
    }
  }
  return out
}

export default class MyBookPlugin extends Plugin {
  isLoaded = false
  forceOpenAsMarkdownPath: string | null = null

  async onload() {
    this.isLoaded = true
    // Ảnh ![[...]] trong textbox resolve qua Vault API (resource path của Obsidian)
    setAssetResolver((filename) => this.resolveVaultImage(filename))

    this.registerView(MYBOOK_VIEW_TYPE, (leaf) => new MyBookView(leaf, this))

    this.registerExtensions(['mynote', MYBOOK_EXTS[0]], MYBOOK_VIEW_TYPE)

    // Chặn đồng bộ setViewState (cơ chế kiểu Excalidraw):
    // Khi Obsidian mở file .mynote.md, chuyển thẳng sang MYBOOK_VIEW_TYPE
    // ngay trước khi MarkdownView kịp khởi tạo hay render frame nào.
    // -> Triệt tiêu 100% hiện tượng chớp tab và nhấp nháy màn hình.
    this.patchWorkspaceLeaf()

    // Nếu lúc mở app/reload đã có sẵn leaf markdown đang hiển thị file .mynote.md,
    // nâng cấp lên view vở khi workspace sẵn sàng.
    this.app.workspace.onLayoutReady(() => {
      this.switchToMyBookAfterLoad()
    })

    // Menu chuột phải lên file vở: mở bằng MyBook hoặc xem Markdown thô
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file, _source, leaf) => {
        if (file instanceof TFile && isMyBookNote(this.app, file)) {
          menu.addItem((item) =>
            item
              .setTitle('Mở bằng vở MyBook')
              .setIcon('notebook-pen')
              .onClick(() => {
                void this.openInMyBook(file)
              })
          )
          menu.addItem((item) =>
            item
              .setTitle('Mở dạng Markdown thô')
              .setIcon('file-text')
              .onClick(async () => {
                this.forceOpenAsMarkdownPath = file.path
                const targetLeaf = leaf ?? this.app.workspace.getLeaf(false)
                await targetLeaf.setViewState({
                  type: 'markdown',
                  state: { file: file.path, mode: 'source' },
                  active: true,
                })
              })
          )
        }
      })
    )

    this.addRibbonIcon('notebook-pen', 'Mở vở MyBook mới', () => {
      void this.createAndOpenNotebook()
    })

    this.addCommand({
      id: 'mybook-new-notebook',
      name: 'Tạo vở MyBook mới',
      callback: () => {
        void this.createAndOpenNotebook()
      },
    })

    this.addCommand({
      id: 'mybook-open-active',
      name: 'Mở file đang xem bằng MyBook',
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile()
        if (file && isMyBookNote(this.app, file)) {
          if (!checking) void this.openInMyBook(file)
          return true
        }
        return false
      },
    })

    this.addCommand({
      id: 'mybook-export-pdf',
      name: 'Xuất vở đang mở ra PDF',
      checkCallback: (checking) => {
        const leaf = this.app.workspace.activeLeaf
        if (leaf?.view instanceof MyBookView) {
          if (!checking) leaf.view.requestPdfExport()
          return true
        }
        return false
      },
    })

    // Mặc định mở vault hiện tại làm vault (đồng bộ với app MyBook desktop)
    try {
      localStorage.setItem('mybook_vault_path', this.vaultRoot())
    } catch {
      /* bỏ qua */
    }
  }

  onunload() {
    this.isLoaded = false
    setAssetResolver(null)
  }

  /**
   * Hook đồng bộ vào WorkspaceLeaf.prototype.setViewState (chuẩn Excalidraw):
   * Khi Obsidian điều hướng/mở file .mynote.md:
   * 1. Nếu file đã có leaf đang mở: focus về đó ngay lập tức (không đẻ tab trùng, không giật tab).
   * 2. Nếu file chưa mở: đổi type thành MYBOOK_VIEW_TYPE trước khi view được khởi tạo.
   *    -> MarkdownView không bao giờ được tạo, tab sinh ra là có sẵn icon và title MyBook.
   */
  patchWorkspaceLeaf(): void {
    const plugin = this
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const unpatch = around(WorkspaceLeaf.prototype as unknown as Record<string, unknown>, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setViewState(next: any) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return function (this: WorkspaceLeaf, viewState: any, ...args: any[]) {
          const filePath = viewState?.state?.file
          const isMarkdown = viewState?.type === 'markdown'
          const isMyBook = viewState?.type === MYBOOK_VIEW_TYPE

          if (
            plugin.isLoaded &&
            typeof filePath === 'string' &&
            (isMarkdown || isMyBook) &&
            isMyBookNotePath(plugin.app, filePath)
          ) {
            // Cho phép mở Markdown thô khi user chọn từ context menu
            if (plugin.forceOpenAsMarkdownPath === filePath) {
              plugin.forceOpenAsMarkdownPath = null
              return next.apply(this, [viewState, ...args])
            }

            // Bất biến 1 file = 1 leaf vở:
            // Nếu file đã mở ở leaf khác thì chỉ focus về đó, dọn tab trống vừa tạo (nếu có)
            const existingLeaves = findMyBookLeaves(plugin.app, filePath)
            const existingLeaf = existingLeaves.find((l) => l !== this)
            if (existingLeaf) {
              plugin.app.workspace.setActiveLeaf(existingLeaf, { focus: true })
              const curViewType = this.view?.getViewType?.()
              if (curViewType === 'empty' || !curViewType) {
                this.detach()
              }
              return Promise.resolve()
            }

            // Chuyển thẳng sang MYBOOK_VIEW_TYPE đồng bộ trước khi view được tạo
            if (isMarkdown) {
              const patched = {
                ...viewState,
                type: MYBOOK_VIEW_TYPE,
              }
              return next.apply(this, [patched, ...args])
            }
          }

          return next.apply(this, [viewState, ...args])
        }
      },
    })
    this.register(unpatch)
  }

  /** Chuyển các tab markdown đang mở file .mynote.md sang MyBookView khi khởi động app */
  switchToMyBookAfterLoad(): void {
    for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
      const view = leaf.view as unknown as { file?: { path?: string } } | null
      const filePath = view?.file?.path
      if (filePath && isMyBookNotePath(this.app, filePath)) {
        void leaf.setViewState({
          type: MYBOOK_VIEW_TYPE,
          state: { file: filePath },
          active: leaf === this.app.workspace.activeLeaf,
        })
      }
    }
  }

  vaultRoot(): string {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adapter = this.app.vault.adapter as any
    if (adapter && typeof adapter.getBasePath === 'function') {
      return String(adapter.getBasePath()).replace(/\/+$/, '')
    }
    return ''
  }

  /** Resolve tên ảnh trong vault -> app:// URL hiển thị được */
  resolveVaultImage(filename: string): string | null {
    const clean = filename.split('|')[0].trim().replace(/^\.\//, '')
    if (!clean || clean.startsWith('http://') || clean.startsWith('https://') || clean.startsWith('data:')) {
      return null
    }
    const files = this.app.vault.getFiles()
    const lower = clean.toLowerCase()
    // 1. khớp đường dẫn tương đối trong vault
    let hit = files.find((f) => f.path.toLowerCase() === lower)
    // 2. khớp tên file (basename)
    if (!hit) {
      const base = lower.split('/').pop() || lower
      hit = files.find((f) => f.name.toLowerCase() === base)
    }
    if (!hit) return null
    try {
      return this.app.vault.getResourcePath(hit)
    } catch {
      return null
    }
  }

  async createAndOpenNotebook(): Promise<void> {
    try {
      // Tạo file mới TRONG CÙNG thư mục với file đang mở; nếu không có file active
      // (VD: đang xem vở MyBook — view custom không tính là file active) thì dùng
      // thư mục vở mở gần nhất; cuối cùng mới về vault root.
      const active = this.app.workspace.getActiveFile()
      const activeDir = active?.parent && active.parent.path ? `${active.parent.path}/` : ''
      const dir = activeDir || (lastMyBookDir ? `${lastMyBookDir}/` : '')
      // Tên mặc định note_1.mynote.md, trùng thì tăng số (lấp luôn số trống)
      let n = 1
      for (let attempt = 0; attempt < 100; attempt++) {
        const name = `note_${n}`
        const fileName = `${dir}${name}.mynote.md`
        try {
          const fresh = getEmptyNotebook(name, 'grid')
          const content = exportNotebookToMarkdown(fresh.meta, fresh.pages)
          const file = await this.app.vault.create(fileName, content)
          await this.openInMyBook(file as TFile)
          return
        } catch (err) {
          if (err instanceof Error && /already exists/i.test(err.message)) {
            n += 1
            continue
          }
          throw err
        }
      }
      new Notice('MyBook: không tìm được tên file trống (thử 100 tên đều trùng)')
    } catch (err) {
      console.error('[MyBook] createAndOpenNotebook failed:', err)
      new Notice(`MyBook: không tạo được vở mới (${err instanceof Error ? err.message : err})`)
    }
  }

  async openInMyBook(file: TFile): Promise<void> {
    try {
      // Bất biến 1 file = 1 leaf vở: đã mở ở đâu thì focus về đó, không đẻ tab mới
      const existing = findMyBookLeaves(this.app, file.path)
      if (existing.length > 0) {
        const active = this.app.workspace.activeLeaf
        const keep = active && existing.includes(active) ? active : existing[0]
        if (!keep) return
        for (const l of existing) {
          if (l !== keep) l.detach()
        }
        if (keep !== this.app.workspace.activeLeaf) {
          this.app.workspace.setActiveLeaf(keep, { focus: true })
        }
        return
      }
      const leaf = this.app.workspace.getLeaf(true)
      await leaf.setViewState({ type: MYBOOK_VIEW_TYPE, active: true, state: { file: file.path } })
      // Đảm bảo view tải nội dung file
      const view = leaf.view
      if (view instanceof MyBookView && view.currentFilePath !== file.path) {
        await view.loadPath(file.path)
      }
    } catch (err) {
      console.error('[MyBook] openInMyBook failed:', err)
      new Notice(`MyBook: không mở được vở (${err instanceof Error ? err.message : err})`)
    }
  }
}


class MyBookView extends ItemView {
  plugin: MyBookPlugin
  root: Root | null = null
  currentFilePath: string | null = null
  /** Path đang tải dở — chặn double-load (setState của Obsidian + loadPath tay
      gọi chồng nhau; file 11MB mà parse+render 2 lần là lag nhân đôi) */
  loadingPath: string | null = null

  constructor(leaf: WorkspaceLeaf, plugin: MyBookPlugin) {
    super(leaf)
    this.plugin = plugin
  }

  getViewType(): string {
    return MYBOOK_VIEW_TYPE
  }

  /** File đang mở trong view (cho Obsidian workspace và các plugin khác) */
  get file(): TFile | null {
    if (this.currentFilePath) {
      const f = this.app.vault.getAbstractFileByPath(this.currentFilePath)
      if (f instanceof TFile) return f
    }
    return this.resolveFile()
  }

  /** File của view: ưu tiên state khi mở qua lệnh, fallback file đang active */
  resolveFile(): TFile | null {
    try {
      const state = this.leaf.getViewState().state as { file?: unknown } | undefined
      if (state && typeof state.file === 'string') {
        const f = this.app.vault.getAbstractFileByPath(state.file)
        if (f instanceof TFile) return f
      }
    } catch {
      /* bỏ qua */
    }
    return this.app.workspace.getActiveFile()
  }

  getDisplayText(): string {
    if (this.currentFilePath) {
      const parts = this.currentFilePath.split('/')
      return parts[parts.length - 1].replace(/\.mynote\.md$/i, '') || 'MyBook'
    }
    const f = this.resolveFile()
    if (f) {
      return f.basename.replace(/\.mynote$/i, '') || f.basename
    }
    return 'MyBook'
  }

  getIcon(): string {
    return 'notebook-pen'
  }

  /** Obsidian gọi setState sau setViewState — đây mới là nơi nhận đúng file cần mở */
  async setState(state: unknown): Promise<void> {
    const s = state as { file?: unknown } | undefined
    if (s && typeof s.file === 'string') {
      await this.loadPath(s.file)
    }
  }

  getState(): Record<string, unknown> {
    return this.currentFilePath ? { file: this.currentFilePath } : {}
  }

  /** Command palette "Xuất PDF" → mở modal export của đúng vở này */
  requestPdfExport(): void {
    window.dispatchEvent(new CustomEvent('mybook:export-pdf', { detail: { path: this.currentFilePath } }))
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1]
    container.empty()
    container.addClass('mybook-obsidian-host')
    this.currentFilePath = null
    // Theo dõi rename/delete file đang mở để lưu/navigate đúng chỗ mới
    this.registerEvent(
      this.app.vault.on('rename', (file, oldPath) => {
        if (oldPath === this.currentFilePath && file instanceof TFile) {
          this.currentFilePath = file.path
        }
      })
    )
    this.registerEvent(
      this.app.vault.on('delete', (file) => {
        if (file.path === this.currentFilePath) {
          new Notice('MyBook: file vở đã bị xóa — thay đổi mới sẽ không lưu được')
        }
      })
    )
    // Fallback: nếu setState không mang file (mở trực tiếp), thử file active
    // (chỉ khi đúng là vở MyBook — đuôi hoặc frontmatter — không bao giờ "cướp" file thường).
    setTimeout(() => {
      if (this.currentFilePath || this.root) return
      const f = this.resolveFile()
      if (f && isMyBookNote(this.app, f)) {
        void this.loadPath(f.path)
      } else if (!f) {
        container.createEl('p', { text: 'Mở một file .mynote.md để xem vở MyBook.' })
      }
    }, 0)
  }

  /** Tải + render file vở (bỏ qua nếu đang hiển thị / đang tải đúng file đó) */
  async loadPath(path: string): Promise<void> {
    if (path === this.currentFilePath && this.root) return
    if (this.loadingPath === path) return
    this.root?.unmount()
    this.root = null
    this.currentFilePath = path
    this.loadingPath = path
    // Nhớ thư mục để lần tạo note sau rơi đúng chỗ
    const slash = path.lastIndexOf('/')
    lastMyBookDir = slash >= 0 ? path.substring(0, slash) : ''

    const container = this.containerEl.children[1]
    container.empty()
    container.addClass('mybook-obsidian-host')

    // Tránh chớp chữ "đang tải vở...": chỉ hiện nếu file đọc/parse quá 80ms
    let hasFinished = false
    let loadingEl: HTMLElement | null = null
    const loadingTimer = setTimeout(() => {
      if (!hasFinished && this.loadingPath === path && !this.root) {
        loadingEl = container.createEl('div', {
          text: 'MyBook: đang tải vở...',
          cls: 'mybook-loading',
        })
      }
    }, 80)
    const cancelLoading = () => {
      hasFinished = true
      clearTimeout(loadingTimer)
      if (loadingEl) {
        ;(loadingEl as HTMLElement).remove()
        loadingEl = null
      }
    }

    const file = this.app.vault.getAbstractFileByPath(path)
    if (!(file instanceof TFile)) {
      cancelLoading()
      container.createEl('div', { text: `Không tìm thấy file ${path}`, cls: 'mybook-loading' })
      if (this.loadingPath === path) this.loadingPath = null
      return
    }

    let raw = ''
    try {
      raw = await this.app.vault.read(file)
    } catch {
      cancelLoading()
      container.createEl('div', { text: `Không đọc được file ${file.path}`, cls: 'mybook-loading' })
      if (this.loadingPath === path) this.loadingPath = null
      return
    }
    // Trong lúc đọc file, user đã mở sang file khác → bỏ, tránh render đè
    if (this.loadingPath !== path) {
      cancelLoading()
      return
    }

    const parsed = importNotebookFromMarkdown(raw)
    // Parse xong mà đã chuyển file khác → bỏ, tránh render đè (file 11MB parse lâu)
    if (this.loadingPath !== path) {
      cancelLoading()
      return
    }
    const initialMeta = parsed
      ? parsed.meta
      : getEmptyNotebook(file.basename, 'grid').meta
    const initialPages = parsed
      ? parsed.pages
      : getEmptyNotebook(file.basename, 'grid').pages

    cancelLoading()
    container.empty()
    this.root = createRoot(container as HTMLElement)
    if (this.loadingPath === path) this.loadingPath = null
    try {
      this.root.render(
        React.createElement(
          MyBookErrorBoundary,
          null,
          React.createElement(MyBookNotebook, {
        initialMeta,
        initialPages,
        filePath: path,
        fileBasename: file.basename,
        onSave: async (meta, pages) => {
          // Đọc path hiện tại lúc lưu (file có thể đã được đổi tên/di chuyển)
          const live = this.currentFilePath
          if (!live) return
          const current = this.app.vault.getAbstractFileByPath(live)
          if (!(current instanceof TFile)) return
          try {
            await this.app.vault.modify(current, exportNotebookToMarkdown(meta, pages))
          } catch (err) {
            new Notice('MyBook: không lưu được file (đã bị xóa/di chuyển?)')
            throw err
          }
        },
        onSavePdf: async (data, filename) => {
          // Lưu PDF cạnh file vở, tên trùng thì tăng số (không ghi đè)
          const slash = path.lastIndexOf('/')
          const dir = slash >= 0 ? path.substring(0, slash) : ''
          const base = filename.replace(/\.pdf$/i, '') || 'notebook'
          let target = dir ? `${dir}/${base}.pdf` : `${base}.pdf`
          for (let n = 1; n < 100; n++) {
            if (!this.app.vault.getAbstractFileByPath(target)) break
            target = dir ? `${dir}/${base} ${n}.pdf` : `${base} ${n}.pdf`
          }
          try {
            await this.app.vault.createBinary(target, data)
            new Notice(`MyBook: đã xuất PDF → ${target}`)
          } catch (err) {
            new Notice(`MyBook: không lưu được PDF (${err instanceof Error ? err.message : err})`)
            throw err
          }
        },
        onNavigateLink: (target: string) => {
          void this.app.workspace.openLinkText(target, this.currentFilePath ?? path)
        },
      })))
    } catch (err) {
      console.error('[MyBook] render view failed:', err)
      new Notice(`MyBook: lỗi hiển thị vở (${err instanceof Error ? err.message : err})`)
    }
  }

  async onClose(): Promise<void> {
    this.root?.unmount()
    this.root = null
    this.currentFilePath = null
    this.loadingPath = null
  }
}
