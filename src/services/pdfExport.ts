import type { ExportResolution, PageData } from '@/shared/types/notebook'

export interface PdfExportProgress {
  current: number
  total: number
  status: string
}

export interface PdfExportResult {
  /** Bytes PDF — host tự quyết: web thì download, plugin Obsidian thì lưu vào vault */
  data: ArrayBuffer
  filename: string
}

/**
 * Render thuần các trang vở thành bytes PDF (không đụng DOM download hay
 * filesystem). Web app gọi exportNotebookPagesToPdf (render + tải về);
 * plugin Obsidian gọi renderNotebookPdf rồi tự lưu vào vault.
 */
export async function renderNotebookPdf(
  pages: PageData[],
  renderPageElement: (page: PageData) => Promise<HTMLElement>,
  cleanupRenderedElement: (element: HTMLElement) => void,
  resolution: ExportResolution = 'medium',
  onProgress?: (progress: PdfExportProgress) => void,
  filename?: string
): Promise<PdfExportResult> {
  // Dynamically import jsPDF and html-to-image so they are code-split and not in main bundle
  const { jsPDF } = await import('jspdf')
  const { toJpeg } = await import('html-to-image')

  const pixelRatioMap: Record<ExportResolution, number> = {
    low: 1.0,
    medium: 1.5,
    high: 2.0,
  }
  const pixelRatio = pixelRatioMap[resolution] || 1.5

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  })

  const total = pages.length

  for (let i = 0; i < total; i++) {
    const page = pages[i]
    if (onProgress) {
      onProgress({
        current: i + 1,
        total,
        status: `Processing Page ${page.pageNumber} (${i + 1}/${total})...`,
      })
    }

    // Mount page element into DOM
    const el = await renderPageElement(page)

    // Yield control to let DOM render and show loading UI
    await new Promise((resolve) => setTimeout(resolve, 60))

    // Capture single page image
    const dataUrl = await toJpeg(el, {
      pixelRatio,
      quality: resolution === 'low' ? 0.75 : 0.88,
      backgroundColor: '#ffffff',
    })

    // Clean up DOM element immediately to free DOM memory
    cleanupRenderedElement(el)

    // Add page to PDF
    if (i > 0) {
      pdf.addPage('a4', 'portrait')
    }
    pdf.addImage(dataUrl, 'JPEG', 0, 0, 210, 297, undefined, 'FAST')

    // Yield to GC and event loop
    await new Promise((resolve) => setTimeout(resolve, 40))
  }

  if (onProgress) {
    onProgress({
      current: total,
      total,
      status: 'Finalizing PDF...',
    })
  }

  // Yield before output
  await new Promise((resolve) => setTimeout(resolve, 50))
  const data = pdf.output('arraybuffer') as ArrayBuffer
  return { data, filename: filename || `notebook-${Date.now()}.pdf` }
}

/**
 * Web app: render + tải file về (giữ nguyên UX cũ).
 * Xử lý từng trang nối tiếp + gỡ buffer ngay để không spike RAM.
 */
export async function exportNotebookPagesToPdf(
  pages: PageData[],
  renderPageElement: (page: PageData) => Promise<HTMLElement>,
  cleanupRenderedElement: (element: HTMLElement) => void,
  resolution: ExportResolution = 'medium',
  onProgress?: (progress: PdfExportProgress) => void,
  filename?: string
): Promise<void> {
  const { data, filename: name } = await renderNotebookPdf(
    pages,
    renderPageElement,
    cleanupRenderedElement,
    resolution,
    onProgress,
    filename
  )
  const blob = new Blob([data], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
