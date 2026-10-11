import { STROKE_WIDTHS, type WidthDef } from '@/shared/lib/tools-config'

interface WidthPickerProps {
  value: number
  onChange: (width: number) => void
  /** Plugin dùng bản gọn (chỉ chấm, không số). App dùng bản đầy đủ. */
  compact?: boolean
  /** Ghi đè dải widths (plugin dùng nấc riêng) — mặc định STROKE_WIDTHS. */
  widths?: WidthDef[]
}

/** Chọn độ dày nét 5–6 nấc — dùng chung app + plugin. */
export function WidthPicker({ value, onChange, compact = false, widths = STROKE_WIDTHS }: WidthPickerProps) {
  return (
    <div className="stroke-level-selector" title="Stroke Width">
      {widths.map((sw) => (
        <button
          key={sw.value}
          type="button"
          className={`stroke-level-btn ${value === sw.value ? 'active' : ''}`}
          onClick={() => onChange(sw.value)}
          title={sw.title}
        >
          <span
            className="level-dot"
            style={{
              width: `${Math.min(10, Math.max(3, sw.value))}px`,
              height: `${Math.min(10, Math.max(3, sw.value))}px`,
            }}
          />
          {!compact && <span className="level-num">{sw.label}</span>}
        </button>
      ))}
    </div>
  )
}
