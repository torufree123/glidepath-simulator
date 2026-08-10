// 最終資産分布ヒストグラム(FR-OUT-03)
// dataviz: 順序2値(目標未満/以上)= 同一ヒューの ordinal 2ステップ、バーは丸めデータエンド+2pxギャップ

import { useState } from 'react'
import { BASELINE, GRID, INK2, MUTED, SEQ_LIGHT, SEQ_MAIN, niceTicks } from '../../lib/chartTheme'
import { fmtPct, fmtYen, fmtYenAxis } from '../../lib/format'
import { ChartTip, Legend, useMeasure } from './base'

function roundedTopRect(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h)
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`
}

export function TerminalHist({
  edges,
  counts,
  goal,
  median,
  nPaths,
  width,
  height = 240,
  interactive = true,
}: {
  edges: number[]
  counts: number[]
  goal: number
  median: number
  nPaths: number
  width?: number
  height?: number
  interactive?: boolean
}) {
  const [ref, mw] = useMeasure()
  const w = width ?? mw
  const [hover, setHover] = useState<number | null>(null)
  if (!w) return <div ref={ref} style={{ height }} />

  const M = { l: 46, r: 18, t: 26, b: 30 }
  const pw = Math.max(50, w - M.l - M.r)
  const ph = height - M.t - M.b
  const hi = edges[edges.length - 1] || 1
  const maxShare = Math.max(...counts) / nPaths || 1
  const x = (v: number) => M.l + (v / hi) * pw
  const y = (share: number) => M.t + ph - (share / (maxShare * 1.08)) * ph

  const xTicks = niceTicks(0, hi, 5)
  const yTicks = niceTicks(0, maxShare, 3)
  const n = counts.length
  const slot = pw / n
  const barW = Math.min(24, Math.max(2, slot - 2))

  return (
    <div>
      <div ref={ref} className="relative select-none" style={{ height }}>
        <svg width={w} height={height} role="img" aria-label="ターゲット時点の最終資産分布ヒストグラム。詳細は表ビューを参照。">
          {yTicks.map((tv) => (
            <g key={tv}>
              <line x1={M.l} x2={M.l + pw} y1={y(tv)} y2={y(tv)} stroke={GRID} strokeWidth={1} />
              <text x={M.l - 6} y={y(tv) + 3.5} fontSize={10.5} fill={MUTED} textAnchor="end" className="tnum">
                {fmtPct(tv, 0)}
              </text>
            </g>
          ))}
          {counts.map((c, i) => {
            const lo = edges[i]
            const mid = (edges[i] + edges[i + 1]) / 2
            const share = c / nPaths
            if (share === 0) return null
            const bx = x(lo) + (slot - barW) / 2
            const by = y(share)
            return (
              <path
                key={i}
                d={roundedTopRect(bx, by, barW, M.t + ph - by, 3)}
                fill={mid >= goal ? SEQ_MAIN : SEQ_LIGHT}
                opacity={hover === null || hover === i ? 1 : 0.55}
              />
            )
          })}
          <line x1={M.l} x2={M.l + pw} y1={M.t + ph} y2={M.t + ph} stroke={BASELINE} strokeWidth={1} />
          {xTicks.map((tv) => (
            <text key={tv} x={x(tv)} y={M.t + ph + 18} fontSize={10.5} fill={MUTED} textAnchor="middle" className="tnum">
              {fmtYenAxis(tv)}
            </text>
          ))}
          {/* 目標・中央値マーカー */}
          {goal <= hi && (
            <g>
              <line x1={x(goal)} x2={x(goal)} y1={M.t - 4} y2={M.t + ph} stroke={INK2} strokeWidth={1} strokeDasharray="4 3" />
              <text x={x(goal)} y={M.t - 8} fontSize={10} fill={INK2} textAnchor="middle" className="tnum">
                目標 {fmtYenAxis(goal)}
              </text>
            </g>
          )}
          {median <= hi && (
            <g>
              <path d={`M${x(median) - 4},${M.t + ph + 2}L${x(median) + 4},${M.t + ph + 2}L${x(median)},${M.t + ph - 5}Z`} fill={INK2} />
              <text x={x(median)} y={height - 2} fontSize={10} fill={INK2} textAnchor="middle" className="tnum">
                中央値
              </text>
            </g>
          )}
          {/* ヒットエリア(バーより大きい列単位) */}
          {interactive &&
            counts.map((_, i) => (
              <rect
                key={`hit-${i}`}
                x={x(edges[i])}
                y={M.t}
                width={slot}
                height={ph}
                fill="transparent"
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
              />
            ))}
        </svg>
        {interactive && hover !== null && (
          <ChartTip
            x={x(edges[hover]) + slot / 2}
            y={M.t + 8}
            containerWidth={w}
            title={`${fmtYen(edges[hover])} 〜 ${fmtYen(edges[hover + 1])}`}
            rows={[
              { color: (edges[hover] + edges[hover + 1]) / 2 >= goal ? SEQ_MAIN : SEQ_LIGHT, label: 'パス比率', value: fmtPct(counts[hover] / nPaths) },
              { label: 'パス数', value: counts[hover].toLocaleString('ja-JP'), muted: true },
            ]}
          />
        )}
      </div>
      <div className="mt-2">
        <Legend
          items={[
            { color: SEQ_MAIN, label: '目標額以上' },
            { color: SEQ_LIGHT, label: '目標額未満' },
          ]}
        />
      </div>
    </div>
  )
}
