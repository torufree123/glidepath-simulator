// 比較タブ(UC-01/03/06)— 最大5設定を同一乱数系列(CRN)で並列比較(FR-CMP-01 / FR-OUT-07)

import { useMemo, useState } from 'react'
import { useStore, uid } from '../../state/store'
import type { SimulationResult } from '../../engine/types'
import { GP_PRESETS } from '../../engine/presets'
import { riskyAt } from '../../engine/glidepath'
import { fmtNum, fmtPct, fmtPt, fmtYen } from '../../lib/format'
import { SERIES } from '../../lib/chartTheme'
import { MultiLineChart } from '../charts/MultiLine'
import { ChartCard } from '../charts/base'
import { WarningsBanner } from '../results/panels'

type VRes = SimulationResult['variants'][number]

export function CompareTab() {
  const params = useStore((s) => s.params)
  const extras = useStore((s) => s.compareExtras)
  const slot = useStore((s) => s.compareSlot)
  const addVariant = useStore((s) => s.addCompareVariant)
  const removeVariant = useStore((s) => s.removeCompareVariant)
  const updateVariant = useStore((s) => s.updateCompareVariant)
  const runCompare = useStore((s) => s.runCompare)
  const [addOpen, setAddOpen] = useState(false)

  const defs = useMemo(
    () => [
      { id: 'current', label: `基準: ${params.glidepath.name || '現在の設計'}`, glidepath: params.glidepath },
      ...extras.map((x) => ({ id: x.id, label: x.label, glidepath: x.glidepath })),
    ],
    [params.glidepath, extras],
  )

  const riskyOverlay = useMemo(() => {
    const ages: number[] = []
    for (let a = params.person.current_age; a <= params.person.end_age + 1e-9; a += 0.5) ages.push(a)
    return {
      ages,
      series: defs.map((d) => ({ label: d.label, values: ages.map((a) => riskyAt(d.glidepath, a)) })),
    }
  }, [defs, params.person])

  const data = slot.data
  const running = slot.status === 'running'

  const addFromPreset = (presetId: string) => {
    const p = GP_PRESETS.find((x) => x.id === presetId)
    if (!p) return
    addVariant({
      id: uid('cmp'),
      label: p.label,
      glidepath: p.apply(structuredClone(params.glidepath)),
      costs: { expense_ratio_annual: params.market.expense_ratio_annual, fixed_fee_monthly: params.market.fixed_fee_monthly },
    })
    setAddOpen(false)
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-ink/10 bg-surface p-4">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[14px] font-semibold text-ink">設計比較(CRN — 同一乱数系列)</h2>
          <button
            className="rounded-lg bg-accent px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-accent-deep disabled:opacity-50"
            onClick={runCompare}
            disabled={running}
          >
            {running ? `計算中… ${slot.progress}%` : `比較を実行(${fmtNum(params.engine.n_paths)}パス)`}
          </button>
        </div>
        <p className="mb-3 text-[11px] leading-relaxed text-muted">
          個人条件・市場前提・乱数系列を共有し、グライドパス設計とコストのみを変えて比較します(最大5設定 / FR-CMP-01)。
          並び順は追加順であり、優劣や推奨を示すものではありません(CP-02/CP-03)。
        </p>
        <div className="flex flex-wrap items-stretch gap-2">
          {/* 基準(現在の設計) */}
          <div className="flex min-w-[180px] items-center gap-2 rounded-lg border border-ink/10 bg-page/60 px-3 py-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SERIES[0] }} />
            <div>
              <div className="text-[12px] font-semibold text-ink">{params.glidepath.name || '現在の設計'}</div>
              <div className="text-[10px] text-muted">基準 — サイドバーの設定 / 信託報酬 {fmtPct(params.market.expense_ratio_annual, 2)}</div>
            </div>
          </div>
          {extras.map((x, i) => (
            <div key={x.id} className="flex min-w-[210px] items-center gap-2 rounded-lg border border-ink/10 bg-surface px-3 py-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SERIES[i + 1] }} />
              <div className="min-w-0 flex-1">
                <input
                  className="w-full rounded border border-transparent bg-transparent px-1 text-[12px] font-semibold text-ink outline-none hover:border-ink/10 focus-visible:border-accent"
                  value={x.label}
                  onChange={(e) => updateVariant(x.id, { label: e.target.value })}
                  aria-label="バリアント名"
                />
                <div className="mt-0.5 flex items-center gap-1 px-1 text-[10px] text-muted">
                  信託報酬
                  <input
                    type="number"
                    step={0.05}
                    min={0}
                    className="w-14 rounded border border-ink/10 bg-white px-1 py-0.5 text-[10px] tnum outline-none focus-visible:ring-1 focus-visible:ring-accent/40"
                    value={Number((x.costs.expense_ratio_annual * 100).toFixed(3))}
                    onChange={(e) => updateVariant(x.id, { costs: { ...x.costs, expense_ratio_annual: Number(e.target.value) / 100 } })}
                    aria-label="信託報酬(%)"
                  />
                  %
                </div>
              </div>
              <button className="shrink-0 rounded px-1 text-[12px] text-muted hover:text-critical" onClick={() => removeVariant(x.id)} aria-label={`${x.label}を削除`}>
                ×
              </button>
            </div>
          ))}
          {extras.length < 4 && (
            <div className="relative">
              <button
                className="h-full min-h-[52px] rounded-lg border border-dashed border-ink/20 px-4 text-[12px] text-ink2 transition-colors hover:border-accent hover:text-accent-deep"
                onClick={() => setAddOpen(!addOpen)}
              >
                + 設定を追加
              </button>
              {addOpen && (
                <div className="absolute left-0 top-full z-20 mt-1 w-60 rounded-lg border border-ink/10 bg-surface p-1 shadow-[0_8px_24px_rgba(11,11,11,0.12)]">
                  {GP_PRESETS.map((p) => (
                    <button key={p.id} className="block w-full rounded-md px-2.5 py-1.5 text-left text-[12px] text-ink hover:bg-page" onClick={() => addFromPreset(p.id)}>
                      {p.label}
                      <span className="block text-[10px] text-muted">{p.description}</span>
                    </button>
                  ))}
                  <button
                    className="block w-full rounded-md px-2.5 py-1.5 text-left text-[12px] text-ink hover:bg-page"
                    onClick={() => {
                      addVariant({
                        id: uid('cmp'),
                        label: `${params.glidepath.name || '現在の設計'}のコピー`,
                        glidepath: structuredClone(params.glidepath),
                        costs: { expense_ratio_annual: params.market.expense_ratio_annual, fixed_fee_monthly: params.market.fixed_fee_monthly },
                      })
                      setAddOpen(false)
                    }}
                  >
                    現在の設計を複製
                    <span className="block text-[10px] text-muted">コストのみ変えた比較などに</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        {slot.error && <p className="mt-2 text-[11.5px] text-critical">エラー: {slot.error}</p>}
      </div>

      <ChartCard title="グライドパス形状の重ね合わせ" subtitle="リスク資産比率 w(t) の比較">
        <MultiLineChart
          ages={riskyOverlay.ages}
          series={riskyOverlay.series}
          percent
          yFmt={(v) => `${Math.round(v * 100)}%`}
          valueFmt={(v) => fmtPct(v)}
          targetAge={params.person.target_age}
        />
      </ChartCard>

      {data && (
        <div className={running ? 'space-y-4 opacity-60' : 'space-y-4'}>
          <WarningsBanner warnings={[...data.warnings, ...data.variants.flatMap((v) => v.warnings.map((w) => `${v.label}: ${w}`))]} />
          <section className="rounded-xl border border-ink/10 bg-surface p-4">
            <h3 className="mb-1 text-[13px] font-semibold text-ink">指標比較(同一シード {data.seed} / {fmtNum(data.n_paths)}パス)</h3>
            <p className="mb-3 text-[10.5px] text-muted">Δは基準との差分。数値はすべてエンジン出力値であり、優劣・推奨を示すものではありません。</p>
            <div className="thin-scroll overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-[12px]">
                <thead>
                  <tr>
                    <th className="border-b border-ink/10 px-2 py-1.5 text-left font-medium text-ink2">指標</th>
                    {data.variants.map((v, i) => (
                      <th key={v.id} className="border-b border-ink/10 px-2 py-1.5 text-right font-medium text-ink2">
                        <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: SERIES[i] }} />
                        {v.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ['目標達成確率', (v) => `${fmtPct(v.metrics.success_prob)} ±${fmtPct(v.metrics.success_se, 2)}`],
                      ['Δ成功確率(vs 基準)', (v) => fmtPt(v.metrics.success_prob - data.variants[0].metrics.success_prob)],
                      ['最終資産 中央値', (v) => fmtYen(v.metrics.terminal.median)],
                      ['最終資産 平均', (v) => fmtYen(v.metrics.terminal.mean)],
                      ['CVaR(5%)', (v) => fmtYen(v.metrics.terminal.cvar05)],
                      ['期待ショートフォール', (v) => fmtYen(v.metrics.expected_shortfall)],
                      ['最大ドローダウン p95', (v) => fmtPct(v.metrics.max_drawdown.p95)],
                      ['直前5年下落 p95', (v) => fmtPct(v.metrics.pre_target_drawdown.p95)],
                      ['枯渇確率(評価終了時)', (v) => (v.metrics.ruin_curve.ages.length ? fmtPct(v.metrics.ruin_prob_end) : '—')],
                      ['資産寿命 中央値', (v) => (v.metrics.asset_life.p50 !== null ? `${v.metrics.asset_life.p50.toFixed(1)}歳` : '—')],
                      ...(data.variants[0].metrics.stress
                        ? ([['ストレス時 成功確率', (v) => (v.metrics.stress ? fmtPct(v.metrics.stress.success_prob) : '—')]] as [
                            string,
                            (v: VRes) => string,
                          ][])
                        : []),
                      ['信託報酬(年率)', (v) => fmtPct(v.costs.expense_ratio_annual, 2)],
                    ] as [string, (v: VRes) => string][]
                  ).map(([label, fn]) => (
                    <tr key={label} className="hover:bg-page">
                      <td className="border-b border-ink/5 px-2 py-1.5 text-ink2">{label}</td>
                      {data.variants.map((v) => (
                        <td key={v.id} className="tnum border-b border-ink/5 px-2 py-1.5 text-right text-ink">
                          {fn(v)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <ChartCard title="資産残高 中央値の推移(名目)" subtitle="同一乱数系列(CRN)による経路比較">
            {data.variants[0].percentiles && (
              <MultiLineChart
                ages={data.variants[0].percentiles.ages}
                series={data.variants.filter((v) => v.percentiles).map((v) => ({ label: v.label, values: v.percentiles!.p50 }))}
                yFmt={(v) => fmtYen(v).replace('円', '')}
                valueFmt={fmtYen}
                goal={data.assumptions_echo.goal_amount}
                goalLabel={`目標 ${fmtYen(data.assumptions_echo.goal_amount)}`}
                targetAge={params.person.target_age}
              />
            )}
          </ChartCard>
        </div>
      )}
      {!data && !running && (
        <p className="rounded-xl border border-dashed border-ink/15 p-6 text-center text-[12px] text-muted">
          「比較を実行」を押すと、追加した設定を同一条件・同一乱数系列で評価し、指標差分と経路を表示します
        </p>
      )}
    </div>
  )
}
