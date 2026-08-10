import { describe, expect, it } from 'vitest'
import { checkForbidden, generateExplanation } from '../explain'
import { runSimulation } from '../engine'
import { BUILTIN_CMA_SETS, baseGlidepath } from '../presets'
import type { SimulationRequest } from '../types'

const req: SimulationRequest = {
  variants: [
    { id: 'v1', label: '現在の設計', glidepath: baseGlidepath(), costs: { expense_ratio_annual: 0.003, fixed_fee_monthly: 0 } },
  ],
  person: { current_age: 30, target_age: 60, end_age: 95 },
  cashflow: {
    initial_balance: 1_000_000,
    monthly_contribution: 23_000,
    contribution_growth_annual: 0.01,
    bonus_months: [],
    bonus_amount: 0,
    contribution_start_age: 30,
    contribution_end_age: 60,
    withdrawal: { mode: 'fixed_real', monthly_amount: 150_000, rate_annual: 0.04, start_age: 65, period_end_age: 95 },
    events: [],
  },
  cma: BUILTIN_CMA_SETS[0],
  tax_mode: 'tax_free',
  inflation_annual: 0.015,
  engine: { n_paths: 1000, seed: 20260808, rebalance: 'monthly_to_target', band_pct: 0.05 },
  goal: { target_amount_at_target_age: 30_000_000 },
  stress: { enabled: true, equity_shock_pct: -0.3, years_before_target: 3 },
}

describe('説明生成とガードレール(FR-EXP / CP-01)', () => {
  it('禁止辞書が断定・推奨表現を検出する', () => {
    expect(checkForbidden('この設定なら必ず増えます')).not.toBeNull()
    expect(checkForbidden('元本保証があります')).not.toBeNull()
    expect(checkForbidden('このファンドがおすすめです')).not.toBeNull()
    expect(checkForbidden('確実に達成できます')).not.toBeNull()
    expect(checkForbidden('絶対に損をしない設計です')).not.toBeNull()
  })

  it('免責の否定表現(〜を保証するものではありません)は遮断しない', () => {
    expect(checkForbidden('将来の運用成果を保証するものではありません')).toBeNull()
  })

  it('生成された説明文(加入者向け/専門家向け)はガードレールを通過する', () => {
    const res = runSimulation(req)
    for (const level of ['basic', 'expert'] as const) {
      const out = generateExplanation(res, level)
      expect(out.blocked, `${level}: ${out.matched}`).toBe(false)
      expect(out.text.length).toBeGreaterThan(100)
      expect(out.guardrail_id).toBe('G2')
    }
  })

  it('説明文中の数値はエンジン出力と一致する(FR-EXP-01 ファクトチェック)', () => {
    const res = runSimulation(req)
    const out = generateExplanation(res, 'expert')
    const successStr = (res.variants[0].metrics.success_prob * 100).toFixed(1) + '%'
    expect(out.text).toContain(successStr)
    expect(out.text).toContain(String(res.seed))
  })
})
