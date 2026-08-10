// 感応度分析(FR-CMP-02)— 主要パラメータの±変化に対する成功確率の感応度
// 全バリアントを同一乱数系列(CRN)で1回のパス生成にまとめて評価する。

import type { GlidePathDefinition, SimulationRequest, SimulationResult, VariantSpec } from './types'

export interface SensitivityDeltas {
  w_start_pt: number // 開始比率 ±(ポイント, 0.10 = 10pt)
  w_end_pt: number
  begin_years: number // 逓減開始年齢 ±年
  contrib_yen: number // 月額拠出 ±円
  fee_pt: number // 信託報酬 ±(0.001 = 0.1pt)
}

export const DEFAULT_SENSITIVITY_DELTAS: SensitivityDeltas = {
  w_start_pt: 0.1,
  w_end_pt: 0.1,
  begin_years: 5,
  contrib_yen: 5000,
  fee_pt: 0.001,
}

export interface SensitivityParamDef {
  key: string
  label: string
  applyGp?: (gp: GlidePathDefinition, dir: 1 | -1, d: SensitivityDeltas) => GlidePathDefinition
  applyContrib?: (base: number, dir: 1 | -1, d: SensitivityDeltas) => number
  applyFee?: (base: number, dir: 1 | -1, d: SensitivityDeltas) => number
  deltaLabel: (d: SensitivityDeltas) => string
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

export function sensitivityParams(gp: GlidePathDefinition): SensitivityParamDef[] {
  const params: SensitivityParamDef[] = []
  if (gp.kind === 'parametric') {
    params.push(
      {
        key: 'w_start',
        label: '開始比率 w_start',
        applyGp: (g, dir, d) => ({ ...g, risky_start: clamp01(g.risky_start + dir * d.w_start_pt) }),
        deltaLabel: (d) => `±${Math.round(d.w_start_pt * 100)}pt`,
      },
      {
        key: 'w_end',
        label: '最終比率 w_end',
        applyGp: (g, dir, d) => ({ ...g, risky_end: clamp01(g.risky_end + dir * d.w_end_pt) }),
        deltaLabel: (d) => `±${Math.round(d.w_end_pt * 100)}pt`,
      },
      {
        key: 'begin_age',
        label: '逓減開始年齢',
        applyGp: (g, dir, d) => ({
          ...g,
          decline_begin_age: Math.min(g.decline_end_age - 1, Math.max(20, g.decline_begin_age + dir * d.begin_years)),
        }),
        deltaLabel: (d) => `±${d.begin_years}年`,
      },
    )
  } else if (gp.kind === 'fixed') {
    params.push({
      key: 'fixed_risky',
      label: '固定リスク資産比率',
      applyGp: (g, dir, d) => ({ ...g, fixed_risky: clamp01(g.fixed_risky + dir * d.w_start_pt) }),
      deltaLabel: (d) => `±${Math.round(d.w_start_pt * 100)}pt`,
    })
  }
  params.push(
    {
      key: 'contribution',
      label: '月額拠出',
      applyContrib: (base, dir, d) => Math.max(0, base + dir * d.contrib_yen),
      deltaLabel: (d) => `±${d.contrib_yen.toLocaleString('ja-JP')}円`,
    },
    {
      key: 'expense_ratio',
      label: '信託報酬',
      applyFee: (base, dir, d) => Math.max(0, base + dir * d.fee_pt),
      deltaLabel: (d) => `±${(d.fee_pt * 100).toFixed(2)}pt`,
    },
  )
  return params
}

/** ベース設定(単一バリアント)から感応度用のマルチバリアント要求を構築 */
export function buildSensitivityRequest(base: SimulationRequest, deltas: SensitivityDeltas): SimulationRequest {
  const bv = base.variants[0]
  const params = sensitivityParams(bv.glidepath)
  const variants: VariantSpec[] = [{ ...bv, id: 'baseline', label: '基準', want_percentiles: false }]
  for (const p of params) {
    for (const dir of [-1, 1] as const) {
      const id = `${p.key}${dir > 0 ? '+' : '-'}`
      let gp = bv.glidepath
      let costs = { ...bv.costs }
      let override: VariantSpec['cashflow_override']
      if (p.applyGp) gp = p.applyGp(gp, dir, deltas)
      if (p.applyFee) costs = { ...costs, expense_ratio_annual: p.applyFee(costs.expense_ratio_annual, dir, deltas) }
      if (p.applyContrib)
        override = { monthly_contribution: p.applyContrib(base.cashflow.monthly_contribution, dir, deltas) }
      variants.push({ id, label: `${p.label} ${dir > 0 ? '+' : '−'}`, glidepath: gp, costs, want_percentiles: false, cashflow_override: override })
    }
  }
  return { ...base, variants, stress: { ...base.stress, enabled: false } }
}

export interface TornadoItem {
  key: string
  label: string
  deltaLabel: string
  minus: number // Δ成功確率(−方向)
  plus: number // Δ成功確率(+方向)
}

export interface SensitivityOutput {
  baseline: number
  baseline_se: number
  items: TornadoItem[]
  n_paths: number
  seed: number
  run_id: string
}

export function mapSensitivityResult(res: SimulationResult, gp: GlidePathDefinition, deltas: SensitivityDeltas): SensitivityOutput {
  const params = sensitivityParams(gp)
  const byId = new Map(res.variants.map((v) => [v.id, v]))
  const baseline = byId.get('baseline')!
  const items: TornadoItem[] = params.map((p) => {
    const minus = byId.get(`${p.key}-`)
    const plus = byId.get(`${p.key}+`)
    return {
      key: p.key,
      label: p.label,
      deltaLabel: p.deltaLabel(deltas),
      minus: (minus?.metrics.success_prob ?? baseline.metrics.success_prob) - baseline.metrics.success_prob,
      plus: (plus?.metrics.success_prob ?? baseline.metrics.success_prob) - baseline.metrics.success_prob,
    }
  })
  // 影響の大きい順(絶対値)に整列 — 分析上の並びであり優劣の表示ではない
  items.sort((a, b) => Math.max(Math.abs(b.minus), Math.abs(b.plus)) - Math.max(Math.abs(a.minus), Math.abs(a.plus)))
  return {
    baseline: baseline.metrics.success_prob,
    baseline_se: baseline.metrics.success_se,
    items,
    n_paths: res.n_paths,
    seed: res.seed,
    run_id: res.run_id,
  }
}
