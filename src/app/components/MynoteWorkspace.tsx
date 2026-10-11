import type { RefObject } from 'react'
import type {
  DrawingElement,
  NotebookMetadata,
  PageData,
  PageImageData,
  PaperPattern,
  TextBoxData,
  ToolType,
  ViewSpreadMode,
} from '@/shared/types/notebook'
import { HeaderToolbar } from '@/shared/ui/HeaderToolbar'
import { PageNavigator } from '@/shared/ui/PageNavigator'
import { ThemeDoodles } from '@/shared/ui/ThemeDoodles'
import { NotebookPage } from '@/features/notebook/components/NotebookPage'
import { PAGE_WIDTH, PAGE_HEIGHT } from '@/shared/lib/lineSnap'
import { getVisiblePages } from '../lib/page-view'

interface MynoteWorkspaceProps {
  forceVertical: boolean
  viewMode: ViewSpreadMode
  pages: PageData[]
  currentPageIndex: number
  activeTool: ToolType
  strokeColor: string
  strokeWidth: number
  paperPattern: PaperPattern
  flipAnimation: boolean
  fontFamily: string
  linePitch: number
  canUndo: boolean
  canRedo: boolean
  autosaveStatus: 'saved' | 'saving' | 'dirty'
  hasSelectedElement: boolean
  isToolLocked: boolean
  handDrawnStyle: boolean
  isFlipping: boolean
  flipDirection: 'next' | 'prev'
  flipPhase: 'closing' | 'opening' | null
  zoom: number
  isPastel: boolean
  meta: NotebookMetadata | null
  activeTabTitle: string
  selectedTextBoxIds: string[]
  selectedDrawingIds: string[]
  selectedImageIds: string[]
  workspaceRef: RefObject<HTMLElement | null>
  onSelectTool: (tool: ToolType) => void
  onToggleToolLock: () => void
  onToggleHandDrawnStyle: () => void
  onChangeStrokeColor: (color: string) => void
  onChangeStrokeWidth: (width: number) => void
  onChangePaperPattern: (pattern: PaperPattern) => void
  onChangeViewMode: (mode: ViewSpreadMode) => void
  onToggleFlipAnimation: () => void
  onOpenSettings: () => void
  onChangeFontFamily: (font: string) => void
  onUndo: () => void
  onRedo: () => void
  onAddPage: () => void
  onOpenExportModal: () => void
  onNewNotebook: () => void
  onExportMarkdown: () => void
  onImportMarkdown: (file: File) => void
  onDeselectAll: () => void
  onSelectTextBox: (id: string | null) => void
  onSelectTextBoxes: (ids: string[]) => void
  onSelectDrawing: (id: string | null) => void
  onSelectDrawings: (ids: string[]) => void
  onUpdateTextBox: (pageId: string, boxId: string, patch: Partial<TextBoxData>) => void
  onDeleteTextBox: (pageId: string, boxId: string) => void
  onDuplicateTextBox: (pageId: string, boxId: string) => void
  onAddTextBox: (pageId: string, box: TextBoxData) => void
  onAddDrawingElement: (pageId: string, el: DrawingElement) => void
  onUpdateDrawingElement: (pageId: string, elemId: string, patch: Partial<DrawingElement>) => void
  onRemoveDrawingElement: (pageId: string, elemId: string) => void
  onReorderDrawing: (pageId: string, elemId: string, direction: 'front' | 'back') => void
  onSelectImages: (ids: string[]) => void
  onAddImage: (pageId: string, img: PageImageData) => void
  onUpdateImage: (pageId: string, imageId: string, patch: Partial<PageImageData>) => void
  onRemoveImage: (pageId: string, imageId: string) => void
  onDuplicateImage: (pageId: string, imageId: string) => void
  onReorderImage: (pageId: string, imageId: string, direction: 'front' | 'back') => void
  onAutoSwitchToSelect: () => void
  onNavigateLink: (targetName: string) => void
  onNavigatePage: (index: number) => void
  onDeleteCurrentPage: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onZoomReset: () => void
}

/**
 * Workspace vở vật lý (pane trái). Tách từ App.renderMynoteWorkspace —
 * presentational thuần túy, không giữ state (dễ test, dễ bổ sung view mode).
 * Split view ép `forceVertical` để cuộn dọc 1 trang cho gọn.
 */
