import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Keyboard, Settings, RotateCcw, Check, Sparkles } from 'lucide-react'
import type { PaperPattern } from '../types/notebook'
import { FONT_OPTIONS, type FontKind } from '../utils/fonts'

export interface AppShortcuts {
  undo: string
  redo: string
  quickSave: string
  toggleSidebar: string
  openSettings: string
  toolSelect: string
  toolRect: string
  toolCircle: string
  toolArrow: string
  toolLine: string
  toolPen: string
  toolText: string
  toolEraser: string
  toolHighlighter: string
  toggleToolLock: string
}

export const DEFAULT_SHORTCUTS: AppShortcuts = {
  undo: 'Ctrl+Z',
  redo: 'Ctrl+Y',
  quickSave: 'Ctrl+S',
  toggleSidebar: 'Ctrl+\\',
  openSettings: 'Ctrl+,',
  toolSelect: '1',
  toolRect: '2',
  toolCircle: '3',
  toolArrow: '4',
  toolLine: '5',
  toolPen: '6',
  toolText: '7',
  toolEraser: '8',
  toolHighlighter: '9',
  toggleToolLock: 'Q',
}

/** Giao diện màu của app (đổi trong Settings > General) */
export type AppTheme = 'default' | 'pastel'

export const APP_THEMES: { id: AppTheme; label: string; desc: string }[] = [
  { id: 'default', label: 'Mặc định (Default)', desc: 'Xanh dương sách vở classic' },
  { id: 'pastel', label: 'Pastel "Better Notes"', desc: 'Kem + caro periwinkle, doodle cute' },
]

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  fonts: Record<FontKind, string>
  onChangeFont: (kind: FontKind, value: string) => void
  currentPattern: PaperPattern
  onChangePattern: (pattern: PaperPattern) => void
  flipAnimation: boolean
  onToggleFlipAnimation: () => void
  currentTheme: AppTheme
  onChangeTheme: (theme: AppTheme) => void
  shortcuts: AppShortcuts
  onUpdateShortcuts: (newShortcuts: AppShortcuts) => void
}

