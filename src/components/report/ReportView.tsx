// 印刷レポート(FR-REP-01/02)— 前提条件・免責の自動掲載、再現情報の脚注

import { useEffect } from 'react'
import { useStore } from '../../state/store'
import { fmtNum, fmtPct, fmtPt, fmtYen } from '../../lib/format'
import { FanChart } from '../charts/FanChart'
import { GlidepathChart } from '../charts/GlidepathChart'
import { TerminalHist } from '../charts/TerminalHist'
import { RuinChart } from '../charts/RuinChart'
import { DataTable } from '../charts/base'
import { AssumptionsPanel, ExplanationPanel, StatTile } from '../results/panels'

const CHART_W = 690

export function ReportView() {
  const setReportOpen = useStore((s) => s.setReportOpen)
  const run = useStore((s) => s.run)
  const params = useStore((s) => s.params)
  const explainLevel = useStore((s) => s.explainLevel)
  const setExplainLevel = useStore((s) => s.setExplainLevel)

  useEffect(() => {
    document.body.classList.add('report-printing')
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setReportOpen(false)
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.classList.remove('report-printing')
      window.removeEventListener('keydown', onKey)
    }
  }, [setReportOpen])

  const data = run.data
  if (!data) return null
  const v = data.variants[0]
  const mt = v.metrics

  return (
    <div id="report-view" className="fixed inset-0 z-40 overflow-y-auto bg-ink/40 p-6">
      <div className="report-sheet mx-auto max-w-[780px] rounded-xl bg-white p-10 shadow-2xl">
        <div className="no-print mb-6 flex items-center justify-between gap-2 rounded-lg bg-page px-3 py-2">
          <span className="text-[11.5px] text-ink2">ブラウザの印刷機能でPDFとして保存できます(A4縦推奨)</span>
          <div className="flex gap-2">
            <button className="rounded-lg bg-accent px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-accent-deep" onClick={() => window.print()}>
              印刷 / PDF保存
            </button>
            <button className="rounded-lg border border-ink/10 px-3.5 py-1.5 text-[12px] text-ink2 hover:bg-page" onClick={() => setReportOpen(false)}>
              閉じる
            </button>
          </div>
        </div>

        <header className="mb-5 border-b border-ink/10 pb-4">
          <h1 className="text-[20px] font-bold text-ink">グライドパス・シミュレーション レポート</h1>
          <p className="mt-1 text-[11px] text-ink2">
            作成: {new Date(data.created_at).toLocaleString('ja-JP')} ・ 設計: {v.label} ・{' '}
            {data.preview ? `概算プレビュー(${fmtNum(data.n_paths)}パス)` : `本計算(${fmtNum(data.n_paths)}パス)`}
          </p>
          {data.preview && (
            <p className="mt-1.5 rounded bg-warn/15 px-2 py-1 text-[10.5px] text-ink">
              ⚠ これは低パス数の概算プレビューです。配布用には「本計算を実行」後のレポートを使用してください。
            </p>
          )}
        </header>

        <section className="print-break-avoid mb-5">
          <h2 className="mb-2 text-[14px] font-semibold text-ink">サマリー</h2>
          <div className="grid grid-cols-2 gap-2">
            <StatTile hero label={`目標達成確率(${params.person.target_age}歳時点・目標 ${fmtYen(data.assumptions_echo.goal_amount)})`} value={fmtPct(mt.success_prob)} sub={`MC標準誤差 ±${fmtPct(mt.success_se, 2)}${mt.stress ? ` / ストレス時 ${fmtPct(mt.stress.success_prob)}(${fmtPt(mt.stress.success_delta)})` : ''}`} />
            <div className="grid grid-cols-2 gap-2">
              <StatTile label="最終資産 中央値" value={fmtYen(mt.terminal.median)} sub={`実質 ${fmtYen(mt.terminal_real_median)}`} />
              <StatTile label="CVaR(5%)" value={fmtYen(mt.terminal.cvar05)} />
              <StatTile label="期待ショートフォール" value={fmtYen(mt.expected_shortfall)} sub={`未達確率 ${fmtPct(mt.shortfall_prob)}`} />
              <StatTile label={`枯渇確率(${params.person.end_age}歳)`} value={mt.ruin_curve.ages.length ? fmtPct(mt.ruin_prob_end) : '—'} />
            </div>
          </div>
        </section>

        {v.percentiles && (
          <section className="print-break-avoid mb-5">
            <h2 className="mb-2 text-[14px] font-semibold text-ink">資産残高の推移分布(名目)</h2>
            <FanChart
              series={v.percentiles}
              real={false}
              inflation={data.assumptions_echo.inflation_annual}
              currentAge={params.person.current_age}
              goal={data.assumptions_echo.goal_amount}
              targetAge={params.person.target_age}
              wdStartAge={mt.ruin_curve.ages.length > 0 ? params.cashflow.withdrawal.start_age : null}
              width={CHART_W}
              height={300}
              interactive={false}
            />
          </section>
        )}

        <section className="print-break-avoid mb-5">
          <h2 className="mb-2 text-[14px] font-semibold text-ink">グライドパス(資産クラス配分の推移)</h2>
          <GlidepathChart gp={params.glidepath} currentAge={params.person.current_age} endAge={params.person.end_age} targetAge={params.person.target_age} width={CHART_W} height={240} interactive={false} />
        </section>

        <section className="print-break-avoid mb-5">
          <h2 className="mb-2 text-[14px] font-semibold text-ink">最終資産の分布(ターゲット時点)</h2>
          <TerminalHist edges={v.terminal_hist.edges} counts={v.terminal_hist.counts} goal={data.assumptions_echo.goal_amount} median={mt.terminal.median} nPaths={data.n_paths} width={CHART_W} height={220} interactive={false} />
        </section>

        {mt.ruin_curve.ages.length > 0 && (
          <section className="print-break-avoid mb-5">
            <h2 className="mb-2 text-[14px] font-semibold text-ink">取り崩し期の資産枯渇確率</h2>
            <RuinChart ages={mt.ruin_curve.ages} probs={mt.ruin_curve.probs} width={CHART_W} height={210} interactive={false} />
          </section>
        )}

        <section className="print-break-avoid mb-5">
          <h2 className="mb-2 text-[14px] font-semibold text-ink">主要指標</h2>
          <DataTable
            head={['指標', '値']}
            rows={[
              ['目標達成確率 P(V_T ≥ G)', `${fmtPct(mt.success_prob)}(±${fmtPct(mt.success_se, 2)})`],
              ['期待ショートフォール', fmtYen(mt.expected_shortfall)],
              ['最終資産(平均 / 中央値 / CVaR5%)', `${fmtYen(mt.terminal.mean)} / ${fmtYen(mt.terminal.median)} / ${fmtYen(mt.terminal.cvar05)}`],
              ['最大ドローダウン(p50 / p95)', `${fmtPct(mt.max_drawdown.p50)} / ${fmtPct(mt.max_drawdown.p95)}`],
              ['ターゲット直前5年の下落(p50 / p95)', `${fmtPct(mt.pre_target_drawdown.p50)} / ${fmtPct(mt.pre_target_drawdown.p95)}`],
              ...mt.ruin_prob_by_age.map((r) => [`資産枯渇確率(${r.age}歳)`, fmtPct(r.prob)] as [string, string]),
              ...(mt.stress ? ([['ストレス時 成功確率(FR-OUT-06)', `${fmtPct(mt.stress.success_prob)}(${fmtPt(mt.stress.success_delta)})`]] as [string, string][]) : []),
            ]}
          />
        </section>

        <section className="print-break-avoid mb-5">
          <h2 className="mb-2 text-[14px] font-semibold text-ink">説明文</h2>
          <ExplanationPanel result={data} level={explainLevel} onLevelChange={setExplainLevel} />
        </section>

        <section className="print-break-avoid mb-5">
          <h2 className="mb-2 text-[14px] font-semibold text-ink">前提条件・免責事項</h2>
          <AssumptionsPanel result={data} />
        </section>

        <footer className="tnum border-t border-ink/10 pt-3 text-[10px] leading-relaxed text-muted">
          再現情報(FR-REP-02): engine_version {data.engine_version} / cma_version {data.cma_id}({data.cma_version}) / seed {data.seed} / run_id {data.run_id}
          {run.hash && !data.preview && ` / result_hash(SHA-256) ${run.hash}`}
          。同一の engine_version・CMA・パラメータ・シードにより第三者が結果を完全再現できます。
        </footer>
      </div>
    </div>
  )
}