export function MynoteWorkspace(p: MynoteWorkspaceProps) {
  const vm: ViewSpreadMode = p.forceVertical ? 'single-vertical' : p.viewMode
  const spreadPages = getVisiblePages(vm, p.pages, p.currentPageIndex)
  return (
    <div className="mynote-workspace-wrapper">
      <HeaderToolbar
        activeTool={p.activeTool}
        strokeColor={p.strokeColor}
        strokeWidth={p.strokeWidth}
        paperPattern={p.paperPattern}
        viewMode={p.viewMode}
        flipAnimation={p.flipAnimation}
        fontFamily={p.fontFamily}
        canUndo={p.canUndo}
        canRedo={p.canRedo}
        autosaveStatus={p.autosaveStatus}
        hasSelectedElement={p.hasSelectedElement}
        isToolLocked={p.isToolLocked}
        handDrawnStyle={p.handDrawnStyle}
        onSelectTool={p.onSelectTool}
        onToggleToolLock={p.onToggleToolLock}
        onToggleHandDrawnStyle={p.onToggleHandDrawnStyle}
        onChangeStrokeColor={p.onChangeStrokeColor}
        onChangeStrokeWidth={p.onChangeStrokeWidth}
        onChangePaperPattern={p.onChangePaperPattern}
        onChangeViewMode={p.onChangeViewMode}
        onToggleFlipAnimation={p.onToggleFlipAnimation}
        onOpenSettings={p.onOpenSettings}
        onChangeFontFamily={p.onChangeFontFamily}
        onUndo={p.onUndo}
        onRedo={p.onRedo}
        onAddPage={p.onAddPage}
        onOpenExportModal={p.onOpenExportModal}
        onNewNotebook={p.onNewNotebook}
        onExportMarkdown={p.onExportMarkdown}
        onImportMarkdown={p.onImportMarkdown}
      />

      <main
        ref={p.workspaceRef}
        className="notebook-workspace"
        style={{ transform: `scale(${p.zoom})`, transformOrigin: 'top center' }}
        onClick={(e) => {
          const target = e.target as HTMLElement
          if (
            target.classList.contains('notebook-workspace') ||
            target.classList.contains('notebook-desk')
          ) {
            p.onDeselectAll()
          }
        }}
      >
        <div
          className={`notebook-desk ${
            vm === 'spread' ? 'spread-view' : vm === 'single-vertical' ? 'vertical-view' : 'single-view'
          } ${!p.forceVertical && p.isFlipping ? `flipping-${p.flipDirection} flip-phase-${p.flipPhase}` : ''}`}
        >
          {spreadPages.map(({ page, isSpineLeft, isSpineRight }) => (
            <NotebookPage
              key={page.id}
              page={page}
              activeTool={p.activeTool}
              strokeColor={p.strokeColor}
              strokeWidth={p.strokeWidth}
              linePitch={p.linePitch}
              selectedTextBoxIds={p.selectedTextBoxIds}
              selectedElementIds={p.selectedDrawingIds}
              fontFamily={p.fontFamily}
              isSpineLeft={isSpineLeft}
              isSpineRight={isSpineRight}
              isToolLocked={p.isToolLocked}
              handDrawnStyle={p.handDrawnStyle}
              canvasPixelScale={p.zoom}
              onSelectTextBox={p.onSelectTextBox}
              onSelectTextBoxes={p.onSelectTextBoxes}
              onSelectElement={p.onSelectDrawing}
              onSelectElements={p.onSelectDrawings}
              onUpdateTextBox={p.onUpdateTextBox}
              onDeleteTextBox={p.onDeleteTextBox}
              onDuplicateTextBox={p.onDuplicateTextBox}
              onAddTextBox={p.onAddTextBox}
              onAddDrawingElement={p.onAddDrawingElement}
              onUpdateDrawingElement={p.onUpdateDrawingElement}
              onRemoveDrawingElement={p.onRemoveDrawingElement}
              onReorderDrawing={p.onReorderDrawing}
              selectedImageIds={p.selectedImageIds}
              onSelectImages={p.onSelectImages}
              onAddImage={p.onAddImage}
              onUpdateImage={p.onUpdateImage}
              onRemoveImage={p.onRemoveImage}
              onDuplicateImage={p.onDuplicateImage}
              onReorderImage={p.onReorderImage}
              onAutoSwitchToSelect={p.onAutoSwitchToSelect}
              onNavigateLink={p.onNavigateLink}
            />
          ))}
          {vm === 'spread' && spreadPages.length === 1 && !spreadPages[0].isSpineLeft && (
            <div
              className="notebook-sheet-placeholder"
              style={{
                width: `${PAGE_WIDTH}px`,
                height: `${PAGE_HEIGHT}px`,
                visibility: 'hidden',
                flexShrink: 0,
                pointerEvents: 'none',
              }}
              aria-hidden="true"
            />
          )}
        </div>
      </main>

      {p.isPastel && <ThemeDoodles />}

      <PageNavigator
        pages={p.pages}
        currentPageIndex={p.currentPageIndex}
        viewMode={vm}
        zoom={p.zoom}
        onNavigatePage={p.onNavigatePage}
        onAddPage={p.onAddPage}
        onDeleteCurrentPage={p.onDeleteCurrentPage}
        onZoomIn={p.onZoomIn}
        onZoomOut={p.onZoomOut}
        onZoomReset={p.onZoomReset}
      />
    </div>
  )
}
