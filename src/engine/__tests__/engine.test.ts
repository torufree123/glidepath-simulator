import { describe, expect, it } from 'vitest'
import { prepareCma, runSimulation } from '../engine'
import { runAccuracyTest } from '../selftest'
import { BUILTIN_CMA_SETS, baseGlidepath } from '../presets'
import { PCG32 } from '../rng'
import type { CMASet, SimulationRequest } from '../types'

function smallRequest(over: Partial<SimulationRequest> = {}): SimulationRequest {
  return {
    variants: [
      {
        id: 'v1',
        label: '現在の設計',
        glidepath: baseGlidepath(),
        costs: { expense_ratio_annual: 0.003, fixed_fee_monthly: 0 },
      },
    ],
    person: { current_age: 40, target_age: 60, end_age: 80 },
    cashflow: {
      initial_balance: 5_000_000,
      monthly_contribution: 30_000,
      contribution_growth_annual: 0,
      bonus_months: [],
      bonus_amount: 0,
      contribution_start_age: 40,
      contribution_end_age: 60,
      withdrawal: { mode: 'fixed_real', monthly_amount: 100_000, rate_annual: 0.04, start_age: 65, period_end_age: 85 },
      events: [],
    },
    cma: BUILTIN_CMA_SETS[0],
    tax_mode: 'tax_free',
    inflation_annual: 0.015,
    engine: { n_paths: 2000, seed: 42, rebalance: 'monthly_to_target', band_pct: 0.05 },
    goal: { target_amount_at_target_age: 20_000_000 },
    stress: { enabled: false, equity_shock_pct: -0.3, years_before_target: 3 },
    ...over,
  }
}

describe('精度検証 — 解析解との突合(6.7 受け入れ基準)', () => {
  it('N=10,000・30年(ゴールデンシード): 中央値誤差 < 0.5%、5/25/75/95分位誤差 < 1.5%', () => {
    const res = runAccuracyTest(10000)
    for (const c of res.cases) {
      // 検証ログ(CI での確認用)
      console.log(
        `${c.name}: 理論値 ${Math.round(c.theory).toLocaleString()} / MC ${Math.round(c.mc).toLocaleString()} / 相対誤差 ${(c.relErr * 100).toFixed(3)}% (許容 ${(c.tol * 100).toFixed(1)}%)`,
      )
      expect(c.relErr, c.name).toBeLessThan(c.tol)
    }
    expect(res.passed).toBe(true)
  })

  it('N=100,000 でも受け入れ基準を満たす(不偏性のロバストネス確認)', () => {
    const res = runAccuracyTest(100000, 20260808)
    for (const c of res.cases) expect(c.relErr, c.name).toBeLessThan(c.tol)
  }, 120000)
})

describe('再現性(FR-SIM-02 / 非機能要件)', () => {
  it('同一シードで結果が完全一致する', () => {
    const a = runSimulation(smallRequest())
    const b = runSimulation(smallRequest())
    expect(a.variants[0].metrics.success_prob).toBe(b.variants[0].metrics.success_prob)
    expect(a.variants[0].metrics.terminal.median).toBe(b.variants[0].metrics.terminal.median)
    expect(a.variants[0].metrics.max_drawdown.p95).toBe(b.variants[0].metrics.max_drawdown.p95)
    expect(a.variants[0].percentiles!.p50).toEqual(b.variants[0].percentiles!.p50)
  })

  it('異なるシードでは結果が変わる', () => {
    const a = runSimulation(smallRequest())
    const b = runSimulation(smallRequest({ engine: { n_paths: 2000, seed: 43, rebalance: 'monthly_to_target', band_pct: 0.05 } }))
    expect(a.variants[0].metrics.terminal.median).not.toBe(b.variants[0].metrics.terminal.median)
  })
})

