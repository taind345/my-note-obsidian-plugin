import type { NotebookMetadata, PageData } from '@/shared/types/notebook'

/**
 * Format notebook data into an Obsidian-compatible Excalidraw Markdown file (.excalidraw.md)
 * Contains clean readable Markdown notes on top, and embedded Excalidraw/Notebook JSON below.
 */
export function exportNotebookToMarkdown(
  meta: NotebookMetadata,
  pages: PageData[]
): string {
  const frontmatter = [
    '---',
    'mybook-plugin: parsed',
    'tags: [digital-notebook, mybook]',
    `title: "${meta.title.replace(/"/g, '\\"')}"`,
    `pageCount: ${pages.length}`,
    `updated: ${new Date().toISOString()}`,
    '---',
    '',
  ].join('\n')

  // Generate clean human-readable Markdown notes for each page
  const pageSections: string[] = []

  pages.forEach((page, index) => {
    const pageHeader = `# Page ${page.pageNumber || index + 1}`
    const textContents = page.textBoxes
      .map((tb) => tb.content.trim())
      .filter(Boolean)
      .join('\n\n')

    const imageNotes = (page.images ?? [])
      .map((_img, imgIdx) => `> 🖼️ Image ${imgIdx + 1} attached on this page (view in MyBook)`)
      .join('\n')
    const bodyParts = [textContents || '*(No text on this page)*']
    if (imageNotes) bodyParts.push(imageNotes)

    pageSections.push(`${pageHeader}\n\n${bodyParts.join('\n\n')}`)
  })

  const humanReadableContent = pageSections.join('\n\n---\n\n')

  // Embedded Digital Notebook & Excalidraw JSON payload in comment block
  const embeddedData = {
    type: 'excalidraw/digital-notebook',
    version: 2,
    source: 'digital-notebook-app',
    meta: {
      id: meta.id,
      title: meta.title,
      createdAt: meta.createdAt,
      updatedAt: Date.now(),
      settings: meta.settings,
    },
    pages: pages.map((p) => ({
      id: p.id,
      pageNumber: p.pageNumber,
      pattern: p.pattern,
      textBoxes: p.textBoxes,
      drawings: p.drawings,
      images: p.images ?? [],
      updatedAt: p.updatedAt,
    })),
  }

  // Serialize COMPACT (không indent): JSON scene của vở nhiều MB, whitespace
  // thụt dòng tốn ~50% dung lượng file mà không ai đọc (phần đọc được cho người
  // nằm ở text mirror phía trên). Kiểu Excalidraw cũng serialize compact.
  // Reader (JSON.parse) không phân biệt indent — tương thích 2 chiều tuyệt đối.
  const jsonBlock = [
    '',
    '%% # Digital Notebook Excalidraw Data',
    '```json',
    JSON.stringify(embeddedData),
    '```',
    '%%',
  ].join('\n')

  return `${frontmatter}${humanReadableContent}\n${jsonBlock}`
}

/**
 * Parse an imported Markdown or .excalidraw.md file into NotebookMetadata and PageData
 */
export function importNotebookFromMarkdown(content: string): {
  meta: NotebookMetadata
  pages: PageData[]
} | null {
  try {
    // 1. Check for embedded Excalidraw JSON block
    const match = content.match(/%% # Digital Notebook Excalidraw Data\s*```json\s*([\s\S]*?)\s*```\s*%%/)
    if (match && match[1]) {
      const data = JSON.parse(match[1])
      if (data && data.pages && Array.isArray(data.pages)) {
        const meta: NotebookMetadata = {
          id: data.meta?.id || `nb_${Date.now()}`,
          title: data.meta?.title || 'Imported Notebook',
          pageIds: data.pages.map((p: any) => p.id),
          createdAt: data.meta?.createdAt || Date.now(),
          updatedAt: Date.now(),
          settings: {
            fontFamily: data.meta?.settings?.fontFamily || 'cascadia',
            linePitch: data.meta?.settings?.linePitch || 32,
            theme: data.meta?.settings?.theme || 'light',
            defaultPattern: data.meta?.settings?.defaultPattern || 'ruled',
            flipAnimation: data.meta?.settings?.flipAnimation ?? true,
          },
        }

        const pages: PageData[] = data.pages.map((p: any, idx: number) => ({
          id: p.id || `p_${Date.now()}_${idx}`,
          pageNumber: p.pageNumber || idx + 1,
          pattern: p.pattern || meta.settings.defaultPattern,
          textBoxes: Array.isArray(p.textBoxes) ? p.textBoxes : [],
          drawings: Array.isArray(p.drawings) ? p.drawings : [],
          images: Array.isArray(p.images) ? p.images : [],
          updatedAt: p.updatedAt || Date.now(),
        }))

        return { meta, pages }
      }
    }

    // 2. If no embedded JSON, parse plain Markdown into pages (split by horizontal rules or headings)
    const cleanContent = content.replace(/^---[\s\S]*?---\s*/, '') // Remove frontmatter
    const rawPages = cleanContent.split(/\n---\n/)

    const now = Date.now()
    const pageIds: string[] = []
    const pages: PageData[] = rawPages.map((pageText, idx) => {
      const pid = `imported_page_${now}_${idx + 1}`
      pageIds.push(pid)

      const text = pageText.replace(/^#\s+Page\s+\d+\s*/i, '').trim()

      return {
        id: pid,
        pageNumber: idx + 1,
        pattern: 'ruled',
        textBoxes: text
          ? [
              {
                id: `tb_${pid}_0`,
                x: 72,
                y: 80,
                width: 650,
                content: text,
              },
            ]
          : [],
        drawings: [],
        images: [],
        updatedAt: now,
      }
    })

    const meta: NotebookMetadata = {
      id: `nb_${now}`,
      title: 'Imported Markdown',
      pageIds,
      createdAt: now,
      updatedAt: now,
      settings: {
        fontFamily: 'cascadia',
        linePitch: 32,
        theme: 'light',
        defaultPattern: 'ruled',
        flipAnimation: true,
      },
    }

    return { meta, pages }
  } catch (err) {
    console.error('Failed to parse Markdown notebook file:', err)
    return null
  }
}

/**
 * Trigger browser file download for a Markdown file
 */
export function downloadMarkdownFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.md') ? filename : `${filename}.excalidraw.md`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Read text content from a user-selected File object
 */
export function readMarkdownFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}
