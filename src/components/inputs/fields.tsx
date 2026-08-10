// 入力フィールド共通部品

import { useEffect, useState, type ReactNode } from 'react'
import { fmtYen } from '../../lib/format'

export function FieldRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline justify-between text-[11px] font-medium text-ink2">
        {label}
        {hint && <span className="font-normal text-muted">{hint}</span>}
      </span>
      {children}
    </label>
  )
}

const inputCls =
  'w-full rounded-md border border-ink/10 bg-white px-2 py-1.5 text-[13px] text-ink tnum outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-accent/40'

/** 数値入力(編集中は自由入力、blur/Enter で確定) */
export function NumField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  hint,
  showYen,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  unit?: string
  hint?: string
  showYen?: boolean
}) {
  const [text, setText] = useState(String(value))
  const [editing, setEditing] = useState(false)
  useEffect(() => {
    if (!editing) setText(String(value))
  }, [value, editing])

  const commit = () => {
    setEditing(false)
    const v = Number(text.replace(/[,、]/g, ''))
    if (Number.isFinite(v)) {
      let nv = v
      if (min !== undefined) nv = Math.max(min, nv)
      if (max !== undefined) nv = Math.min(max, nv)
      onChange(nv)
      setText(String(nv))
    } else {
      setText(String(value))
    }
  }

  return (
    <FieldRow label={label} hint={hint}>
      <div className="relative">
        <input
          type="number"
          className={inputCls + (unit ? ' pr-9' : '')}
          value={text}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            setEditing(true)
            setText(e.target.value)
          }}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
        />
        {unit && <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[11px] text-muted">{unit}</span>}
      </div>
      {showYen && <div className="mt-0.5 text-right text-[10.5px] text-muted tnum">{fmtYen(value)}</div>}
    </FieldRow>
  )
}

/** パーセント入力(内部は小数、表示は%) */
export function PctField({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 0.1,
  digits = 1,
  hint,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  digits?: number
  hint?: string
}) {
  return (
    <NumField
      label={label}
      value={Number((value * 100).toFixed(digits + 2))}
      onChange={(v) => onChange(v / 100)}
      min={min}
      max={max}
      step={step}
      unit="%"
      hint={hint}
    />
  )
}

/** スライダー+数値表示 */
export function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  fmt,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step: number
  fmt: (v: number) => string
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[11px] font-medium text-ink2">{label}</span>
        <span className="tnum text-[12px] font-semibold text-ink">{fmt(value)}</span>
      </div>
      <input
        type="range"
        className="block w-full"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
      />
    </div>
  )
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  hint?: string
}) {
  return (
    <FieldRow label={label} hint={hint}>
      <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldRow>
  )
}

/** セグメントコントロール */
export function SegField<T extends string>({
  value,
  onChange,
  options,
  label,
  small,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  label?: string
  small?: boolean
}) {
  return (
    <div>
      {label && <div className="mb-1 text-[11px] font-medium text-ink2">{label}</div>}
      <div className={`grid gap-0.5 rounded-lg border border-ink/10 bg-page p-0.5 ${small ? '' : ''}`} style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }} role="tablist">
        {options.map((o) => (
          <button
            key={o.value}
            role="tab"
            aria-selected={value === o.value}
            className={`rounded-md px-1.5 py-1 text-[11.5px] transition-colors ${
              value === o.value ? 'bg-surface font-semibold text-ink shadow-[0_1px_2px_rgba(11,11,11,0.08)]' : 'text-ink2 hover:text-ink'
            }`}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function CheckField({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2 py-0.5">
      <span className="text-[12px] text-ink2">
        {label}
        {hint && <span className="ml-1 text-[10.5px] text-muted">{hint}</span>}
      </span>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={(e) => {
          e.preventDefault()
          onChange(!checked)
        }}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-baseline'}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
      </button>
    </label>
  )
}
