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

export default class MyBookPlugin extends Plugin {
  async onload() {
    // Ảnh ![[...]] trong textbox resolve qua Vault API (resource path của Obsidian)
    setAssetResolver((filename) => this.resolveVaultImage(filename));

    this.registerView(MYBOOK_VIEW_TYPE, (leaf) => new MyBookView(leaf, this))

    // Nhận file .mynote.md bằng view vở (thay vì markdown thường)
    this.registerExtensions([MYBOOK_EXTS[0]], MYBOOK_VIEW_TYPE)

    // Fallback chắc ăn: Obsidian coi .mynote.md là md thường (đuôi sau dấu chấm
    // cuối), nên khi file vở bị mở bằng view markdown thì tự chuyển sang view vở.
    // NOTE: phải đợi Obsidian mở xong (view gán file xong) mới chuyển — check ngay
    // trong event sẽ thấy view còn trống và bỏ qua oan.
    this.registerEvent(
      this.app.workspace.on('file-open', (file) => {
        if (!file || !isMyBookNote(this.app, file)) return
        setTimeout(() => {
          void (async () => {
            try {
              const leaf =
                this.app.workspace.getMostRecentLeaf() ?? this.app.workspace.activeLeaf ?? null
              if (!leaf) return
              const view = leaf.view as unknown as {
                getViewType?: () => string
                file?: { path?: string }
              } | null
              if (!view || view.getViewType?.() !== 'markdown') return
              const showing = view.file?.path
              const active = this.app.workspace.getActiveFile()?.path
              if (showing !== file.path && active !== file.path) return
              await leaf.setViewState({ type: MYBOOK_VIEW_TYPE, active: true, state: { file: file.path } })
              const v = leaf.view
              if (v instanceof MyBookView) await v.loadPath(file.path)
            } catch (err) {
              console.error('[MyBook] auto-convert view failed:', err)
            }
          })()
        }, 80)
      })
    )

    // Menu chuột phải lên file vở: mở bằng MyBook
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (file instanceof TFile && isMyBookNote(this.app, file)) {
          menu.addItem((item) =>
            item
              .setTitle('Mở bằng vở MyBook')
              .setIcon('notebook-pen')
              .onClick(() => {
                void this.openInMyBook(file)
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
    setAssetResolver(null)
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
      const base = 'MyBook Note'
      const fresh = getEmptyNotebook(base, 'grid')
      const content = exportNotebookToMarkdown(fresh.meta, fresh.pages)
      // Thử tạo thật, tên trùng thì tăng số (không tin lookup trước vì có trường hợp
      // getAbstractFileByPath và create không thống nhất với nhau)
      let n = 0
      for (let attempt = 0; attempt < 100; attempt++) {
        const fileName = n === 0 ? `${dir}${base}.mynote.md` : `${dir}${base} ${n}.mynote.md`
        try {
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
      const leaf = this.app.workspace.getLeaf(true)
      await leaf.setViewState({ type: MYBOOK_VIEW_TYPE, active: true, state: { file: file.path } })
      // Tự lái view trực tiếp (không phụ thuộc Obsidian có gọi setState hay không)
      const view = leaf.view
      if (view instanceof MyBookView) {
        await view.loadPath(file.path)
      } else {
        new Notice('MyBook: mở view thất bại, thử Reload app (Ctrl+P)')
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

  constructor(leaf: WorkspaceLeaf, plugin: MyBookPlugin) {
    super(leaf)
    this.plugin = plugin
  }

  getViewType(): string {
    return MYBOOK_VIEW_TYPE
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
    return this.resolveFile()?.basename ?? 'MyBook'
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

  /** Tải + render file vở (bỏ qua nếu đang hiển thị đúng file đó) */
  async loadPath(path: string): Promise<void> {
    if (path === this.currentFilePath && this.root) return
    performance.mark('mybook:open-start')
    this.root?.unmount()
    this.root = null
    this.currentFilePath = path
    // Nhớ thư mục để lần tạo note sau rơi đúng chỗ
    const slash = path.lastIndexOf('/')
    lastMyBookDir = slash >= 0 ? path.substring(0, slash) : ''

    const container = this.containerEl.children[1]
    container.empty()
    container.addClass('mybook-obsidian-host')
    const loadingEl = container.createEl('div', {
      text: 'MyBook: đang tải vở...',
      cls: 'mybook-loading',
    })

    const file = this.app.vault.getAbstractFileByPath(path)
    if (!(file instanceof TFile)) {
      loadingEl.setText(`Không tìm thấy file ${path}`)
      return
    }

    let raw = ''
    try {
      raw = await this.app.vault.read(file)
    } catch {
      loadingEl.setText(`Không đọc được file ${file.path}`)
      return
    }

    const parsed = importNotebookFromMarkdown(raw)
    performance.mark('mybook:open-parsed')
    try {
      performance.measure('mybook:open read+parse', 'mybook:open-start', 'mybook:open-parsed')
    } catch {
      /* performance API không có trong môi trường lạ thì bỏ qua */
    }
    const initialMeta = parsed
      ? parsed.meta
      : getEmptyNotebook(file.basename, 'grid').meta
    const initialPages = parsed
      ? parsed.pages
      : getEmptyNotebook(file.basename, 'grid').pages

    container.empty()
    this.root = createRoot(container as HTMLElement)
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
  }
}
