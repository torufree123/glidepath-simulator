// 結果パネル部品 — 説明文(ガードレール付き)/ 前提条件 / 警告バナー / KPIタイル

import { useMemo, useState } from 'react'
import type { SimulationResult } from '../../engine/types'
import { generateExplanation, type ExplainLevel } from '../../engine/explain'
import { DISCLAIMER_TEXT } from '../../engine/presets'
import { fmtNum, fmtPct, fmtYen } from '../../lib/format'
import { DataTable } from '../charts/base'
import { SegField } from '../inputs/fields'

export function StatTile({
  label,
  value,
  sub,
  hero,
  subNode,
}: {
  label: string
  value: string
  sub?: string
  hero?: boolean
  subNode?: React.ReactNode
}) {
  return (
    <div className={`rounded-xl border border-ink/10 bg-surface px-3.5 py-3 ${hero ? 'ring-1 ring-accent/25' : ''}`}>
      <div className="text-[11px] text-ink2">{label}</div>
      <div className={`mt-0.5 font-semibold tracking-tight text-ink ${hero ? 'text-[30px] leading-10' : 'text-[20px] leading-8'}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[10.5px] text-muted">{sub}</div>}
      {subNode}
    </div>
  )
}

export function WarningsBanner({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null
  return (
    <div className="rounded-xl border border-warn/50 bg-warn/10 px-3.5 py-2.5" role="alert">
      <div className="flex items-start gap-2">
        <span aria-hidden className="mt-0.5 text-[13px]">⚠</span>
        <div className="space-y-0.5">
          <div className="text-[11px] font-semibold text-ink">警告({warnings.length}件)</div>
          {warnings.map((w, i) => (
            <p key={i} className="text-[11.5px] leading-relaxed text-ink2">{w}</p>
          ))}
        </div>
      </div>
    </div>
  )
}

export function ExplanationPanel({
  result,
  level,
  onLevelChange,
}: {
  result: SimulationResult
  level: ExplainLevel
  onLevelChange: (l: ExplainLevel) => void
}) {
  const [copied, setCopied] = useState(false)
  const out = useMemo(() => generateExplanation(result, level), [result, level])

  return (
    <div className="space-y-3">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <div className="w-64">
          <SegField
            value={level}
            onChange={onLevelChange}
            options={[
              { value: 'basic', label: '加入者向け' },
              { value: 'expert', label: '専門家向け' },
            ]}
          />
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium ${
              out.blocked ? 'bg-serious/15 text-ink' : 'bg-good/10 text-goodtext'
            }`}
          >
            <span aria-hidden>{out.blocked ? '⛔' : '✓'}</span>
            表現ガードレール({out.guardrail_id}): {out.blocked ? `遮断 → 定型文(検出: ${out.matched}` + ')' : '通過'}
          </span>
          <button
            className="rounded-md border border-ink/10 bg-surface px-2 py-1 text-[11px] text-ink2 hover:border-accent hover:text-accent-deep"
            onClick={() => {
              void navigator.clipboard.writeText(out.text).then(() => {
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              })
            }}
          >
            {copied ? 'コピーしました' : 'コピー'}
          </button>
        </div>
      </div>
      <p className="rounded-xl border border-ink/10 bg-page/50 p-4 text-[13px] leading-[1.9] text-ink">{out.text}</p>
      <p className="text-[10.5px] leading-relaxed text-muted">
        説明文はエンジン出力JSONのみを根拠にテンプレート差し込みで生成され、数値の生成・再計算・丸め直しは行いません(FR-EXP-01)。
        禁止辞書+検査により断定的判断・推奨表現を遮断します(FR-EXP-02 / CP-01 / CP-02)。
      </p>
    </div>
  )
}

export function AssumptionsPanel({ result }: { result: SimulationResult }) {
  const a = result.assumptions_echo
  const v0 = result.variants[0]
  return (
    <div className="space-y-4">
      <div>
        <h4 className="mb-1.5 text-[12px] font-semibold text-ink">資本市場前提(CMA)— {a.cma.label}({a.cma.id} {a.cma.version})</h4>
        <p className="mb-2 text-[11px] text-ink2">
          出所: {a.cma.source} / 作成日: {a.cma.created_at}
          {a.cma.psd_corrected && ' / 相関行列は最近接正定値行列へ補正済み'}
          {a.cma.return_conversion && ` / ${a.cma.return_conversion}`}
        </p>
        <DataTable
          head={['資産クラス', '期待リターン(入力)', '種別', '幾何リターン(使用値)', 'ボラティリティ']}
          rows={a.cma.assets.map((as) => [as.name, fmtPct(as.ret_input, 2), as.ret_type, fmtPct(as.ret_geo, 2), fmtPct(as.vol, 1)])}
        />
      </div>
      <div className="grid gap-x-8 gap-y-1.5 text-[12px] sm:grid-cols-2">
        {[
          ['タイムライン', `${a.timeline.current_age}歳 → ターゲット${a.timeline.target_age}歳 → ${a.timeline.end_age}歳(${a.timeline.months}ヶ月)`],
          ['目標額(名目)', fmtYen(a.goal_amount)],
          ['信託報酬(年率)', fmtPct(v0.costs.expense_ratio_annual, 2)],
          ['口座管理料', `${fmtNum(v0.costs.fixed_fee_monthly)}円/月`],
          ['税制', a.tax_mode_label],
          ['インフレ率(年率・確定値)', fmtPct(a.inflation_annual, 1)],
          ['取り崩し', a.withdrawal_note],
          ['拠出上限', a.contribution_cap ? `${a.contribution_cap.label}${a.contribution_cap.exceeded ? '(超過警告あり)' : ''}` : '—'],
          ['リバランス', a.engine.rebalance === 'band' ? `乖離バンド ±${fmtPct(a.engine.band_pct, 1)}` : '毎月グライドパス目標配分に一致'],
          ['パス数 / シード', `${fmtNum(a.engine.n_paths)} / ${a.engine.seed}`],
          ['乱数生成器', a.engine.rng],
          ['ストレス', a.stress.enabled ? `ターゲット${a.stress.years_before_target}年前に株式${fmtPct(a.stress.equity_shock_pct, 0)}` : 'なし'],
        ].map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-3 border-b border-ink/5 py-1">
            <span className="shrink-0 text-ink2">{k}</span>
            <span className="tnum text-right text-ink">{v}</span>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-ink/10 bg-page/50 p-3.5">
        <h4 className="mb-1 text-[11px] font-semibold text-ink">免責事項({result.disclaimer_id})</h4>
        <p className="text-[11px] leading-relaxed text-ink2">{DISCLAIMER_TEXT}</p>
      </div>
      <p className="tnum text-[10.5px] text-muted">
        再現情報: engine v{result.engine_version} / cma {result.cma_id}({result.cma_version}) / seed {result.seed} / run_id {result.run_id} / 計算時間 {fmtNum(result.timing_ms)}ms
      </p>
    </div>
  )
}
