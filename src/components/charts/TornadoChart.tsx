// トルネードチャート(FR-CMP-02)— 成功確率の感応度
// dataviz: ダイバージング(blue↔red)= 極性の符号で色分け、中立0を中心軸に

import { useState } from 'react'
import type { TornadoItem } from '../../engine/sensitivity'
import { BASELINE, DIV_NEG, DIV_POS, GRID, INK2, MUTED } from '../../lib/chartTheme'
import { fmtPt } from '../../lib/format'
import { ChartTip, Legend, useMeasure } from './base'

function roundedEndRect(cx: number, y: number, len: number, h: number, dir: 1 | -1): string {
  // 中心 cx から dir 方向へ len。データエンド側のみ4px丸め、中心側は直角。
  const r = Math.min(4, Math.abs(len), h / 2)
  const x0 = cx
  const x1 = cx + dir * len
  if (len < 0.5) return ''
  if (dir > 0)
    return `M${x0},${y}H${x1 - r}Q${x1},${y} ${x1},${y + r}V${y + h - r}Q${x1},${y + h} ${x1 - r},${y + h}H${x0}Z`
  return `M${x0},${y}H${x1 + r}Q${x1},${y} ${x1},${y + r}V${y + h - r}Q${x1},${y + h} ${x1 + r},${y + h}H${x0}Z`
}

export function TornadoChart({
  items,
  width,
  interactive = true,
}: {
  items: TornadoItem[]
  width?: number
  interactive?: boolean
}) {
  const [ref, mw] = useMeasure()
  const w = width ?? mw
  const [hover, setHover] = useState<number | null>(null)
  const rowH = 46
  const barH = 16
  const M = { l: 168, r: 64, t: 26, b: 26 }
  const height = M.t + M.b + items.length * rowH
  if (!w) return <div ref={ref} style={{ height }} />

  const pw = Math.max(80, w - M.l - M.r)
  const maxAbs = Math.max(0.02, ...items.flatMap((it) => [Math.abs(it.minus), Math.abs(it.plus)])) * 1.15
  const cx = M.l + pw / 2
  const scale = (v: number) => (v / maxAbs) * (pw / 2)

  const axisTicks = [-maxAbs, -maxAbs / 2, 0, maxAbs / 2, maxAbs]

  return (
    <div>
      <div ref={ref} className="relative select-none" style={{ height }}>
        <svg width={w} height={height} role="img" aria-label="主要パラメータの±変化に対する成功確率の感応度。詳細は表ビューを参照。">
          {axisTicks.map((tv, i) => (
            <g key={i}>
              <line x1={cx + scale(tv)} x2={cx + scale(tv)} y1={M.t - 4} y2={height - M.b} stroke={tv === 0 ? BASELINE : GRID} strokeWidth={1} />
              <text x={cx + scale(tv)} y={M.t - 10} fontSize={10} fill={MUTED} textAnchor="middle" className="tnum">
                {fmtPt(tv, 0)}
              </text>
            </g>
          ))}
          {items.map((it, i) => {
            const yTop = M.t + i * rowH + (rowH - barH) / 2
            const bars: { v: number; dirLabel: string }[] = [
              { v: it.minus, dirLabel: '−' },
              { v: it.plus, dirLabel: '+' },
            ]
            return (
              <g key={it.key} opacity={hover === null || hover === i ? 1 : 0.5}>
                <text x={M.l - 12} y={M.t + i * rowH + rowH / 2 - 2} fontSize={11.5} fill={INK2} textAnchor="end">
                  {it.label}
                </text>
                <text x={M.l - 12} y={M.t + i * rowH + rowH / 2 + 12} fontSize={10} fill={MUTED} textAnchor="end" className="tnum">
                  {it.deltaLabel}
                </text>
                {bars.map((b, j) => {
                  const dir = b.v >= 0 ? 1 : -1
                  const len = Math.abs(scale(b.v))
                  const by = yTop + (j === 0 ? 0 : 0) // 2本を同じ帯に重ねず、上下に4pxずらす
                  const yy = by + (j === 0 ? -3 : 3)
                  return (
                    <g key={j}>
                      <path d={roundedEndRect(cx, yy, len, barH - 4, dir as 1 | -1)} fill={b.v >= 0 ? DIV_POS : DIV_NEG} opacity={0.9} />
                      {len > 1 && (
                        <text
                          x={cx + dir * (len + 6)}
                          y={yy + (barH - 4) / 2 + 3.5}
                          fontSize={10}
                          fill={INK2}
                          textAnchor={dir > 0 ? 'start' : 'end'}
                          className="tnum"
                        >
                          {b.dirLabel}: {fmtPt(b.v)}
                        </text>
                      )}
                    </g>
                  )
                })}
                {interactive && (
                  <rect
                    x={0}
                    y={M.t + i * rowH}
                    width={w}
                    height={rowH}
                    fill="transparent"
                    onPointerEnter={() => setHover(i)}
                    onPointerLeave={() => setHover(null)}
                  />
                )}
              </g>
            )
          })}
        </svg>
        {interactive && hover !== null && (
          <ChartTip
            x={cx}
            y={M.t + hover * rowH}
            containerWidth={w}
            title={`${items[hover].label}(${items[hover].deltaLabel})`}
            rows={[
              { color: items[hover].plus >= 0 ? DIV_POS : DIV_NEG, label: '+方向の変化', value: fmtPt(items[hover].plus) },
              { color: items[hover].minus >= 0 ? DIV_POS : DIV_NEG, label: '−方向の変化', value: fmtPt(items[hover].minus) },
            ]}
          />
        )}
      </div>
      <div className="mt-1">
        <Legend
          items={[
            { color: DIV_POS, label: '成功確率が上昇' },
            { color: DIV_NEG, label: '成功確率が低下' },
          ]}
        />
      </div>
    </div>
  )
}
