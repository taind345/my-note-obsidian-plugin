export type ToolType =
  | 'select'
  | 'pen'
  | 'highlighter'
  | 'eraser'
  | 'line'
  | 'arrow'
  | 'rect'
  | 'circle'
  | 'text'

export type PaperPattern = 'ruled' | 'grid' | 'dots' | 'blank'

export type ViewSpreadMode = 'spread' | 'single-horizontal' | 'single-vertical'

export type PenStyle = 'ballpoint' | 'fountain' | 'highlighter'

export interface Point {
  x: number
  y: number
  pressure?: number
  time?: number
}

export interface DrawingElement {
  id: string
  type: 'pen' | 'highlighter' | 'line' | 'arrow' | 'rect' | 'circle'
  points: Point[] // For freehand or line/arrow endpoints: [start, mid/curvature, end]
  x?: number      // For shapes (rect, circle)
  y?: number
  width?: number
  height?: number
  color: string
  strokeWidth: number
  opacity?: number
  roughness?: number
  fillColor?: string // e.g. 'transparent', 'rgba(37,99,235,0.1)', '#dbeafe'
  strokeStyle?: 'solid' | 'dashed'
  isCurved?: boolean // For curved arrows
  roundness?: boolean // For rounded rectangles
  penStyle?: PenStyle // ballpoint vs fountain nét thanh nét đậm
  isLocked?: boolean  // lock element
  seed?: number       // deterministic roughjs seed to prevent jitter
}

export interface TextBoxData {
  id: string
  x: number
  y: number
  width: number
  height?: number
  content: string
  isEditing?: boolean
  isLocked?: boolean
  /** Hiện khung card trắng kiểu "Better Notes" (washi tape + đổ bóng) */
  showFrame?: boolean
}

export interface PageImageData {
  id: string
  x: number
  y: number
  width: number
  height: number
  src: string // dataURL (base64) hoặc URL vault (/api/fs/raw?...)
  name?: string
  isLocked?: boolean
  /** Hiện khung card trắng kiểu "Better Notes" (washi tape + đổ bóng) */
  showFrame?: boolean
}

export interface PageData {
  id: string
  pageNumber: number
  pattern: PaperPattern
  textBoxes: TextBoxData[]
  drawings: DrawingElement[]
  images?: PageImageData[]
  updatedAt: number
}

export interface NotebookMetadata {
  id: string
  title: string
  pageIds: string[]
  createdAt: number
  updatedAt: number
  settings: {
    fontFamily: string
    linePitch: number
    theme: 'light' | 'sepia' | 'dark'
    defaultPattern: PaperPattern
    pattern?: PaperPattern
    flipAnimation?: boolean
    handDrawnStyle?: boolean
    penStyle?: PenStyle
    strokeWidthLevel?: number
  }
}

export interface HistoryEntry {
  pageId: string
  textBoxes: TextBoxData[]
  drawings: DrawingElement[]
  images?: PageImageData[]
}

export type ExportResolution = 'low' | 'medium' | 'high'

// Vault & Tab types for Obsidian 3-in-1 App
export type EditorMode = 'mynote' | 'markdown' | 'code'

export interface VaultFileItem {
  name: string
  path: string
  isDirectory: boolean
  ext: string
  size: number
  children?: VaultFileItem[]
}

export interface EditorTab {
  id: string
  path: string
  title: string
  mode: EditorMode
  isDirty?: boolean
  content?: string // for pure markdown or code
  notebookData?: {
    meta: NotebookMetadata
    pages: PageData[]
  }
}