export function SettingsModal({
  isOpen,
  onClose,
  fonts,
  onChangeFont,
  currentPattern,
  onChangePattern,
  flipAnimation,
  onToggleFlipAnimation,
  currentTheme,
  onChangeTheme,
  shortcuts,
  onUpdateShortcuts,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'shortcuts' | 'general'>('shortcuts')
  const [editingKey, setEditingKey] = useState<keyof AppShortcuts | null>(null)
  const [localShortcuts, setLocalShortcuts] = useState<AppShortcuts>(shortcuts)
  const [savedBadge, setSavedBadge] = useState(false)

  useEffect(() => {
    setLocalShortcuts(shortcuts)
  }, [shortcuts])

  // Key recording listener when rebinding a shortcut
  useEffect(() => {
    if (!editingKey) return

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      if (e.key === 'Escape') {
        setEditingKey(null)
        return
      }

      const parts: string[] = []
      if (e.ctrlKey || e.metaKey) parts.push('Ctrl')
      if (e.altKey) parts.push('Alt')
      if (e.shiftKey && parts.length > 0) parts.push('Shift')

      let keyName = e.key
      if (keyName === ' ') keyName = 'Space'
      else if (keyName.length === 1) keyName = keyName.toUpperCase()

      if (!['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
        parts.push(keyName)
        const combo = parts.join('+')
        setLocalShortcuts((prev) => ({ ...prev, [editingKey]: combo }))
        setEditingKey(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [editingKey])

  if (!isOpen) return null

  const handleSave = () => {
    onUpdateShortcuts(localShortcuts)
    setSavedBadge(true)
    setTimeout(() => {
      setSavedBadge(false)
      onClose()
    }, 400)
  }

  const handleResetDefaults = () => {
    setLocalShortcuts(DEFAULT_SHORTCUTS)
    onUpdateShortcuts(DEFAULT_SHORTCUTS)
  }

  const shortcutLabels: Record<keyof AppShortcuts, string> = {
    undo: 'Hoàn tác (Undo)',
    redo: 'Làm lại (Redo)',
    quickSave: 'Lưu nhanh (Quick Save)',
    toggleSidebar: 'Bật/Tắt thanh thư mục (Toggle Sidebar)',
    openSettings: 'Mở Cài đặt (Open Settings)',
    toolSelect: 'Công cụ: Con trỏ chọn (Select)',
    toolRect: 'Công cụ: Hình chữ nhật (Rectangle)',
    toolCircle: 'Công cụ: Hình tròn (Circle)',
    toolArrow: 'Công cụ: Mũi tên (Arrow)',
    toolLine: 'Công cụ: Đoạn thẳng (Line)',
    toolPen: 'Công cụ: Bút viết (Pen)',
    toolText: 'Công cụ: Hộp chữ (Text Box)',
    toolEraser: 'Công cụ: Tẩy xóa (Eraser)',
    toolHighlighter: 'Công cụ: Bút dạ quang (Highlighter)',
    toggleToolLock: 'Khóa công cụ vẽ liên tục (Tool Lock)',
  }

  const modalContent = (
    <div className="folder-picker-overlay settings-modal-overlay" onClick={onClose}>
      <div className="folder-picker-modal settings-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header settings-header">
          <div className="settings-title-group">
            <Settings size={18} className="settings-icon" />
            <h3>Cài đặt & Phím tắt (Settings)</h3>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="settings-tabs-strip">
          <button
            type="button"
            className={`settings-tab-btn ${activeTab === 'shortcuts' ? 'active' : ''}`}
            onClick={() => setActiveTab('shortcuts')}
          >
            <Keyboard size={15} />
            <span>Phím tắt (Shortcuts)</span>
          </button>
          <button
            type="button"
            className={`settings-tab-btn ${activeTab === 'general' ? 'active' : ''}`}
            onClick={() => setActiveTab('general')}
          >
            <Sparkles size={15} />
            <span>Giao diện & Vở viết (General)</span>
          </button>
        </div>

        {/* Body */}
        <div className="modal-body settings-body">
          {activeTab === 'shortcuts' ? (
            <div className="shortcuts-table-container">
              <div className="shortcuts-instruction-hint">
                💡 <em>Nhấp vào ô phím để bấm phím mới thay đổi, hoặc bấm "Đặt lại mặc định".</em>
              </div>
              <table className="shortcuts-table">
                <thead>
                  <tr>
                    <th>Thao tác</th>
                    <th>Phím tắt</th>
                    <th>Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {(Object.keys(shortcutLabels) as (keyof AppShortcuts)[]).map((actionKey) => {
                    const isEditing = editingKey === actionKey
                    return (
                      <tr key={actionKey} className={isEditing ? 'is-editing-key' : ''}>
                        <td className="action-name-cell">{shortcutLabels[actionKey]}</td>
                        <td className="shortcut-key-cell">
                          <button
                            type="button"
                            className={`key-badge-btn ${isEditing ? 'recording' : ''}`}
                            onClick={() => setEditingKey(actionKey)}
                            title="Click to rebind key"
                          >
                            {isEditing ? 'Nhấn phím...' : localShortcuts[actionKey]}
                          </button>
                        </td>
                        <td className="shortcut-action-cell">
                          {isEditing ? (
                            <button
                              type="button"
                              className="cancel-rebind-btn"
                              onClick={() => setEditingKey(null)}
                            >
                              Hủy
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="edit-rebind-btn"
                              onClick={() => setEditingKey(actionKey)}
                            >
                              Sửa
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="general-settings-form">
              <div className="setting-row">
                <div className="setting-info">
                  <label className="setting-label">Giao diện màu (Color Theme)</label>
                  <span className="setting-desc">Pastel "Better Notes": nền kem, caro periwinkle + doodle cute</span>
                </div>
              </div>
              <div className="theme-picker-grid">
                {APP_THEMES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`theme-option-card ${currentTheme === t.id ? 'active' : ''} theme-preview-${t.id}`}
                    onClick={() => onChangeTheme(t.id)}
                    title={t.desc}
                  >
                    <span className="theme-swatches">
                      <span className="sw sw-bg" />
                      <span className="sw sw-paper" />
                      <span className="sw sw-accent" />
                    </span>
                    <span className="theme-option-text">
                      <strong>{t.label}</strong>
                      <span>{t.desc}</span>
                    </span>
                    {currentTheme === t.id && <Check size={15} className="theme-check" />}
                  </button>
                ))}
              </div>

              {(
                [
                  { kind: 'markdown', label: 'Font file Markdown (.md)', desc: 'Reading, Live, Simple' },
                  { kind: 'mynote', label: 'Font vở MyNote (.mynote.md)', desc: 'Chữ viết tay trên trang giấy' },
                  { kind: 'code', label: 'Font file Code', desc: 'Trình soạn code (.js, .py...)' },
                ] as { kind: FontKind; label: string; desc: string }[]
              ).map((row) => (
                <div className="setting-row" key={row.kind}>
                  <div className="setting-info">
                    <label className="setting-label">{row.label}</label>
                    <span className="setting-desc">{row.desc}</span>
                  </div>
                  <select
                    className="compact-select settings-select"
                    value={fonts[row.kind]}
                    onChange={(e) => onChangeFont(row.kind, e.target.value)}
                  >
                    {FONT_OPTIONS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                        {f.value === 'cascadia' ? ' (Mặc định)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              ))}

              <div className="setting-row">
                <div className="setting-info">
                  <label className="setting-label">Dòng kẻ giấy mặc định</label>
                  <span className="setting-desc">Kiểu kẻ trang giấy khi tạo trang mới</span>
                </div>
                <select
                  className="compact-select settings-select"
                  value={currentPattern}
                  onChange={(e) => onChangePattern(e.target.value as PaperPattern)}
                >
                  <option value="ruled">Ruled Lined (Kẻ ngang)</option>
                  <option value="grid">Grid (Ô vuông Caro)</option>
                  <option value="dots">Dots (Chấm bi)</option>
                  <option value="blank">Blank (Trơn không kẻ)</option>
                </select>
              </div>

              <div className="setting-row">
                <div className="setting-info">
                  <label className="setting-label">Hiệu ứng lật trang 3D (Page Flip)</label>
                  <span className="setting-desc">Bật animation uốn trang 3D khi chuyển trang trong chế độ 2-Page Spread</span>
                </div>
                <label className="settings-toggle-switch">
                  <input
                    type="checkbox"
                    checked={flipAnimation}
                    onChange={onToggleFlipAnimation}
                  />
                  <span className="switch-slider" />
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer settings-footer">
          {activeTab === 'shortcuts' && (
            <button
              type="button"
              className="btn-cancel reset-defaults-btn"
              onClick={handleResetDefaults}
              title="Khôi phục tất cả phím tắt về mặc định"
            >
              <RotateCcw size={13} />
              <span>Đặt lại mặc định</span>
            </button>
          )}
          <div className="footer-right-buttons">
            <button type="button" className="btn-cancel" onClick={onClose}>
              Đóng
            </button>
            <button type="button" className="btn-primary save-settings-btn" onClick={handleSave}>
              {savedBadge ? (
                <>
                  <Check size={14} /> Đã lưu!
                </>
              ) : (
                'Lưu thay đổi'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(modalContent, document.body)
}
