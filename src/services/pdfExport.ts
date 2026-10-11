import type { ExportResolution, PageData } from '@/shared/types/notebook'

export interface PdfExportProgress {
  current: number
  total: number
  status: string
}

/**
 * Sequentially renders and exports notebook pages to PDF.
 * Avoids memory spikes by processing pages one-by-one and releasing image buffers.
 */
export async function exportNotebookPagesToPdf(
  pages: PageData[],
  renderPageElement: (page: PageData) => Promise<HTMLElement>,
  cleanupRenderedElement: (element: HTMLElement) => void,
  resolution: ExportResolution = 'medium',
  onProgress?: (progress: PdfExportProgress) => void
): Promise<void> {
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
      status: 'Finalizing PDF download...',
    })
  }

  // Yield before save
  await new Promise((resolve) => setTimeout(resolve, 50))
  pdf.save(`notebook-${Date.now()}.pdf`)
}
