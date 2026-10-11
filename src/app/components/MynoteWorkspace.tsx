import type { RefObject } from 'react'
import type {
  DrawingElement,
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
export function MynoteWorkspace({
  forceVertical,
  viewMode,
  pages,
  currentPageIndex,
  activeTool,
  strokeColor,
  strokeWidth,
  paperPattern,
  flipAnimation,
  fontFamily,
  linePitch,
  canUndo,
  canRedo,
  autosaveStatus,
  hasSelectedElement,
  isToolLocked,
  handDrawnStyle,
  isFlipping,
  flipDirection,
  flipPhase,
  zoom,
  isPastel,
  selectedTextBoxIds,
  selectedDrawingIds,
  selectedImageIds,
  workspaceRef,
  onSelectTool,
  onToggleToolLock,
  onToggleHandDrawnStyle,
  onChangeStrokeColor,
  onChangeStrokeWidth,
  onChangePaperPattern,
  onChangeViewMode,
  onToggleFlipAnimation,
  onOpenSettings,
  onChangeFontFamily,
  onUndo,
  onRedo,
  onAddPage,
  onOpenExportModal,
  onNewNotebook,
  onExportMarkdown,
  onImportMarkdown,
  onDeselectAll,
  onSelectTextBox,
  onSelectTextBoxes,
  onSelectDrawing,
  onSelectDrawings,
  onUpdateTextBox,
  onDeleteTextBox,
  onDuplicateTextBox,
  onAddTextBox,
  onAddDrawingElement,
  onUpdateDrawingElement,
  onRemoveDrawingElement,
  onReorderDrawing,
  onSelectImages,
  onAddImage,
  onUpdateImage,
  onRemoveImage,
  onDuplicateImage,
  onReorderImage,
  onAutoSwitchToSelect,
  onNavigateLink,
  onNavigatePage,
  onDeleteCurrentPage,
  onZoomIn,
  onZoomOut,
  onZoomReset,
}: MynoteWorkspaceProps) {
  const vm: ViewSpreadMode = forceVertical ? 'single-vertical' : viewMode
  const spreadPages = getVisiblePages(vm, pages, currentPageIndex)
  return (
    <div className="mynote-workspace-wrapper">
      <HeaderToolbar
        activeTool={activeTool}
        strokeColor={strokeColor}
        strokeWidth={strokeWidth}
        paperPattern={paperPattern}
        viewMode={viewMode}
        flipAnimation={flipAnimation}
        fontFamily={fontFamily}
        canUndo={canUndo}
        canRedo={canRedo}
        autosaveStatus={autosaveStatus}
        hasSelectedElement={hasSelectedElement}
        isToolLocked={isToolLocked}
        handDrawnStyle={handDrawnStyle}
        onSelectTool={onSelectTool}
        onToggleToolLock={onToggleToolLock}
        onToggleHandDrawnStyle={onToggleHandDrawnStyle}
        onChangeStrokeColor={onChangeStrokeColor}
        onChangeStrokeWidth={onChangeStrokeWidth}
        onChangePaperPattern={onChangePaperPattern}
        onChangeViewMode={onChangeViewMode}
        onToggleFlipAnimation={onToggleFlipAnimation}
        onOpenSettings={onOpenSettings}
        onChangeFontFamily={onChangeFontFamily}
        onUndo={onUndo}
        onRedo={onRedo}
        onAddPage={onAddPage}
        onOpenExportModal={onOpenExportModal}
        onNewNotebook={onNewNotebook}
        onExportMarkdown={onExportMarkdown}
        onImportMarkdown={onImportMarkdown}
      />

      <main
        ref={workspaceRef}
        className="notebook-workspace"
        style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
        onClick={(e) => {
          const target = e.target as HTMLElement
          if (
            target.classList.contains('notebook-workspace') ||
            target.classList.contains('notebook-desk')
          ) {
            onDeselectAll()
          }
        }}
      >
        <div
          className={`notebook-desk ${
            vm === 'spread' ? 'spread-view' : vm === 'single-vertical' ? 'vertical-view' : 'single-view'
          } ${!forceVertical && isFlipping ? `flipping-${flipDirection} flip-phase-${flipPhase}` : ''}`}
        >
          {spreadPages.map(({ page, isSpineLeft, isSpineRight }) => (
            <NotebookPage
              key={page.id}
              page={page}
              activeTool={activeTool}
              strokeColor={strokeColor}
              strokeWidth={strokeWidth}
              linePitch={linePitch}
              selectedTextBoxIds={selectedTextBoxIds}
              selectedElementIds={selectedDrawingIds}
              fontFamily={fontFamily}
              isSpineLeft={isSpineLeft}
              isSpineRight={isSpineRight}
              isToolLocked={isToolLocked}
              handDrawnStyle={handDrawnStyle}
              canvasPixelScale={zoom}
              onSelectTextBox={onSelectTextBox}
              onSelectTextBoxes={onSelectTextBoxes}
              onSelectElement={onSelectDrawing}
              onSelectElements={onSelectDrawings}
              onUpdateTextBox={onUpdateTextBox}
              onDeleteTextBox={onDeleteTextBox}
              onDuplicateTextBox={onDuplicateTextBox}
              onAddTextBox={onAddTextBox}
              onAddDrawingElement={onAddDrawingElement}
              onUpdateDrawingElement={onUpdateDrawingElement}
              onRemoveDrawingElement={onRemoveDrawingElement}
              onReorderDrawing={onReorderDrawing}
              selectedImageIds={selectedImageIds}
              onSelectImages={onSelectImages}
              onAddImage={onAddImage}
              onUpdateImage={onUpdateImage}
              onRemoveImage={onRemoveImage}
              onDuplicateImage={onDuplicateImage}
              onReorderImage={onReorderImage}
              onAutoSwitchToSelect={onAutoSwitchToSelect}
              onNavigateLink={onNavigateLink}
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

      {isPastel && <ThemeDoodles />}

      <PageNavigator
        pages={pages}
        currentPageIndex={currentPageIndex}
        viewMode={vm}
        zoom={zoom}
        onNavigatePage={onNavigatePage}
        onAddPage={onAddPage}
        onDeleteCurrentPage={onDeleteCurrentPage}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onZoomReset={onZoomReset}
      />
    </div>
  )
}
