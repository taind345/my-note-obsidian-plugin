import { useRef, useEffect } from 'react'
import { Excalidraw } from '@excalidraw/excalidraw'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { PAGE_WIDTH, PAGE_HEIGHT } from '@/shared/lib/lineSnap'
import '@excalidraw/excalidraw/index.css'

interface ExcalidrawPageCanvasProps {
  pageId: string
  initialData?: any
  onChange?: (elements: any[], appState: any) => void
}

export default function ExcalidrawPageCanvas({
  pageId,
  initialData,
  onChange,
}: ExcalidrawPageCanvasProps) {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)

  useEffect(() => {
    // When switching pages, reset or update scene
    if (apiRef.current && initialData) {
      apiRef.current.updateScene({
        elements: initialData.elements || [],
        appState: {
          viewBackgroundColor: 'transparent',
          zenModeEnabled: true,
          scrollX: 0,
          scrollY: 0,
          zoom: { value: 1 as any },
        },
      })
    }
  }, [pageId, initialData])

  return (
    <div
      className="excalidraw-page-container"
      style={{
        width: `${PAGE_WIDTH}px`,
        height: `${PAGE_HEIGHT}px`,
        position: 'absolute',
        top: 0,
        left: 0,
        zIndex: 5,
      }}
    >
      <Excalidraw
        excalidrawAPI={(api) => {
          apiRef.current = api
        }}
        zenModeEnabled={true}
        gridModeEnabled={false}
        theme="light"
        viewModeEnabled={false}
        UIOptions={{
          canvasActions: {
            changeViewBackgroundColor: false,
            clearCanvas: false,
            export: false,
            loadScene: false,
            saveToActiveFile: false,
            toggleTheme: false,
          },
        }}
        initialData={{
          appState: {
            viewBackgroundColor: 'transparent',
            zenModeEnabled: true,
            scrollX: 0,
            scrollY: 0,
            zoom: { value: 1 as any },
            currentItemRoughness: 0, // Clean drawing mode as requested
          },
          elements: initialData?.elements || [],
        }}
        onChange={(elements, appState) => {
          if (onChange) {
            onChange(elements as any, appState)
          }
        }}
      />
    </div>
  )
}
