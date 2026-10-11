export const PAGE_WIDTH = 800
export const PAGE_HEIGHT = 1100
export const TOP_MARGIN = 64

/**
 * Tỉ lệ zoom hiển thị của trang = rect thực tế / kích thước dữ liệu.
 * Trang giấy nằm trong ancestor bị `transform: scale()` (zoom tay/fit) nên
 * mọi tọa độ/khoảng chuột (clientX/Y) đều phải CHIA cho scale mới ra data.
 */
export function displayScale(rect: DOMRect | undefined, dataWidth: number): number {
  if (!rect || !rect.width || !dataWidth) return 1
  const s = rect.width / dataWidth
  return s > 0 ? s : 1
}