describe('CRN 比較(FR-OUT-07 / FR-CMP-01)', () => {
  it('同一定義のバリアントは同一乱数系列で完全一致する', () => {
    const req = smallRequest()
    req.variants = [
      { ...req.variants[0], id: 'a', label: 'A' },
      { ...req.variants[0], id: 'b', label: 'B' },
    ]
    const res = runSimulation(req)
    expect(res.variants[0].metrics.success_prob).toBe(res.variants[1].metrics.success_prob)
    expect(res.variants[0].metrics.terminal.mean).toBe(res.variants[1].metrics.terminal.mean)
  })

  it('コストが高いバリアントは同一乱数系列で必ず中央値が下がる', () => {
    const req = smallRequest()
    req.variants = [
      { ...req.variants[0], id: 'low', label: '低コスト', costs: { expense_ratio_annual: 0.001, fixed_fee_monthly: 0 } },
      { ...req.variants[0], id: 'high', label: '高コスト', costs: { expense_ratio_annual: 0.015, fixed_fee_monthly: 0 } },
    ]
    const res = runSimulation(req)
    expect(res.variants[1].metrics.terminal.median).toBeLessThan(res.variants[0].metrics.terminal.median)
  })
})

describe('リターン生成の統計性質(6.3)', () => {
  it('生成リターンの標本相関が CMA 相関に収束する', () => {
    const rho = 0.6
    const cma2: CMASet = {
      id: 'corr-test',
      version: 'v1',
      label: 'テスト',
      source: 'test',
      created_at: '2026-08-08',
      assets: [
        { key: 'dom_eq', name: 'A', ret: 0.05, ret_type: 'geometric', vol: 0.18 },
        { key: 'dev_eq', name: 'B', ret: 0.04, ret_type: 'geometric', vol: 0.15 },
        { key: 'em_eq', name: '-', ret: 0, ret_type: 'geometric', vol: 0 },
        { key: 'dom_bond', name: '-', ret: 0, ret_type: 'geometric', vol: 0 },
        { key: 'for_bond', name: '-', ret: 0, ret_type: 'geometric', vol: 0 },
        { key: 'cash', name: '-', ret: 0, ret_type: 'geometric', vol: 0 },
      ],
      corr: [
        [1, rho, 0, 0, 0, 0],
        [rho, 1, 0, 0, 0, 0],
        [0, 0, 1, 0, 0, 0],
        [0, 0, 0, 1, 0, 0],
        [0, 0, 0, 0, 1, 0],
        [0, 0, 0, 0, 0, 1],
      ],
      inflation: 0,
    }
    const { m, SL } = prepareCma(cma2)
    const rng = new PCG32(7)
    const n = 60000
    let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0
    for (let i = 0; i < n; i++) {
      const z0 = rng.nextNormal()
      const z1 = rng.nextNormal()
      const x = m[0] + SL[0] * z0
      const y = m[1] + SL[6] * z0 + SL[7] * z1
      sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y
    }
    const mx = sx / n
    const my = sy / n
    const corr = (sxy / n - mx * my) / Math.sqrt((sxx / n - mx * mx) * (syy / n - my * my))
    expect(Math.abs(corr - rho)).toBeLessThan(0.02)
  })

  it('算術リターン入力には対数正規整合変換を適用し記録する(FR-CMA-01/6.3)', () => {
    const cma = structuredClone(BUILTIN_CMA_SETS[0])
    cma.assets[0].ret_type = 'arithmetic'
    const { geoRets, conversionNote } = prepareCma(cma)
    const mu = cma.assets[0].ret
    const sigma = cma.assets[0].vol
    expect(geoRets[0]).toBeCloseTo((1 + mu) * Math.exp((-sigma * sigma) / 2) - 1, 12)
    expect(conversionNote).not.toBeNull()
  })
})

