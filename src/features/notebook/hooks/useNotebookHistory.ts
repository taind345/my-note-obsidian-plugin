import { useCallback, useEffect, useRef, useState } from 'react'
import type { HistoryEntry, PageData } from '@/shared/types/notebook'

export const MAX_HISTORY = 50

function clonePageSnapshot(page: PageData): Omit<HistoryEntry, 'pageId'> {
  return {
    textBoxes: JSON.parse(JSON.stringify(page.textBoxes)),
    drawings: JSON.parse(JSON.stringify(page.drawings)),
    images: JSON.parse(JSON.stringify(page.images ?? [])),
  }
}

interface UseNotebookHistoryOptions {
  onDirty: (pageId: string, updatedPages: PageData[]) => void
}

/**
 * Undo/redo cho vở vật lý (cap 50). Mỗi entry là deep-clone 1 trang
 * (textBoxes/drawings/images). Giữ nguyên semantics của App.tsx gốc:
 * push clear redo · undo push redo rồi restore · redo ngược lại.
 */
export function useNotebookHistory(
  setPages: React.Dispatch<React.SetStateAction<PageData[]>>,
  options: UseNotebookHistoryOptions
) {
  const undoStack = useRef<HistoryEntry[]>([])
  const redoStack = useRef<HistoryEntry[]>([])
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const { onDirty } = options
  const onDirtyRef = useRef(onDirty)
  useEffect(() => {
    onDirtyRef.current = onDirty
  }, [onDirty])

  const pushHistory = useCallback(
    (pageId: string, pageData: PageData) => {
      undoStack.current.push({ pageId, ...clonePageSnapshot(pageData) })
      if (undoStack.current.length > MAX_HISTORY) {
        undoStack.current.shift()
      }
      redoStack.current = []
      setCanUndo(undoStack.current.length > 0)
      setCanRedo(false)
    },
    []
  )

  const handleUndo = useCallback(() => {
    if (undoStack.current.length === 0) return
    const prev = undoStack.current.pop()
    if (!prev) return

    setPages((currPages) => {
      const targetPage = currPages.find((p) => p.id === prev.pageId)
      if (!targetPage) return currPages

      redoStack.current.push({ pageId: prev.pageId, ...clonePageSnapshot(targetPage) })
      if (redoStack.current.length > MAX_HISTORY) {
        redoStack.current.shift()
      }

      const updated = currPages.map((p) =>
        p.id === prev.pageId
          ? {
              ...p,
              textBoxes: prev.textBoxes,
              drawings: prev.drawings,
              images: prev.images ?? [],
              updatedAt: Date.now(),
            }
          : p
      )
      onDirtyRef.current(prev.pageId, updated)
      return updated
    })

    setCanUndo(undoStack.current.length > 0)
    setCanRedo(redoStack.current.length > 0)
  }, [setPages])

  const handleRedo = useCallback(() => {
    if (redoStack.current.length === 0) return
    const next = redoStack.current.pop()
    if (!next) return

    setPages((currPages) => {
      const targetPage = currPages.find((p) => p.id === next.pageId)
      if (!targetPage) return currPages

      undoStack.current.push({ pageId: next.pageId, ...clonePageSnapshot(targetPage) })
      if (undoStack.current.length > MAX_HISTORY) {
        undoStack.current.shift()
      }

      const updated = currPages.map((p) =>
        p.id === next.pageId
          ? {
              ...p,
              textBoxes: next.textBoxes,
              drawings: next.drawings,
              images: next.images ?? [],
              updatedAt: Date.now(),
            }
          : p
      )
      onDirtyRef.current(next.pageId, updated)
      return updated
    })

    setCanUndo(undoStack.current.length > 0)
    setCanRedo(redoStack.current.length > 0)
  }, [setPages])

  return { pushHistory, handleUndo, handleRedo, canUndo, canRedo }
}
