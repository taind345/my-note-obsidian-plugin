import { get, set, del } from 'idb-keyval'
import type { NotebookMetadata, PageData, TextBoxData, PaperPattern } from '@/shared/types/notebook'

const META_KEY = 'notebook_meta_v4'
const PAGE_KEY_PREFIX = 'notebook_page_v4_'

// In-memory fallback if IndexedDB is restricted or unavailable
const memoryStore = new Map<string, any>()

function isIdbAvailable(): boolean {
  return typeof indexedDB !== 'undefined'
}

export async function loadNotebookMeta(): Promise<NotebookMetadata | null> {
  try {
    let meta: NotebookMetadata | null = null
    if (!isIdbAvailable()) {
      meta = memoryStore.get(META_KEY) || null
    } else {
      meta = (await get<NotebookMetadata>(META_KEY)) || memoryStore.get(META_KEY) || null
    }
    if (meta && meta.settings) {
      if (!meta.settings.fontFamily || meta.settings.fontFamily === 'handwriting') {
        meta.settings.fontFamily = 'cascadia'
      }
    }
    return meta
  } catch (err) {
    console.warn('IndexedDB unavailable, falling back to memory store:', err)
    return memoryStore.get(META_KEY) || null
  }
}

export async function saveNotebookMeta(meta: NotebookMetadata): Promise<void> {
  memoryStore.set(META_KEY, meta)
  try {
    if (isIdbAvailable()) {
      await set(META_KEY, meta)
    }
  } catch (err) {
    console.warn('IndexedDB save metadata fallback to memory:', err)
  }
}

export async function loadPage(pageId: string): Promise<PageData | null> {
  try {
    if (!isIdbAvailable()) {
      return memoryStore.get(PAGE_KEY_PREFIX + pageId) || null
    }
    const page = await get<PageData>(PAGE_KEY_PREFIX + pageId)
    return page || memoryStore.get(PAGE_KEY_PREFIX + pageId) || null
  } catch (err) {
    console.warn(`IndexedDB load page ${pageId} fallback to memory:`, err)
    return memoryStore.get(PAGE_KEY_PREFIX + pageId) || null
  }
}

export async function savePage(page: PageData): Promise<void> {
  memoryStore.set(PAGE_KEY_PREFIX + page.id, page)
  try {
    if (isIdbAvailable()) {
      await set(PAGE_KEY_PREFIX + page.id, page)
    }
  } catch (err) {
    console.warn(`IndexedDB save page ${page.id} fallback to memory:`, err)
  }
}

export async function deletePageData(pageId: string): Promise<void> {
  memoryStore.delete(PAGE_KEY_PREFIX + pageId)
  try {
    if (isIdbAvailable()) {
      await del(PAGE_KEY_PREFIX + pageId)
    }
  } catch (err) {
    console.warn(`IndexedDB delete page ${pageId} fallback:`, err)
  }
}

/**
 * Returns a completely blank/empty notebook with 1 empty page (no sample textboxes or drawings)
 */
export function getEmptyNotebook(title = 'Untitled Notebook', pattern: PaperPattern = 'ruled'): {
  meta: NotebookMetadata
  pages: PageData[]
} {
  const pageId = `page_${Date.now()}`
  const page1: PageData = {
    id: pageId,
    pageNumber: 1,
    pattern,
    textBoxes: [],
    drawings: [],
    images: [],
    updatedAt: Date.now(),
  }
  const meta: NotebookMetadata = {
    id: `nb_${Date.now()}`,
    title,
    pageIds: [pageId],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    settings: {
      fontFamily: 'cascadia',
      linePitch: 32,
      theme: 'light',
      defaultPattern: pattern,
      flipAnimation: true,
      handDrawnStyle: true,
    },
  }
  return { meta, pages: [page1] }
}

/**
 * Returns default starter notebook data structure matching the user's Obsidian sample
 * plus a hand-drawn diagram page matching Excalidraw's curved arrows and rounded rectangles.
 */