describe('警告・ガード(FR-CF-02 / FR-CMA-02)', () => {
  it('拠出上限テンプレート超過を警告する(エラーとしない)', () => {
    const req = smallRequest()
    req.cashflow.contribution_cap = { label: 'iDeCo(会社員・企業年金なし)', monthly_limit: 23000 }
    const res = runSimulation(req)
    expect(res.warnings.some((w) => w.includes('上限'))).toBe(true)
  })

  it('非正定値の相関行列は補正して警告する', () => {
    const req = smallRequest()
    const cma = structuredClone(BUILTIN_CMA_SETS[0])
    cma.corr[0][1] = 0.99
    cma.corr[1][0] = 0.99
    cma.corr[0][2] = -0.99
    cma.corr[2][0] = -0.99
    cma.corr[1][2] = 0.99
    cma.corr[2][1] = 0.99
    req.cma = cma
    const res = runSimulation(req)
    expect(res.warnings.some((w) => w.includes('正定値'))).toBe(true)
  })
})

describe('ストレスオーバーレイ(FR-OUT-06)と税制モード(FR-SIM-05)', () => {
  it('ターゲット直前の株式ショックは成功確率を低下させる', () => {
    const req = smallRequest({ stress: { enabled: true, equity_shock_pct: -0.3, years_before_target: 3 } })
    const res = runSimulation(req)
    const mt = res.variants[0].metrics
    expect(mt.stress).toBeDefined()
    expect(mt.stress!.success_prob).toBeLessThan(mt.success_prob)
    expect(mt.stress!.success_delta).toBeLessThan(0)
  })

  it('簡易課税モードは非課税より取り崩し原資を早く消費する(枯渇確率が下がらない)', () => {
    const free = runSimulation(smallRequest({ tax_mode: 'tax_free' }))
    const taxed = runSimulation(smallRequest({ tax_mode: 'simple_tax' }))
    expect(taxed.variants[0].metrics.ruin_prob_end).toBeGreaterThanOrEqual(free.variants[0].metrics.ruin_prob_end)
  })
})

describe('リバランス方式(FR-SIM-03)', () => {
  it('乖離バンド方式でも妥当な結果を返す', () => {
    const req = smallRequest({ engine: { n_paths: 1000, seed: 42, rebalance: 'band', band_pct: 0.05 } })
    const res = runSimulation(req)
    const mt = res.variants[0].metrics
    expect(mt.success_prob).toBeGreaterThan(0)
    expect(mt.success_prob).toBeLessThan(1)
    expect(mt.terminal.median).toBeGreaterThan(req.cashflow.initial_balance)
  })

  it('狭いバンド(≒毎月リバランス)は目標配分一致方式に近い結果になる', () => {
    const monthly = runSimulation(smallRequest({ engine: { n_paths: 1000, seed: 7, rebalance: 'monthly_to_target', band_pct: 0.05 } }))
    const tightBand = runSimulation(smallRequest({ engine: { n_paths: 1000, seed: 7, rebalance: 'band', band_pct: 0.005 } }))
    const a = monthly.variants[0].metrics.terminal.median
    const b = tightBand.variants[0].metrics.terminal.median
    expect(Math.abs(a / b - 1)).toBeLessThan(0.02)
  })
})

describe('パーセンタイル系列(FR-OUT-01)', () => {
  it('月次系列が単調な帯(p05 ≤ p25 ≤ p50 ≤ p75 ≤ p95)を返す', () => {
    const res = runSimulation(smallRequest())
    const ps = res.variants[0].percentiles!
    expect(ps.ages.length).toBe(res.months + 1)
    for (let i = 0; i < ps.ages.length; i++) {
      expect(ps.p05[i]).toBeLessThanOrEqual(ps.p25[i] + 1e-9)
      expect(ps.p25[i]).toBeLessThanOrEqual(ps.p50[i] + 1e-9)
      expect(ps.p50[i]).toBeLessThanOrEqual(ps.p75[i] + 1e-9)
      expect(ps.p75[i]).toBeLessThanOrEqual(ps.p95[i] + 1e-9)
    }
  })
})
