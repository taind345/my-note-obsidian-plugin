import { STROKE_COLORS } from '@/shared/lib/tools-config'

interface ColorSwatchesProps {
  value: string
  onChange: (color: string) => void
  mini?: boolean
}

/** Dải chấm màu dùng chung: HeaderToolbar (app) + MiniToolbar (plugin). */
export function ColorSwatches({ value, onChange, mini = true }: ColorSwatchesProps) {
  return (
    <div className={`color-swatches${mini ? ' mini' : ''}`}>
      {STROKE_COLORS.map((c) => (
        <button
          key={c.value}
          type="button"
          className={`color-dot ${value === c.value ? 'selected' : ''}`}
          style={{ backgroundColor: c.value }}
          onClick={() => onChange(c.value)}
          title={c.label}
        />
      ))}
    </div>
  )
}
