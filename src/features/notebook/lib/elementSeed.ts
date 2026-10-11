/**
 * Seed ổn định cho rough.js theo id element — cùng 1 nét vẽ render ra cùng
 * 1 hình dù vẽ ở preview, static hay export PDF (không morph khi thả tay).
 */
export function getElementSeed(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash) || 1
}
