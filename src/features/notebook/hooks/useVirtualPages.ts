import { useCallback, useEffect, useRef, useState } from 'react'

interface UseVirtualPagesOptions {
  /** Số trang đầu mount ngay (tránh chớp placeholder ở first paint) */
  initialVisible?: number
  /** Overscan quanh viewport — chịu được cả 2 scroller (trong/ngoài) */
  overscanPx?: number
}

/**
 * Virtualize danh sách trang vở: chỉ mount trang trong/kề viewport, ngoài thì
 * placeholder giữ đúng kích thước layout (800×1100, transform-scale không ảnh
 * hưởng layout nên placeholder không cần nhân zoom).
 *
 * - root: null (viewport) + rootMargin lớn → đúng dù scroller là khung trong
 *   hay container ngoài của Obsidian.
 * - State trang giữ trong React nên unmount không mất data/selection.
 * - Trang mới thêm (addPage) thì `pin` để mount ngay + scroll tới được.
 */
export function useVirtualPages(pageIds: string[], opts: UseVirtualPagesOptions = {}) {
  const { initialVisible = 2, overscanPx = 1200 } = opts
  const [visibleIds, setVisibleIds] = useState<Set<string>>(() => new Set(pageIds.slice(0, initialVisible)))
  const visibleRef = useRef(visibleIds)
  visibleRef.current = visibleIds
  const observerRef = useRef<IntersectionObserver | null>(null)
  const observedRef = useRef(new Map<string, Element>())
  const refCbCache = useRef(new Map<string, (el: HTMLDivElement | null) => void>())

  // Cắt id đã xóa khỏi tập visible + dọn cache ref-callback
  useEffect(() => {
    setVisibleIds((prev) => {
      const next = new Set(pageIds.filter((id) => prev.has(id)))
      if (next.size === prev.size) return prev
      return next
    })
    const alive = new Set(pageIds)
    for (const id of [...refCbCache.current.keys()]) {
      if (!alive.has(id)) refCbCache.current.delete(id)
    }
    for (const id of [...observedRef.current.keys()]) {
      if (!alive.has(id)) observedRef.current.delete(id)
    }
  }, [pageIds])

  useEffect(() => {
    const margin = `${overscanPx}px 0px`
    observerRef.current = new IntersectionObserver(
      (entries) => {
        setVisibleIds((prev) => {
          let changed = false
          const next = new Set(prev)
          for (const e of entries) {
            const id = (e.target as HTMLElement).dataset.pageWrapId
            if (!id) continue
            if (e.isIntersecting) {
              if (!next.has(id)) {
                next.add(id)
                changed = true
              }
            } else if (next.has(id)) {
              next.delete(id)
              changed = true
            }
          }
          return changed ? next : prev
        })
      },
      { root: null, rootMargin: margin, threshold: 0 }
    )
    return () => {
      observerRef.current?.disconnect()
      observerRef.current = null
    }
  }, [overscanPx])

  // Ref-callback ổn định theo id (tránh unobserve/observe lại mỗi render)
  const observeRef = useCallback((id: string) => {
    let cb = refCbCache.current.get(id)
    if (!cb) {
      cb = (el: HTMLDivElement | null) => {
        const known = observedRef.current.get(id)
        if (known) {
          observerRef.current?.unobserve(known)
          observedRef.current.delete(id)
        }
        if (el) {
          observerRef.current?.observe(el)
          observedRef.current.set(id, el)
        }
      }
      refCbCache.current.set(id, cb)
    }
    return cb
  }, [])

  const isVisible = useCallback((id: string) => visibleRef.current.has(id), [])

  const pinId = useCallback((id: string) => {
    setVisibleIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)))
  }, [])

  return { visibleIds, observeRef, isVisible, pinId }
}
