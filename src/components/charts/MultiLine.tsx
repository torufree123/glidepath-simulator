// 複数系列ラインチャート — 比較タブ(グライドパス重ね合わせ / 中央値経路)
// dataviz: カテゴリカル固定順スロット、2pxライン、凡例必須、クロスヘア+全系列ツールチップ

import { useState } from 'react'
import { BASELINE, GRID, INK2, MUTED, SERIES, SURFACE, niceTicks } from '../../lib/chartTheme'
import { fmtAge } from '../../lib/format'
import { ChartTip, Legend, nearestIndex, useMeasure } from './base'

export interface LineSeriesDef {
  label: string
  values: number[]
}

export function MultiLineChart({
  ages,
  series,
  yFmt,
  valueFmt,
  percent = false,
  goal,
  goalLabel,
  targetAge,
  width,
  height = 260,
  interactive = true,
}: {
  ages: number[]
  series: LineSeriesDef[]
  yFmt: (v: number) => string
  valueFmt: (v: number) => string
  percent?: boolean
  goal?: number
  goalLabel?: string
  targetAge?: number
  width?: number
  height?: number
  interactive?: boolean
}) {
  const [ref, mw] = useMeasure()
  const w = width ?? mw
  const [hover, setHover] = useState<number | null>(null)
  if (!w) return <div ref={ref} style={{ height }} />
  if (ages.length === 0 || series.length === 0) return <div ref={ref} style={{ height }} />

  const M = { l: 54, r: 26, t: 18, b: 30 }
  const pw = Math.max(50, w - M.l - M.r)
  const ph = height - M.t - M.b
  const a0 = ages[0]
  const a1 = ages[ages.length - 1]
  const rawMax = Math.max(...series.flatMap((s) => s.values), goal ?? 0)
  const yMax = percent ? 1 : rawMax * 1.06 || 1
  const x = (age: number) => M.l + ((age - a0) / Math.max(1e-9, a1 - a0)) * pw
  const y = (v: number) => M.t + ph - (v / yMax) * ph

  const yTicks = percent ? [0, 0.25, 0.5, 0.75, 1] : niceTicks(0, yMax, 5)
  const xTicks: number[] = []
  for (let age = Math.ceil(a0 / 5) * 5; age <= a1; age += 5) xTicks.push(age)
  const xPixels = ages.map((a) => x(a))

  return (
    <div>
      <div ref={ref} className="relative select-none" style={{ height }}>
        <svg width={w} height={height} role="img" aria-label="比較ラインチャート。詳細は表ビューを参照。">
          {yTicks.map((tv) => (
            <g key={tv}>
              <line x1={M.l} x2={M.l + pw} y1={y(tv)} y2={y(tv)} stroke={GRID} strokeWidth={1} />
              <text x={M.l - 6} y={y(tv) + 3.5} fontSize={10.5} fill={MUTED} textAnchor="end" className="tnum">
                {yFmt(tv)}
              </text>
            </g>
          ))}
          <line x1={M.l} x2={M.l + pw} y1={M.t + ph} y2={M.t + ph} stroke={BASELINE} strokeWidth={1} />
          {xTicks.map((age) => (
            <text key={age} x={x(age)} y={M.t + ph + 18} fontSize={10.5} fill={MUTED} textAnchor="middle" className="tnum">
              {age}歳
            </text>
          ))}
          {targetAge !== undefined && targetAge >= a0 && targetAge <= a1 && (
            <g>
              <line x1={x(targetAge)} x2={x(targetAge)} y1={M.t} y2={M.t + ph} stroke={BASELINE} strokeWidth={1} />
              <text x={x(targetAge)} y={M.t - 5} fontSize={10} fill={INK2} textAnchor="middle">
                ターゲット
              </text>
            </g>
          )}
          {goal !== undefined && goal > 0 && goal < yMax && (
            <g>
              <line x1={M.l} x2={M.l + pw} y1={y(goal)} y2={y(goal)} stroke={INK2} strokeWidth={1} strokeDasharray="4 3" />
              {goalLabel && (
                <text x={M.l + pw} y={y(goal) - 5} fontSize={10} fill={INK2} textAnchor="end" className="tnum">
                  {goalLabel}
                </text>
              )}
            </g>
          )}
          {series.map((s, si) => (
            <path
              key={si}
              d={s.values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(ages[i]).toFixed(1)},${y(v).toFixed(1)}`).join('')}
              fill="none"
              stroke={SERIES[si % SERIES.length]}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {interactive && hover !== null && (
            <g>
              <line x1={xPixels[hover]} x2={xPixels[hover]} y1={M.t} y2={M.t + ph} stroke={INK2} strokeWidth={1} opacity={0.5} />
              {series.map((s, si) => (
                <circle key={si} cx={xPixels[hover]} cy={y(s.values[hover])} r={3.5} fill={SERIES[si % SERIES.length]} stroke={SURFACE} strokeWidth={2} />
              ))}
            </g>
          )}
          {interactive && (
            <rect
              x={M.l}
              y={M.t}
              width={pw}
              height={ph}
              fill="transparent"
              onPointerMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                setHover(nearestIndex(xPixels, e.clientX - rect.left + M.l))
              }}
              onPointerLeave={() => setHover(null)}
            />
          )}
        </svg>
        {interactive && hover !== null && (
          <ChartTip
            x={xPixels[hover]}
            y={M.t + 8}
            containerWidth={w}
            title={`${fmtAge(Math.round(ages[hover] * 10) / 10)}時点`}
            rows={series.map((s, si) => ({
              color: SERIES[si % SERIES.length],
              label: s.label,
              value: valueFmt(s.values[hover]),
            }))}
          />
        )}
      </div>
      {series.length >= 2 && (
        <div className="mt-2">
          <Legend items={series.map((s, si) => ({ color: SERIES[si % SERIES.length], label: s.label, shape: 'line' }))} />
        </div>
      )}
    </div>
  )
}
