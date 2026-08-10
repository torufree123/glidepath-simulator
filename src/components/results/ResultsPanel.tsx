// シミュレーション結果ダッシュボード — KPI行 + ファンチャート + 詳細タブ

import { useMemo, useState } from 'react'
import { useStore } from '../../state/store'
import { fmtAge, fmtNum, fmtPct, fmtPt, fmtYen } from '../../lib/format'
import { STATUS } from '../../lib/chartTheme'
import { FanChart } from '../charts/FanChart'
import { GlidepathChart } from '../charts/GlidepathChart'
import { TerminalHist } from '../charts/TerminalHist'
import { RuinChart } from '../charts/RuinChart'
import { ChartCard, DataTable } from '../charts/base'
import { SegField } from '../inputs/fields'
import { AssumptionsPanel, ExplanationPanel, StatTile, WarningsBanner } from './panels'
import { weightsAt } from '../../engine/glidepath'
import { ASSET_KEYS, ASSET_LABELS } from '../../engine/types'

type DetailTab = 'dist' | 'decum' | 'risk' | 'alloc' | 'explain' | 'assumptions'

export function ResultsPanel() {
  const run = useStore((s) => s.run)
  const params = useStore((s) => s.params)
  const displayReal = useStore((s) => s.displayReal)
  const setDisplayReal = useStore((s) => s.setDisplayReal)
  const explainLevel = useStore((s) => s.explainLevel)
  const setExplainLevel = useStore((s) => s.setExplainLevel)
  const [tab, setTab] = useState<DetailTab>('dist')

  const data = run.data
  const v = data?.variants[0]

  const fanTable = useMemo(() => {
    if (!v?.percentiles) return null
    const ps = v.percentiles
    const rows: (string | number)[][] = []
    const defl = (age: number) => (displayReal ? Math.pow(1 + data!.assumptions_echo.inflation_annual, age - params.person.current_age) : 1)
    const pick = (age: number) => {
      let best = 0
      for (let i = 0; i < ps.ages.length; i++) if (Math.abs(ps.ages[i] - age) < Math.abs(ps.ages[best] - age)) best = i
      return best
    }
    const ages: number[] = []
    for (let a = Math.ceil(params.person.current_age / 5) * 5; a <= params.person.end_age; a += 5) ages.push(a)
    if (!ages.includes(params.person.target_age)) ages.push(params.person.target_age)
    ages.sort((x, y) => x - y)
    for (const age of ages) {
      const i = pick(age)
      const d = defl(ps.ages[i])
      rows.push([
        fmtAge(age) + (age === params.person.target_age ? '(ターゲット)' : ''),
        fmtYen(ps.p05[i] / d),
        fmtYen(ps.p25[i] / d),
        fmtYen(ps.p50[i] / d),
        fmtYen(ps.p75[i] / d),
        fmtYen(ps.p95[i] / d),
      ])
    }
    return rows
  }, [v, displayReal, data, params.person])

  const allocTable = useMemo(() => {
    const rows: (string | number)[][] = []
    for (let a = Math.ceil(params.person.current_age / 5) * 5; a <= params.person.end_age; a += 5) {
      const w = weightsAt(params.glidepath, a)
      rows.push([fmtAge(a), ...ASSET_KEYS.map((_, i) => fmtPct(w[i], 1)), fmtPct(w[0] + w[1] + w[2], 1)])
    }
    return rows
  }, [params.glidepath, params.person])

  if (!data) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-ink2">
        {run.error ? (
          <div className="max-w-md rounded-xl border border-critical/40 bg-critical/5 px-4 py-3 text-[12.5px]">
            <span aria-hidden>⛔</span> 計算エラー: {run.error}
          </div>
        ) : (
          <>
            <div className="h-1 w-56 overflow-hidden rounded-full bg-grid">
              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${run.progress}%` }} />
            </div>
            <p className="text-[12px]">シミュレーションを実行しています…</p>
          </>
        )}
      </div>
    )
  }

  const mt = v!.metrics
  const warnings = [...data.warnings, ...v!.warnings]
  const endAge = params.person.end_age
  const stress = mt.stress

  return (
    <div className="relative space-y-4">
      {/* 実行状態 — 再計算中は前回描画を減光保持(スケルトンなし) */}
      {run.status === 'running' && (
        <div className="absolute -top-2 left-0 right-0 z-10 h-0.5 overflow-hidden rounded-full bg-grid">
          <div className="h-full bg-accent transition-all" style={{ width: `${run.progress}%` }} />
        </div>
      )}
      <div className={run.status === 'running' ? 'space-y-4 opacity-60 transition-opacity' : 'space-y-4 transition-opacity'}>
        {/* 品質バッジ + 実行メタ */}
        <div className="flex flex-wrap items-center gap-2 text-[10.5px]">
          <span
            className={`rounded-full px-2 py-0.5 font-semibold ${
              data.preview ? 'bg-page text-ink2 ring-1 ring-ink/10' : 'bg-accent/10 text-accent-deep ring-1 ring-accent/25'
            }`}
          >
            {data.preview ? `概算プレビュー(${fmtNum(data.n_paths)}パス)` : `本計算(${fmtNum(data.n_paths)}パス)`}
          </span>
          <span className="tnum text-muted">
            seed {data.seed} ・ {fmtNum(data.timing_ms)}ms ・ {data.run_id}
            {run.hash && !data.preview && ` ・ hash ${run.hash.slice(0, 12)}…`}
          </span>
          {run.error && <span className="text-critical">前回実行エラー: {run.error}</span>}
        </div>

        {/* KPI 行 */}
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-5">
          <StatTile
            hero
            label={`目標達成確率 P(V_T ≥ G)@${params.person.target_age}歳`}
            value={fmtPct(mt.success_prob)}
            sub={`MC標準誤差 ±${fmtPct(mt.success_se, 2)} / 目標 ${fmtYen(data.assumptions_echo.goal_amount)}`}
            subNode={
              stress && (
                <div className="mt-1 flex items-center gap-1 text-[10.5px] text-ink2">
                  <span aria-hidden style={{ color: stress.success_delta < 0 ? STATUS.serious : STATUS.good }}>
                    {stress.success_delta < 0 ? '▼' : '▲'}
                  </span>
                  ストレス時 {fmtPct(stress.success_prob)}({fmtPt(stress.success_delta)})
                </div>
              )
            }
          />
          <StatTile label="最終資産 中央値(ターゲット時点)" value={fmtYen(mt.terminal.median)} sub={`実質 ${fmtYen(mt.terminal_real_median)} / 平均 ${fmtYen(mt.terminal.mean)}`} />
          <StatTile label="期待ショートフォール E[max(G−V,0)]" value={fmtYen(mt.expected_shortfall)} sub={`未達確率 ${fmtPct(mt.shortfall_prob)}`} />
          <StatTile label="CVaR(5%)— 下位5%パスの平均" value={fmtYen(mt.terminal.cvar05)} sub={`実質 ${fmtYen(mt.terminal_real_cvar05)}`} />
          <StatTile
            label={`資産枯渇確率(${endAge}歳まで)`}
            value={mt.ruin_curve.ages.length > 0 ? fmtPct(mt.ruin_prob_end) : '—'}
            sub={
              mt.asset_life.p50 !== null
                ? `枯渇時の年齢中央値 ${mt.asset_life.p50.toFixed(1)}歳`
                : mt.ruin_curve.ages.length > 0
                  ? '枯渇したパスはありません'
                  : '取り崩し設定なし'
            }
          />
        </div>

        <WarningsBanner warnings={warnings} />

        {/* ファンチャート */}
        <ChartCard
          title="資産残高の推移分布(ファンチャート)"
          subtitle={`5–95 / 25–75 パーセンタイル帯と中央値 ・ ${displayReal ? '実質値表示(目標線は名目表示時のみ)' : '名目値表示'}`}
          actions={
            <div className="w-44">
              <SegField
                value={displayReal ? 'real' : 'nominal'}
                onChange={(x) => setDisplayReal(x === 'real')}
                options={[
                  { value: 'nominal', label: '名目' },
                  { value: 'real', label: '実質' },
                ]}
              />
            </div>
          }
          table={fanTable && <DataTable head={['年齢', 'p05', 'p25', '中央値', 'p75', 'p95']} rows={fanTable} />}
        >
          {v!.percentiles && (
            <FanChart
              series={v!.percentiles}
              real={displayReal}
              inflation={data.assumptions_echo.inflation_annual}
              currentAge={params.person.current_age}
              goal={data.assumptions_echo.goal_amount}
              targetAge={params.person.target_age}
              wdStartAge={mt.ruin_curve.ages.length > 0 ? params.cashflow.withdrawal.start_age : null}
            />
          )}
        </ChartCard>

        {/* 詳細タブ */}
        <div className="rounded-xl border border-ink/10 bg-surface">
          <div className="flex flex-wrap gap-0.5 border-b border-ink/10 px-2 pt-2" role="tablist" aria-label="詳細分析">
            {(
              [
                ['dist', '最終資産の分布'],
                ['decum', '取り崩し・枯渇'],
                ['risk', '経路リスク'],
                ['alloc', '資産配分'],
                ['explain', '説明文'],
                ['assumptions', '前提条件'],
              ] as [DetailTab, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                className={`rounded-t-lg px-3 py-2 text-[12px] transition-colors ${
                  tab === id ? 'border border-b-0 border-ink/10 bg-surface font-semibold text-ink' : 'text-ink2 hover:text-ink'
                }`}
                style={tab === id ? { marginBottom: -1 } : undefined}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="p-4">
            {tab === 'dist' && (
              <div className="space-y-4">
                <TerminalHist
                  edges={v!.terminal_hist.edges}
                  counts={v!.terminal_hist.counts}
                  goal={data.assumptions_echo.goal_amount}
                  median={mt.terminal.median}
                  nPaths={data.n_paths}
                />
                <DataTable
                  head={['指標', 'p05', 'p25', '中央値', '平均', 'p75', 'p95', 'CVaR(5%)']}
                  rows={[
                    [
                      '最終資産(名目)',
                      fmtYen(mt.terminal.p05),
                      fmtYen(mt.terminal.p25),
                      fmtYen(mt.terminal.median),
                      fmtYen(mt.terminal.mean),
                      fmtYen(mt.terminal.p75),
                      fmtYen(mt.terminal.p95),
                      fmtYen(mt.terminal.cvar05),
                    ],
                  ]}
                />
              </div>
            )}
            {tab === 'decum' && (
              <div className="space-y-4">
                <RuinChart ages={mt.ruin_curve.ages} probs={mt.ruin_curve.probs} />
                {mt.ruin_curve.ages.length > 0 && (
                  <div className="grid gap-4 md:grid-cols-2">
                    <DataTable
                      head={['年齢', '累積枯渇確率']}
                      rows={[
                        ...mt.ruin_prob_by_age.map((r) => [`${r.age}歳`, fmtPct(r.prob)]),
                        [`${endAge}歳(評価終了)`, fmtPct(mt.ruin_prob_end)],
                      ]}
                    />
                    <DataTable
                      head={['資産寿命(枯渇パスのみ)', '値']}
                      rows={[
                        ['枯渇したパスの割合', fmtPct(mt.asset_life.ruined_pct)],
                        ['枯渇年齢 p25', mt.asset_life.p25 !== null ? `${mt.asset_life.p25.toFixed(1)}歳` : '—'],
                        ['枯渇年齢 中央値', mt.asset_life.p50 !== null ? `${mt.asset_life.p50.toFixed(1)}歳` : '—'],
                        ['枯渇年齢 p75', mt.asset_life.p75 !== null ? `${mt.asset_life.p75.toFixed(1)}歳` : '—'],
                      ]}
                    />
                  </div>
                )}
                {stress && (
                  <p className="text-[11.5px] text-ink2">
                    ストレス適用時({data.assumptions_echo.stress.years_before_target}年前に株式{fmtPct(data.assumptions_echo.stress.equity_shock_pct, 0)}):{' '}
                    {endAge}歳までの枯渇確率 {fmtPct(stress.ruin_prob_end)} / 最終資産中央値 {fmtYen(stress.terminal_median)}
                  </p>
                )}
              </div>
            )}
            {tab === 'risk' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2.5 md:grid-cols-5">
                  <StatTile label="最大ドローダウン 中央値" value={fmtPct(mt.max_drawdown.p50)} />
                  <StatTile label="最大ドローダウン p75" value={fmtPct(mt.max_drawdown.p75)} />
                  <StatTile label="最大ドローダウン p95" value={fmtPct(mt.max_drawdown.p95)} />
                  <StatTile label="ターゲット直前5年の下落 中央値" value={fmtPct(mt.pre_target_drawdown.p50)} />
                  <StatTile label="ターゲット直前5年の下落 p95" value={fmtPct(mt.pre_target_drawdown.p95)} />
                </div>
                <p className="text-[11.5px] leading-relaxed text-ink2">
                  「ターゲット直前5年の下落」は、退職直前の市場下落が結果に与える影響(収益率配列リスク・SoRR)を見るための経路指標です(FR-OUT-04)。
                  最大ドローダウンは残高ベース(拠出・取り崩しの影響を含む)でパスごとに算出した分布です。
                  {stress && ` ストレスオーバーレイ適用時の成功確率は ${fmtPct(stress.success_prob)}(${fmtPt(stress.success_delta)})です。`}
                </p>
              </div>
            )}
            {tab === 'alloc' && (
              <ChartCard
                title="資産クラス配分の推移"
                subtitle="リスク資産比率からの写像(FR-GP-04)— 内訳・順序は設定に基づく表示であり優劣を示しません"
                table={<DataTable head={['年齢', ...ASSET_KEYS.map((k) => ASSET_LABELS[k]), 'リスク資産']} rows={allocTable} />}
                className="!border-0 !bg-transparent !p-0"
              >
                <GlidepathChart gp={params.glidepath} currentAge={params.person.current_age} endAge={params.person.end_age} targetAge={params.person.target_age} />
              </ChartCard>
            )}
            {tab === 'explain' && <ExplanationPanel result={data} level={explainLevel} onLevelChange={setExplainLevel} />}
            {tab === 'assumptions' && <AssumptionsPanel result={data} />}
          </div>
        </div>
      </div>
    </div>
  )
}
