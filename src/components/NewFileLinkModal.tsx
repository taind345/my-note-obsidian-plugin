import { createPortal } from 'react-dom'
import { X, FileText, BookOpen, Ban } from 'lucide-react'

interface NewFileLinkModalProps {
  isOpen: boolean
  targetName: string
  onClose: () => void
  onCreateMarkdown: (name: string) => void
  onCreateMyNote: (name: string) => void
}

export function NewFileLinkModal({
  isOpen,
  targetName,
  onClose,
  onCreateMarkdown,
  onCreateMyNote,
}: NewFileLinkModalProps) {
  if (!isOpen) return null

  return createPortal(
    <div className="new-file-modal-overlay" onClick={onClose}>
      <div className="new-file-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="new-file-modal-header">
          <h3 className="new-file-title">New File</h3>
          <button type="button" className="new-file-close-btn" onClick={onClose} title="Close">
            <X size={16} />
          </button>
        </div>

        <div className="new-file-modal-body">
          <p className="new-file-prompt-text">File does not exist. Do you want to create it?</p>
          <div className="new-file-target-name">{targetName}</div>
        </div>

        <div className="new-file-modal-actions">
          <button
            type="button"
            className="new-file-btn action-create-md"
            onClick={() => onCreateMarkdown(targetName)}
          >
            <FileText size={14} />
            <span>Create MD</span>
          </button>

          <button
            type="button"
            className="new-file-btn action-create-mynote"
            onClick={() => onCreateMyNote(targetName)}
          >
            <BookOpen size={14} />
            <span>Create MyNote</span>
          </button>

          <button type="button" className="new-file-btn action-nevermind" onClick={onClose}>
            <Ban size={14} />
            <span>Nevermind</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
