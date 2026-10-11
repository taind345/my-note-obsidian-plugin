import type { PageData, ViewSpreadMode } from '@/shared/types/notebook'

export interface VisiblePage {
  page: PageData
  isSpineLeft?: boolean
  isSpineRight?: boolean
}

/**
 * Tính trang hiển thị theo view mode. Spread luôn anchor index chẵn
 * (0-1, 2-3...) để cặp trang 1-2, 3-4 không bị lệch khi lật.
 */
export function getVisiblePages(
  vm: ViewSpreadMode,
  pageList: PageData[],
  pageIdx: number
): VisiblePage[] {
  const baseIdx = vm === 'spread' ? Math.floor(pageIdx / 2) * 2 : pageIdx
  const out: VisiblePage[] = []
  if (pageList.length > 0) {
    if (vm === 'spread') {
      const leftPage = pageList[baseIdx]
      const rightPage = pageList[baseIdx + 1]
      if (leftPage) out.push({ page: leftPage, isSpineRight: !!rightPage })
      if (rightPage) out.push({ page: rightPage, isSpineLeft: true })
    } else if (vm === 'single-vertical') {
      for (const p of pageList) out.push({ page: p })
    } else {
      const singlePage = pageList[pageIdx]
      if (singlePage) out.push({ page: singlePage })
    }
  }
  return out
}
