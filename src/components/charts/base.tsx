// チャート共通基盤 — 計測フック / ツールチップ / 凡例(dataviz 準拠)

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'

/** コンテナ幅の計測(レスポンシブSVG用)。width 指定時は不要。 */
export function useMeasure(): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setWidth(e.contentRect.width)
    })
    ro.observe(el)
    setWidth(el.getBoundingClientRect().width)
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}

export function nearestIndex(xs: number[], mx: number): number {
  let lo = 0
  let hi = xs.length - 1
  if (mx <= xs[0]) return 0
  if (mx >= xs[hi]) return hi
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (xs[mid] <= mx) lo = mid
    else hi = mid
  }
  return mx - xs[lo] <= xs[hi] - mx ? lo : hi
}

export interface TipRow {
  color?: string
  label: string
  value: string
  muted?: boolean
}

/** ツールチップ — 値が主役、系列名は従(dataviz interaction 準拠) */
export function ChartTip({
  x,
  y,
  containerWidth,
  title,
  rows,
}: {
  x: number
  y: number
  containerWidth: number
  title: string
  rows: TipRow[]
}) {
  const flip = x > containerWidth - 190
  return (
    <div
      className="pointer-events-none absolute z-20 min-w-[150px] rounded-lg border border-ink/10 bg-surface px-3 py-2 shadow-[0_4px_16px_rgba(11,11,11,0.10)]"
      style={{ left: flip ? undefined : x + 14, right: flip ? containerWidth - x + 14 : undefined, top: Math.max(0, y - 10) }}
    >
      <div className="mb-1 text-[11px] font-medium text-ink2">{title}</div>
      <div className="space-y-0.5">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            {r.color ? (
              <span className="inline-block h-[3px] w-4 shrink-0 rounded-full" style={{ background: r.color }} />
            ) : (
              <span className="w-4 shrink-0" />
            )}
            <span className={`tnum text-[12px] font-semibold ${r.muted ? 'text-ink2' : 'text-ink'}`}>{r.value}</span>
            <span className="ml-auto pl-2 text-[11px] text-muted">{r.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** 凡例 — 2系列以上で常時表示(dataviz 必須ルール) */
export function Legend({
  items,
}: {
  items: { color: string; label: string; shape?: 'line' | 'rect' }[]
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5 text-[11px] text-ink2">
          {it.shape === 'line' ? (
            <span className="inline-block h-[3px] w-4 rounded-full" style={{ background: it.color }} />
          ) : (
            <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: it.color }} />
          )}
          {it.label}
        </span>
      ))}
    </div>
  )
}

/** チャートカード — タイトル / グラフ・表の切替(表ビューは必須の代替チャネル) */
export function ChartCard({
  title,
  subtitle,
  actions,
  table,
  children,
  className = '',
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
  table?: ReactNode
  children: ReactNode
  className?: string
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart')
  return (
    <section className={`rounded-xl border border-ink/10 bg-surface p-4 ${className}`}>
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[11px] text-muted">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          {actions}
          {table && (
            <div className="flex overflow-hidden rounded-md border border-ink/10 text-[11px]" role="tablist" aria-label="表示切替">
              {(['chart', 'table'] as const).map((v) => (
                <button
                  key={v}
                  role="tab"
                  aria-selected={view === v}
                  className={`px-2 py-1 transition-colors ${view === v ? 'bg-ink text-white' : 'bg-surface text-ink2 hover:bg-page'}`}
                  onClick={() => setView(v)}
                >
                  {v === 'chart' ? 'グラフ' : '表'}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>
      {view === 'chart' || !table ? children : <div className="overflow-x-auto thin-scroll">{table}</div>}
    </section>
  )
}

/** 表ビュー共通スタイル */
export function DataTable({
  head,
  rows,
}: {
  head: string[]
  rows: (string | number)[][]
}) {
  return (
    <table className="w-full border-collapse text-[12px]">
      <thead>
        <tr>
          {head.map((h, i) => (
            <th
              key={i}
              className={`border-b border-ink/10 px-2 py-1.5 font-medium text-ink2 ${i === 0 ? 'text-left' : 'text-right'}`}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="hover:bg-page">
            {r.map((c, j) => (
              <td key={j} className={`tnum border-b border-ink/5 px-2 py-1 ${j === 0 ? 'text-left text-ink2' : 'text-right text-ink'}`}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
