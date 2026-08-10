// グライドパス配分チャート — 6資産クラスの積み上げエリア + リスク資産比率の境界線
// dataviz: カテゴリカル6系列(隣接ペア検証済みの固定順)、2pxサーフェスギャップ、凡例+ツールチップ

import { useMemo, useState } from 'react'
import type { GlidePathDefinition } from '../../engine/types'
import { ASSET_KEYS, ASSET_LABELS } from '../../engine/types'
import { weightsAt } from '../../engine/glidepath'
import { ASSET_COLORS, BASELINE, GRID, INK2, MUTED, SURFACE } from '../../lib/chartTheme'
import { fmtAge, fmtPct } from '../../lib/format'
import { ChartTip, Legend, nearestIndex, useMeasure } from './base'

export function GlidepathChart({
  gp,
  currentAge,
  endAge,
  targetAge,
  width,
  height = 280,
  interactive = true,
}: {
  gp: GlidePathDefinition
  currentAge: number
  endAge: number
  targetAge: number
  width?: number
  height?: number
  interactive?: boolean
}) {
  const [ref, mw] = useMeasure()
  const w = width ?? mw
  const [hoverI, setHoverI] = useState<number | null>(null)

  const data = useMemo(() => {
    const ages: number[] = []
    const weights: Float64Array[] = []
    const step = 0.25
    for (let a = currentAge; a <= endAge + 1e-9; a += step) {
      ages.push(a)
      weights.push(weightsAt(gp, a))
    }
    // 累積(下から: 国内株式 → … → 短期資産)
    const cum: number[][] = ages.map((_, i) => {
      const c = [0]
      let s = 0
      for (let k = 0; k < 6; k++) {
        s += weights[i][k]
        c.push(s)
      }
      return c
    })
    const risky = weights.map((wt) => wt[0] + wt[1] + wt[2])
    return { ages, weights, cum, risky }
  }, [gp, currentAge, endAge])

  if (!w) return <div ref={ref} style={{ height }} />

  const M = { l: 44, r: 104, t: 16, b: 28 }
  const pw = Math.max(50, w - M.l - M.r)
  const ph = height - M.t - M.b
  const a0 = data.ages[0]
  const a1 = data.ages[data.ages.length - 1]
  const x = (age: number) => M.l + ((age - a0) / (a1 - a0)) * pw
  const y = (v: number) => M.t + ph - v * ph

  const bandPath = (k: number) => {
    let d = ''
    for (let i = 0; i < data.ages.length; i++) d += `${i === 0 ? 'M' : 'L'}${x(data.ages[i]).toFixed(1)},${y(data.cum[i][k + 1]).toFixed(1)}`
    for (let i = data.ages.length - 1; i >= 0; i--) d += `L${x(data.ages[i]).toFixed(1)},${y(data.cum[i][k]).toFixed(1)}`
    return d + 'Z'
  }
  const boundaryPath = (k: number) =>
    data.ages.map((a, i) => `${i === 0 ? 'M' : 'L'}${x(a).toFixed(1)},${y(data.cum[i][k]).toFixed(1)}`).join('')

  const xTicks: number[] = []
  for (let age = Math.ceil(a0 / 10) * 10; age <= a1; age += 10) xTicks.push(age)
  const xPixels = data.ages.map((a) => x(a))

  // 帯内の選択的直接ラベル: 左端付近で十分な厚みのある帯のみ
  const labelIdx = Math.min(data.ages.length - 1, Math.round(data.ages.length * 0.06))
  const inlineLabels = ASSET_KEYS.map((key, k) => {
    const thickness = (data.cum[labelIdx][k + 1] - data.cum[labelIdx][k]) * ph
    if (thickness < 18) return null
    return {
      key,
      x: x(data.ages[labelIdx]) + 6,
      y: (y(data.cum[labelIdx][k]) + y(data.cum[labelIdx][k + 1])) / 2 + 3.5,
      label: ASSET_LABELS[key],
    }
  }).filter((v) => v !== null)

  return (
    <div>
      <div ref={ref} className="relative select-none" style={{ height }}>
        <svg width={w} height={height} role="img" aria-label="年齢別の資産クラス配分(積み上げ)。詳細は表ビューを参照。">
          {/* 積み上げ帯(2pxサーフェスギャップ = 境界をサーフェス色ストロークで分離) */}
          {ASSET_KEYS.map((key, k) => (
            <path key={key} d={bandPath(k)} fill={ASSET_COLORS[k]} fillOpacity={0.7} stroke={SURFACE} strokeWidth={1} />
          ))}
          {ASSET_KEYS.map((key, k) =>
            k > 0 ? <path key={`gap-${key}`} d={boundaryPath(k)} fill="none" stroke={SURFACE} strokeWidth={2} /> : null,
          )}
          {/* リスク資産比率の境界線(強調) */}
          <path d={boundaryPath(3)} fill="none" stroke={INK2} strokeWidth={2} strokeLinejoin="round" />
          <text x={M.l + pw + 6} y={y(data.risky[data.risky.length - 1]) + 3.5} fontSize={10.5} fill={INK2} className="tnum">
            リスク資産 {fmtPct(data.risky[data.risky.length - 1], 0)}
          </text>
          {/* 帯内ラベル(厚みのある帯のみ・選択的) */}
          {inlineLabels.map((l) => (
            <text key={l.key} x={l.x} y={l.y} fontSize={10} fill="#0b0b0b" opacity={0.75}>
              {l.label}
            </text>
          ))}
          {/* 軸 */}
          {[0, 0.25, 0.5, 0.75, 1].map((tv) => (
            <g key={tv}>
              {tv > 0 && tv < 1 && <line x1={M.l} x2={M.l + pw} y1={y(tv)} y2={y(tv)} stroke={GRID} strokeWidth={1} opacity={0.6} />}
              <text x={M.l - 6} y={y(tv) + 3.5} fontSize={10.5} fill={MUTED} textAnchor="end" className="tnum">
                {Math.round(tv * 100)}%
              </text>
            </g>
          ))}
          <line x1={M.l} x2={M.l + pw} y1={M.t + ph} y2={M.t + ph} stroke={BASELINE} strokeWidth={1} />
          {xTicks.map((age) => (
            <text key={age} x={x(age)} y={M.t + ph + 17} fontSize={10.5} fill={MUTED} textAnchor="middle" className="tnum">
              {age}歳
            </text>
          ))}
          {/* ターゲットマーカー */}
          <line x1={x(targetAge)} x2={x(targetAge)} y1={M.t - 2} y2={M.t + ph} stroke={BASELINE} strokeWidth={1} />
          <text x={x(targetAge)} y={M.t - 5} fontSize={10} fill={INK2} textAnchor="middle">
            ターゲット
          </text>
          {/* クロスヘア */}
          {interactive && hoverI !== null && (
            <line x1={xPixels[hoverI]} x2={xPixels[hoverI]} y1={M.t} y2={M.t + ph} stroke={INK2} strokeWidth={1} opacity={0.5} />
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
                setHoverI(nearestIndex(xPixels, e.clientX - rect.left + M.l))
              }}
              onPointerLeave={() => setHoverI(null)}
            />
          )}
        </svg>
        {interactive && hoverI !== null && (
          <ChartTip
            x={xPixels[hoverI]}
            y={M.t + 10}
            containerWidth={w}
            title={`${fmtAge(Math.round(data.ages[hoverI] * 10) / 10)}時点の配分`}
            rows={[
              { color: INK2, label: 'リスク資産比率', value: fmtPct(data.risky[hoverI]) },
              ...ASSET_KEYS.map((key, k) => ({
                color: ASSET_COLORS[k],
                label: ASSET_LABELS[key],
                value: fmtPct(data.weights[hoverI][k]),
                muted: true,
              })),
            ]}
          />
        )}
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <Legend items={ASSET_KEYS.map((key, k) => ({ color: ASSET_COLORS[k], label: ASSET_LABELS[key] }))} />
        <Legend items={[{ color: INK2, label: 'リスク資産比率', shape: 'line' }]} />
      </div>
    </div>
  )
}
