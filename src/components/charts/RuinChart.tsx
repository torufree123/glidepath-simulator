// 資産枯渇確率カーブ(FR-OUT-05)— 年齢別の累積枯渇確率

import { useState } from 'react'
import { BASELINE, GRID, INK2, MUTED, PRIMARY, SURFACE, niceTicks } from '../../lib/chartTheme'
import { fmtPct } from '../../lib/format'
import { ChartTip, nearestIndex, useMeasure } from './base'

export function RuinChart({
  ages,
  probs,
  markAges = [80, 85, 90, 95],
  width,
  height = 240,
  interactive = true,
}: {
  ages: number[]
  probs: number[]
  markAges?: number[]
  width?: number
  height?: number
  interactive?: boolean
}) {
  const [ref, mw] = useMeasure()
  const w = width ?? mw
  const [hover, setHover] = useState<number | null>(null)
  if (!w) return <div ref={ref} style={{ height }} />
  if (ages.length === 0) {
    return (
      <div ref={ref} className="flex items-center justify-center text-[12px] text-muted" style={{ height }}>
        取り崩し設定がないため、枯渇確率は算出されません
      </div>
    )
  }

  const M = { l: 46, r: 24, t: 22, b: 30 }
  const pw = Math.max(50, w - M.l - M.r)
  const ph = height - M.t - M.b
  const a0 = ages[0]
  const a1 = ages[ages.length - 1]
  const yMax = Math.max(0.05, Math.max(...probs) * 1.2)
  const x = (age: number) => M.l + ((age - a0) / Math.max(1e-9, a1 - a0)) * pw
  const y = (p: number) => M.t + ph - (p / yMax) * ph

  const line = probs.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(ages[i]).toFixed(1)},${y(p).toFixed(1)}`).join('')
  const area = line + `L${x(a1)},${y(0)}L${x(a0)},${y(0)}Z`
  const yTicks = niceTicks(0, yMax, 4)
  const xPixels = ages.map((a) => x(a))
  const marks = markAges.map((ma) => ages.indexOf(ma)).filter((i) => i >= 0)

  return (
    <div ref={ref} className="relative select-none" style={{ height }}>
      <svg width={w} height={height} role="img" aria-label="年齢別の資産枯渇確率。詳細は表ビューを参照。">
        {yTicks.map((tv) => (
          <g key={tv}>
            <line x1={M.l} x2={M.l + pw} y1={y(tv)} y2={y(tv)} stroke={GRID} strokeWidth={1} />
            <text x={M.l - 6} y={y(tv) + 3.5} fontSize={10.5} fill={MUTED} textAnchor="end" className="tnum">
              {fmtPct(tv, 0)}
            </text>
          </g>
        ))}
        <path d={area} fill={PRIMARY} fillOpacity={0.1} />
        <path d={line} fill="none" stroke={PRIMARY} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <line x1={M.l} x2={M.l + pw} y1={M.t + ph} y2={M.t + ph} stroke={BASELINE} strokeWidth={1} />
        {ages
          .filter((a) => a % 5 === 0)
          .map((a) => (
            <text key={a} x={x(a)} y={M.t + ph + 18} fontSize={10.5} fill={MUTED} textAnchor="middle" className="tnum">
              {a}歳
            </text>
          ))}
        {/* 主要年齢の直接ラベル(80/85/90/95歳) */}
        {marks.map((i) => (
          <g key={i}>
            <circle cx={x(ages[i])} cy={y(probs[i])} r={4} fill={PRIMARY} stroke={SURFACE} strokeWidth={2} />
            <text x={x(ages[i])} y={y(probs[i]) - 9} fontSize={10} fill={INK2} textAnchor="middle" className="tnum">
              {fmtPct(probs[i])}
            </text>
          </g>
        ))}
        {interactive && hover !== null && (
          <g>
            <line x1={xPixels[hover]} x2={xPixels[hover]} y1={M.t} y2={M.t + ph} stroke={INK2} strokeWidth={1} opacity={0.5} />
            <circle cx={xPixels[hover]} cy={y(probs[hover])} r={3.5} fill={PRIMARY} stroke={SURFACE} strokeWidth={2} />
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
          title={`${ages[hover]}歳までに枯渇`}
          rows={[{ color: PRIMARY, label: '累積枯渇確率', value: fmtPct(probs[hover]) }]}
        />
      )}
    </div>
  )
}
