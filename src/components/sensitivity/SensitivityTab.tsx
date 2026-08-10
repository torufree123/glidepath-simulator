// 感応度タブ(FR-CMP-02)— 主要パラメータ±変化に対する成功確率の感応度(トルネード)

import { useStore } from '../../state/store'
import { fmtNum, fmtPct, fmtPt } from '../../lib/format'
import { TornadoChart } from '../charts/TornadoChart'
import { ChartCard, DataTable } from '../charts/base'
import { NumField } from '../inputs/fields'

export function SensitivityTab() {
  const params = useStore((s) => s.params)
  const deltas = useStore((s) => s.sensDeltas)
  const setDeltas = useStore((s) => s.setSensDeltas)
  const out = useStore((s) => s.sensOut)
  const status = useStore((s) => s.sensStatus)
  const progress = useStore((s) => s.sensProgress)
  const error = useStore((s) => s.sensError)
  const run = useStore((s) => s.runSensitivity)
  const running = status === 'running'
  const gpKind = params.glidepath.kind

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-ink/10 bg-surface p-4">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[14px] font-semibold text-ink">感応度分析(トルネード)</h2>
          <button
            className="rounded-lg bg-accent px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-accent-deep disabled:opacity-50"
            onClick={run}
            disabled={running}
          >
            {running ? `計算中… ${progress}%` : `感応度を実行(${fmtNum(Math.min(params.engine.n_paths, 5000))}パス × 同一乱数)`}
          </button>
        </div>
        <p className="mb-3 text-[11px] leading-relaxed text-muted">
          現在の設計を基準に、主要パラメータを±方向へ変化させたときの目標達成確率の変化を、同一乱数系列(CRN)で評価します。
          {gpKind === 'weights_table' && ' CSV取込定義では拠出額・信託報酬のみが対象です。'}
        </p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          {gpKind === 'parametric' && (
            <>
              <NumField label="開始比率 w_start ±" value={Math.round(deltas.w_start_pt * 100)} onChange={(v) => setDeltas({ w_start_pt: v / 100 })} min={1} max={30} unit="pt" />
              <NumField label="最終比率 w_end ±" value={Math.round(deltas.w_end_pt * 100)} onChange={(v) => setDeltas({ w_end_pt: v / 100 })} min={1} max={30} unit="pt" />
              <NumField label="逓減開始年齢 ±" value={deltas.begin_years} onChange={(v) => setDeltas({ begin_years: v })} min={1} max={15} unit="年" />
            </>
          )}
          {gpKind === 'fixed' && (
            <NumField label="固定比率 ±" value={Math.round(deltas.w_start_pt * 100)} onChange={(v) => setDeltas({ w_start_pt: v / 100 })} min={1} max={30} unit="pt" />
          )}
          <NumField label="月額拠出 ±" value={deltas.contrib_yen} onChange={(v) => setDeltas({ contrib_yen: v })} min={1000} step={1000} unit="円" />
          <NumField label="信託報酬 ±" value={Number((deltas.fee_pt * 100).toFixed(2))} onChange={(v) => setDeltas({ fee_pt: v / 100 })} min={0.01} max={1} step={0.05} unit="pt" />
        </div>
        {error && <p className="mt-2 text-[11.5px] text-critical">エラー: {error}</p>}
      </div>

      {out && (
        <div className={running ? 'opacity-60' : ''}>
          <ChartCard
            title="成功確率の感応度"
            subtitle={`基準: ${fmtPct(out.baseline)}(±${fmtPct(out.baseline_se, 2)} MC標準誤差)/ ${fmtNum(out.n_paths)}パス / seed ${out.seed} — 並びは影響度順(分析上の整列であり優劣表示ではありません)`}
            table={
              <DataTable
                head={['パラメータ', '変化幅', '−方向 Δ成功確率', '+方向 Δ成功確率']}
                rows={out.items.map((it) => [it.label, it.deltaLabel, fmtPt(it.minus), fmtPt(it.plus)])}
              />
            }
          >
            <TornadoChart items={out.items} />
          </ChartCard>
        </div>
      )}
      {!out && !running && (
        <p className="rounded-xl border border-dashed border-ink/15 p-6 text-center text-[12px] text-muted">
          「感応度を実行」を押すと、どのパラメータが結果に効くかをトルネードチャートで表示します
        </p>
      )}
    </div>
  )
}
