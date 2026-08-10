// サイドバー用ミニプレビュー — リスク資産比率 w_eq(a) の形状(単一系列・凡例なし)

import { useMemo } from 'react'
import type { GlidePathDefinition } from '../../engine/types'
import { riskyAt } from '../../engine/glidepath'
import { BASELINE, MUTED, PRIMARY } from '../../lib/chartTheme'
import { useMeasure } from './base'

export function MiniGlidepath({
  gp,
  currentAge,
  endAge,
  targetAge,
  height = 92,
}: {
  gp: GlidePathDefinition
  currentAge: number
  endAge: number
  targetAge: number
  height?: number
}) {
  const [ref, w] = useMeasure()

  const pts = useMemo(() => {
    const ages: number[] = []
    const vals: number[] = []
    for (let a = currentAge; a <= endAge + 1e-9; a += 0.5) {
      ages.push(a)
      vals.push(riskyAt(gp, a))
    }
    return { ages, vals }
  }, [gp, currentAge, endAge])

  if (!w) return <div ref={ref} style={{ height }} />

  const M = { l: 6, r: 34, t: 14, b: 16 }
  const pw = Math.max(20, w - M.l - M.r)
  const ph = height - M.t - M.b
  const a0 = pts.ages[0]
  const a1 = pts.ages[pts.ages.length - 1]
  const x = (age: number) => M.l + ((age - a0) / (a1 - a0)) * pw
  const y = (v: number) => M.t + ph - v * ph

  const linePath = pts.vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(pts.ages[i]).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const areaPath = linePath + `L${x(a1).toFixed(1)},${y(0)}L${x(a0).toFixed(1)},${y(0)}Z`
  const last = pts.vals[pts.vals.length - 1]

  return (
    <div ref={ref} className="relative" style={{ height }}>
      <svg width={w} height={height} role="img" aria-label="リスク資産比率のプレビュー">
        <path d={areaPath} fill={PRIMARY} fillOpacity={0.1} />
        <path d={linePath} fill="none" stroke={PRIMARY} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <line x1={M.l} x2={M.l + pw} y1={y(0)} y2={y(0)} stroke={BASELINE} strokeWidth={1} />
        {targetAge > a0 && targetAge < a1 && (
          <line x1={x(targetAge)} x2={x(targetAge)} y1={M.t - 2} y2={y(0)} stroke={BASELINE} strokeWidth={1} strokeDasharray="2 3" />
        )}
        <text x={x(a0)} y={y(pts.vals[0]) - 5} fontSize={9.5} fill={MUTED} className="tnum">
          {Math.round(pts.vals[0] * 100)}%
        </text>
        <text x={x(a1) + 5} y={y(last) + 3} fontSize={9.5} fill={MUTED} className="tnum">
          {Math.round(last * 100)}%
        </text>
        <text x={x(a0)} y={height - 3} fontSize={9} fill={MUTED} className="tnum">
          {Math.round(a0)}歳
        </text>
        <text x={x(a1)} y={height - 3} fontSize={9} fill={MUTED} textAnchor="end" className="tnum">
          {Math.round(a1)}歳
        </text>
      </svg>
    </div>
  )
}
