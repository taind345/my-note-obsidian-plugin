export const PAGE_WIDTH = 800
export const PAGE_HEIGHT = 1100
export const TOP_MARGIN = 64

/**
 * Độ rộng textbox mặc định: 45% so với mức chuẩn cũ (520px).
 * Khi tạo/click box: gọn gàng (234px).
 * Khi paste văn bản dài: tự động nhận biết và mở rộng về mức chuẩn (520px).
 */
export const FULL_TEXTBOX_WIDTH = 520
export const DEFAULT_TEXTBOX_WIDTH = Math.round(FULL_TEXTBOX_WIDTH * 0.45) // 234px


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
