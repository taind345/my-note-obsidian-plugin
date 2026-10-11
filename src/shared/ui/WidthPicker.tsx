import { STROKE_WIDTHS, type WidthDef } from '@/shared/lib/tools-config'

interface WidthPickerProps {
  value: number
  onChange: (width: number) => void
  /** Plugin dùng bản gọn (chỉ chấm, không số). App dùng bản đầy đủ. */
  compact?: boolean
  /** Ghi đè dải widths (plugin dùng nấc riêng) — mặc định STROKE_WIDTHS. */
  widths?: WidthDef[]
  /** Màu nét đang chọn để hiển thị chấm cùng màu với bút */
  strokeColor?: string
}

/** Chọn độ dày nét 5–6 nấc — dùng chung app + plugin. */
export function WidthPicker({ value, onChange, compact = false, widths = STROKE_WIDTHS, strokeColor }: WidthPickerProps) {
  return (
    <div className="stroke-level-selector" title="Stroke Width">
      {widths.map((sw) => {
        const dotSize =
          sw.value <= 1 ? 3 :
          sw.value <= 1.5 ? 4 :
          sw.value <= 3 ? 5.5 :
          sw.value <= 6 ? 7.5 : 10

        return (
          <button
            key={sw.value}
            type="button"
            className={`stroke-level-btn ${Math.abs(value - sw.value) < 0.05 ? 'active' : ''}`}
            onClick={() => onChange(sw.value)}
            title={sw.title}
          >
            <span
              className="level-dot"
              style={{
                width: `${dotSize}px`,
                height: `${dotSize}px`,
                backgroundColor: strokeColor || undefined,
              }}
            />
            {!compact && <span className="level-num">{sw.label}</span>}
          </button>
        )
      })}
    </div>
  )
}