export function getDefaultFallbackNotebook(): {
  meta: NotebookMetadata
  pages: PageData[]
} {
  const page1Id = 'p_1'
  const page2Id = 'p_2'
  const page3Id = 'p_3'

  const starterTextBoxesPage1: TextBoxData[] = [
    {
      id: 'tb_obsidian_notes_p1',
      x: 80,
      y: 64,
      width: 680,
      content:
`**--note về phần này đọc ở đây ==>** [[0-note-csrf]]

> 1-Roadmap Csrs ...

## 2-LAB CSRS
1. Lab đầu tiên là lab THM về thực hành tấn công CSRF qua 1 cái web. đại khái là nó sẽ bắt mình viết 1 trang web mà sẽ gửi cái POST request giả danh cái POST request đăng nhập của trang đó==> sau đó email của nạn nhân đã được đổi thành email của attacker
[[THM_LAB_staffhub]]

2-> lab 2 này nó sẽ host 1 cái trang web==> người dùng click vào nó sẽ gửi request+token với role user
=> mấu chốt là cái token này quá dễ đoán(chỉ mã hóa role bằng base 64)
==> do đó có thể dễ dàng giả danh request
[[THM_LAB_weak_csrftoken]]

3-Lab portswigger đầu tiên về csrf
[[Lab-CSRF vulnerability with no defenses]]
-> đoạn này mình hiểu thêm về triết lý đơn giản của CSRS, và nguyên nhân khiến một request có thể dính CSRF

4-tiếp tục đến với series lab của portswigger, phần này tập trung vào việc bypass csrf token. Mình cũng có thể đọc lý thuyết ở bên trên.
==>csrf token bypass
lab này có vẻ nói về csrs token vailidation
[[Lab-CSRF where token validation depends on request method]]
-> lab này cho mình các kiến thức về bypass csrf token bằng another method request, liệu có thể fake origin/referer hay ko?`,
    },
  ]

  const starterTextBoxesPage2: TextBoxData[] = [
    {
      id: 'tb_obsidian_notes_p2',
      x: 80,
      y: 64,
      width: 680,
      content:
`- [ ] origin /referer
- nếu có csrf-token thì sao=> liệu có nó thì ko tấn công csrs được nữa dko?
- [ ] check tiếp xem ....
- [x] bỏ csrf xem nó có nhận ko
- [ ] mỗi phương thức POST hay còn GET

- form mẫu html gửi request

\`\`\`html
<html>
  <body>
    <form action="__ĐIỀN_URL_ĐÍCH__" method="__ĐIỀN_METHOD__">
      <input type="hidden" name="__ĐIỀN_TÊN_THAM_SỐ__" value="__ĐIỀN_EMAIL_MỚI__" />
    </form>
    <script>
      document.forms[0].submit();
    </script>
  </body>
</html>
\`\`\`

với method GET thì dùng iframe hoặc img

\`\`\`html
<img src="https://0af4004d0304d32680ff031e00fe00e5.web-security-academy.net/my-account/change-email?email=ha%40gmail.com">
\`\`\`

- trình duyệt tự gán origin và referer vào request
==> ko có cách nào thay đổi origin. Ngoại trừ thêm cờ no referer`,
    },
  ]

  const starterTextBoxesPage3: TextBoxData[] = [
    {
      id: 'tb_diagram_notes',
      x: 80,
      y: 40,
      width: 650,
      content:
`### 🎨 Excalidraw Hand-drawn Objects
- **Curved Arrow:** Click to select, then drag the **cyan center handle** to bend curvature!
- **Rounded Rectangle & Ellipse:** Drag any of the 8 resize handles to stretch or scale.`,
    },
  ]

  const page1: PageData = {
    id: page1Id,
    pageNumber: 1,
    pattern: 'ruled',
    textBoxes: starterTextBoxesPage1,
    drawings: [],
    images: [],
    updatedAt: Date.now(),
  }

  const page2: PageData = {
    id: page2Id,
    pageNumber: 2,
    pattern: 'ruled',
    textBoxes: starterTextBoxesPage2,
    drawings: [],
    images: [],
    updatedAt: Date.now(),
  }

  // Page 3: Hand-drawn diagram matching uploaded_media_2_1790497193868.png
  const page3: PageData = {
    id: page3Id,
    pageNumber: 3,
    pattern: 'ruled',
    textBoxes: starterTextBoxesPage3,
    images: [],
    drawings: [
      // Curved arrow matching uploaded_media_2_1790497193868.png
      {
        id: 'elem_curved_arrow_1',
        type: 'arrow',
        points: [
          { x: 120, y: 190 },
          { x: 230, y: 110 },
          { x: 340, y: 190 },
        ],
        color: '#2563eb',
        strokeWidth: 3,
        isCurved: true,
        roughness: 1.5,
      },
      // Rounded rectangle matching uploaded_media_2_1790497193868.png
      {
        id: 'elem_rect_1',
        type: 'rect',
        points: [],
        x: 430,
        y: 130,
        width: 270,
        height: 180,
        color: '#2563eb',
        strokeWidth: 3,
        roundness: true,
        roughness: 1.5,
        fillColor: 'transparent',
      },
      // Circle matching uploaded_media_2_1790497193868.png
      {
        id: 'elem_circle_1',
        type: 'circle',
        points: [],
        x: 120,
        y: 290,
        width: 210,
        height: 210,
        color: '#2563eb',
        strokeWidth: 3,
        roughness: 1.5,
        fillColor: 'transparent',
      },
      // Straight arrow matching uploaded_media_2_1790497193868.png
      {
        id: 'elem_straight_arrow_1',
        type: 'arrow',
        points: [
          { x: 300, y: 480 },
          { x: 390, y: 480 },
          { x: 480, y: 480 },
        ],
        color: '#2563eb',
        strokeWidth: 3,
        isCurved: false,
        roughness: 1.5,
      },
    ],
    updatedAt: Date.now(),
  }

  const meta: NotebookMetadata = {
    id: 'nb_default',
    title: 'My Physical Notebook',
    pageIds: [page1Id, page2Id, page3Id],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    settings: {
      fontFamily: 'cascadia',
      linePitch: 32,
      theme: 'light',
      defaultPattern: 'ruled',
      flipAnimation: true,
      handDrawnStyle: true,
    },
  }

  return { meta, pages: [page1, page2, page3] }
}
