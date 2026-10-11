import type { EditorTab, EditorMode } from '@/shared/types/notebook'
import { X, Plus, FileText, BookOpen, Code, PanelLeft, Columns } from 'lucide-react'

interface TabBarProps {
  tabs: EditorTab[]
  activeTabId: string | null
  isSidebarOpen?: boolean
  onToggleSidebar?: () => void
  onSelectTab: (id: string) => void
  onCloseTab: (id: string) => void
  onQuickOpen: () => void
  splitView?: boolean
  onToggleSplit?: () => void
}

export function TabBar({
  tabs,
  activeTabId,
  isSidebarOpen = true,
  onToggleSidebar,
  onSelectTab,
  onCloseTab,
  onQuickOpen,
  splitView = false,
  onToggleSplit,
}: TabBarProps) {

  const getTabIcon = (mode: EditorMode) => {
    switch (mode) {
      case 'mynote':
        return <BookOpen size={13} className="tab-type-icon mynote" />
      case 'code':
        return <Code size={13} className="tab-type-icon code" />
      default:
        return <FileText size={13} className="tab-type-icon md" />
    }
  }

  return (
    <div className="obsidian-tab-strip">
      {onToggleSidebar && (
        <button
          type="button"
          className={`tabbar-sidebar-toggle-btn ${isSidebarOpen ? 'active' : ''}`}
          onClick={onToggleSidebar}
          title={isSidebarOpen ? 'Collapse Sidebar (Ctrl+\\)' : 'Expand Sidebar (Ctrl+\\)'}
        >
          <PanelLeft size={16} />
        </button>
      )}
      <div className="tab-items-container">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId
          return (
            <div
              key={tab.id}
              className={`obsidian-tab ${isActive ? 'active' : ''}`}
              onClick={() => onSelectTab(tab.id)}
              title={tab.path || tab.title}
            >
              {getTabIcon(tab.mode)}
              <span className="tab-title">{tab.title}</span>

              {tab.isDirty && <span className="tab-dirty-dot" title="Unsaved changes">●</span>}

              <button
                type="button"
                className="tab-close-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  onCloseTab(tab.id)
                }}
                title="Close tab (Ctrl+W)"
              >
                <X size={12} />
              </button>
            </div>
          )
        })}

        {/* Nút + mở QuickOpen để chọn file cho tab mới (như Ctrl+O) */}
        <div className="tab-new-wrapper">
          <button
            type="button"
            className="tab-new-btn"
            onClick={onQuickOpen}
            title="Mở file vào tab mới (Ctrl+O)"
          >
            <Plus size={15} />
          </button>
        </div>

        {onToggleSplit && (
          <button
            type="button"
            className={`tabbar-sidebar-toggle-btn ${splitView ? 'active' : ''}`}
            onClick={onToggleSplit}
            title={splitView ? 'Tắt chia màn hình (Unsplit)' : 'Chia màn hình 2 note (Split view)'}
          >
            <Columns size={15} />
          </button>
        )}

        {/* Núi + mặt trời trang trí góc phải thanh tab (chỉ theme pastel) */}
        <span className="tabbar-mountain-doodle" aria-hidden="true">
          <img src="/doodles/mountain-range.png" alt="" draggable={false} />
          <img className="tabbar-sun" src="/doodles/sun.png" alt="" draggable={false} />
        </span>
      </div>
    </div>
  )
}
