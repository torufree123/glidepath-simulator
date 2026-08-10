// ファンチャート(FR-OUT-01)— 残高分布のパーセンタイル帯(5/25/50/75/95)
// dataviz: 単一系列+不確実性帯 = 同一ヒュー(slot1 blue)のウォッシュ、クロスヘア+全系列ツールチップ

import { useMemo, useState } from 'react'
import type { PercentileSeries } from '../../engine/types'
import { BASELINE, GRID, INK2, MUTED, PRIMARY, SURFACE, niceTicks } from '../../lib/chartTheme'
import { fmtAge, fmtYen, fmtYenAxis } from '../../lib/format'
import { ChartTip, nearestIndex, useMeasure } from './base'

const BAND_OUTER = 'rgba(42,120,214,0.12)'
const BAND_INNER = 'rgba(42,120,214,0.22)'
const KEY_OUTER = '#9ec5f4'
const KEY_INNER = '#5598e7'

export function FanChart({
  series,
  real,
  inflation,
  currentAge,
  goal,
  targetAge,
  wdStartAge,
  width,
  height = 330,
  interactive = true,
}: {
  series: PercentileSeries
  real: boolean
  inflation: number
  currentAge: number
  goal: number
  targetAge: number
  wdStartAge: number | null
  width?: number
  height?: number
  interactive?: boolean
}) {
  const [ref, mw] = useMeasure()
  const w = width ?? mw
  const [hover, setHover] = useState<{ i: number; my: number } | null>(null)

  const data = useMemo(() => {
    const tr = (arr: number[]) =>
      real ? arr.map((v, i) => v / Math.pow(1 + inflation, series.ages[i] - currentAge)) : arr
    return { ages: series.ages, p05: tr(series.p05), p25: tr(series.p25), p50: tr(series.p50), p75: tr(series.p75), p95: tr(series.p95) }
  }, [series, real, inflation, currentAge])

  if (!w) return <div ref={ref} style={{ height }} />

  const M = { l: 58, r: 88, t: 20, b: 30 }
  const pw = Math.max(50, w - M.l - M.r)
  const ph = height - M.t - M.b
  const a0 = data.ages[0]
  const a1 = data.ages[data.ages.length - 1]
  const yMax = Math.max(...data.p95, real ? 0 : goal) * 1.06 || 1
  const x = (age: number) => M.l + ((age - a0) / (a1 - a0)) * pw
  const y = (v: number) => M.t + ph - (v / yMax) * ph

  const line = (arr: number[]) => arr.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(data.ages[i]).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const band = (lo: number[], hi: number[]) => {
    let d = ''
    for (let i = 0; i < hi.length; i++) d += `${i === 0 ? 'M' : 'L'}${x(data.ages[i]).toFixed(1)},${y(hi[i]).toFixed(1)}`
    for (let i = lo.length - 1; i >= 0; i--) d += `L${x(data.ages[i]).toFixed(1)},${y(lo[i]).toFixed(1)}`
    return d + 'Z'
  }

  const yTicks = niceTicks(0, yMax, 5)
  const xTicks: number[] = []
  for (let age = Math.ceil(a0 / 5) * 5; age <= a1; age += 5) xTicks.push(age)

  const xPixels = data.ages.map((age) => x(age))
  const hoverIdx = hover?.i ?? null
  const endIdx = data.ages.length - 1

  const setHoverFromPos = (px: number, py: number) => {
    const i = nearestIndex(xPixels, px)
    setHover({ i, my: py })
  }

  return (
    <div ref={ref} className="relative select-none" style={{ height }}>
      <svg
        width={w}
        height={height}
        role="img"
        aria-label={`資産残高のファンチャート(${real ? '実質' : '名目'})。値の詳細は表ビューを参照。`}
        tabIndex={interactive ? 0 : undefined}
        className="outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        onKeyDown={
          interactive
            ? (e) => {
                if (e.key === 'Escape') return setHover(null)
                const step = e.shiftKey ? 12 : 1
                if (e.key === 'ArrowRight') setHover((h) => ({ i: Math.min(endIdx, (h?.i ?? 0) + step), my: M.t + 40 }))
                if (e.key === 'ArrowLeft') setHover((h) => ({ i: Math.max(0, (h?.i ?? endIdx) - step), my: M.t + 40 }))
              }
            : undefined
        }
      >
        {/* 取り崩し期の背景シェーディング */}
        {wdStartAge !== null && wdStartAge < a1 && (
          <>
            <rect x={x(Math.max(a0, wdStartAge))} y={M.t} width={x(a1) - x(Math.max(a0, wdStartAge))} height={ph} fill="#f0efec" opacity={0.55} />
            <text x={x(Math.max(a0, wdStartAge)) + 6} y={M.t + 12} fontSize={10} fill={MUTED}>
              取り崩し期
            </text>
          </>
        )}
        {/* グリッド(横のみ・ヘアライン) */}
        {yTicks.map((tv) => (
          <g key={tv}>
            <line x1={M.l} x2={M.l + pw} y1={y(tv)} y2={y(tv)} stroke={GRID} strokeWidth={1} />
            <text x={M.l - 8} y={y(tv) + 3.5} fontSize={10.5} fill={MUTED} textAnchor="end" className="tnum">
              {fmtYenAxis(tv)}
            </text>
          </g>
        ))}
        {/* X軸 */}
        <line x1={M.l} x2={M.l + pw} y1={M.t + ph} y2={M.t + ph} stroke={BASELINE} strokeWidth={1} />
        {xTicks.map((age) => (
          <text key={age} x={x(age)} y={M.t + ph + 18} fontSize={10.5} fill={MUTED} textAnchor="middle" className="tnum">
            {age}歳
          </text>
        ))}
        {/* パーセンタイル帯 */}
        <path d={band(data.p05, data.p95)} fill={BAND_OUTER} />
        <path d={band(data.p25, data.p75)} fill={BAND_INNER} />
        <path d={line(data.p50)} fill="none" stroke={PRIMARY} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {/* ターゲット年齢マーカー */}
        <line x1={x(targetAge)} x2={x(targetAge)} y1={M.t} y2={M.t + ph} stroke={BASELINE} strokeWidth={1} />
        <text x={x(targetAge)} y={M.t - 7} fontSize={10} fill={INK2} textAnchor="middle">
          ターゲット {targetAge}歳
        </text>
        {/* 目標ライン(名目表示時のみ — 目標額は名目値で定義) */}
        {!real && goal > 0 && goal < yMax && (
          <g>
            <line x1={M.l} x2={M.l + pw} y1={y(goal)} y2={y(goal)} stroke={INK2} strokeWidth={1} strokeDasharray="4 3" />
            <text x={M.l + pw + 6} y={y(goal) + 3.5} fontSize={10.5} fill={INK2} className="tnum">
              目標 {fmtYenAxis(goal)}
            </text>
          </g>
        )}
        {/* 中央値の終端マーカー+直接ラベル(選択的ラベリング) */}
        <circle cx={x(a1)} cy={y(data.p50[endIdx])} r={4.5} fill={PRIMARY} stroke={SURFACE} strokeWidth={2} />
        <text x={x(a1) + 8} y={y(data.p50[endIdx]) + 3.5} fontSize={10.5} fill={INK2} className="tnum">
          中央値 {fmtYenAxis(data.p50[endIdx])}
        </text>
        {/* クロスヘア */}
        {interactive && hoverIdx !== null && (
          <g>
            <line x1={xPixels[hoverIdx]} x2={xPixels[hoverIdx]} y1={M.t} y2={M.t + ph} stroke={INK2} strokeWidth={1} opacity={0.5} />
            <circle cx={xPixels[hoverIdx]} cy={y(data.p50[hoverIdx])} r={3.5} fill={PRIMARY} stroke={SURFACE} strokeWidth={2} />
          </g>
        )}
        {/* ヒットエリア(マークより大きく) */}
        {interactive && (
          <rect
            x={M.l}
            y={M.t}
            width={pw}
            height={ph}
            fill="transparent"
            onPointerMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              setHoverFromPos(e.clientX - rect.left + M.l, e.clientY - rect.top + M.t)
            }}
            onPointerLeave={() => setHover(null)}
          />
        )}
      </svg>
      {interactive && hoverIdx !== null && (
        <ChartTip
          x={xPixels[hoverIdx]}
          y={Math.min(hover!.my, height - 150)}
          containerWidth={w}
          title={`${fmtAge(Math.round(data.ages[hoverIdx] * 10) / 10)}時点(${real ? '実質' : '名目'})`}
          rows={[
            { color: KEY_OUTER, label: '95パーセンタイル', value: fmtYen(data.p95[hoverIdx]), muted: true },
            { color: KEY_INNER, label: '75パーセンタイル', value: fmtYen(data.p75[hoverIdx]), muted: true },
            { color: PRIMARY, label: '中央値', value: fmtYen(data.p50[hoverIdx]) },
            { color: KEY_INNER, label: '25パーセンタイル', value: fmtYen(data.p25[hoverIdx]), muted: true },
            { color: KEY_OUTER, label: '5パーセンタイル', value: fmtYen(data.p05[hoverIdx]), muted: true },
          ]}
        />
      )}
    </div>
  )
}
