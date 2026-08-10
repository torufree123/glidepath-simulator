// @vitest-environment jsdom
// UI レンダースモークテスト — 実エンジン出力を流し込み、主要画面が描画クラッシュしないこと

import { beforeAll, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { runSimulation } from '../../engine/engine'
import { BUILTIN_CMA_SETS, baseGlidepath } from '../../engine/presets'
import type { SimulationRequest } from '../../engine/types'
import { useStore } from '../../state/store'
import { ResultsPanel } from '../results/ResultsPanel'
import { CompareTab } from '../compare/CompareTab'
import { SensitivityTab } from '../sensitivity/SensitivityTab'
import { SettingsTab } from '../settings/SettingsTab'
import { ReportView } from '../report/ReportView'
import { Sidebar } from '../inputs/Sidebar'
import { FanChart } from '../charts/FanChart'

beforeAll(() => {
  // jsdom に ResizeObserver がないためスタブする(チャートの useMeasure 用)
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO
})

function buildResult() {
  const req: SimulationRequest = {
    variants: [
      { id: 'current', label: '現在の設計', glidepath: baseGlidepath(), costs: { expense_ratio_annual: 0.003, fixed_fee_monthly: 0 } },
    ],
    person: { current_age: 30, target_age: 60, end_age: 95 },
    cashflow: {
      initial_balance: 1_000_000,
      monthly_contribution: 23_000,
      contribution_growth_annual: 0.01,
      bonus_months: [6, 12],
      bonus_amount: 50_000,
      contribution_start_age: 30,
      contribution_end_age: 60,
      withdrawal: { mode: 'fixed_real', monthly_amount: 150_000, rate_annual: 0.04, start_age: 65, period_end_age: 90 },
      events: [{ id: 'e1', age: 60, amount: 2_000_000, label: '退職一時金' }],
      contribution_cap: { label: 'iDeCo(会社員・企業年金なし)', monthly_limit: 23_000 },
    },
    cma: BUILTIN_CMA_SETS[0],
    tax_mode: 'tax_free',
    inflation_annual: 0.015,
    engine: { n_paths: 1000, seed: 20260808, rebalance: 'monthly_to_target', band_pct: 0.05 },
    goal: { target_amount_at_target_age: 30_000_000 },
    stress: { enabled: true, equity_shock_pct: -0.3, years_before_target: 3 },
  }
  return runSimulation(req)
}

describe('UI レンダースモーク', () => {
  const data = buildResult()

  it('ResultsPanel が実結果で描画される(KPI・タブ)', () => {
    useStore.setState({ run: { status: 'idle', progress: 100, kind: 'full', data, error: null, hash: 'deadbeef'.repeat(8) } })
    render(<ResultsPanel />)
    expect(screen.getAllByText(/目標達成確率/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/ファンチャート/).length).toBeGreaterThan(0)
    cleanup()
  })

  it('FanChart が固定幅で SVG を描画する', () => {
    const v = data.variants[0]
    const { container } = render(
      <FanChart
        series={v.percentiles!}
        real={false}
        inflation={0.015}
        currentAge={30}
        goal={30_000_000}
        targetAge={60}
        wdStartAge={65}
        width={700}
      />,
    )
    expect(container.querySelector('svg')).not.toBeNull()
    expect(container.querySelectorAll('path').length).toBeGreaterThan(2)
    cleanup()
  })

  it('Sidebar / CompareTab / SensitivityTab / SettingsTab が描画される', () => {
    render(<Sidebar />)
    expect(screen.getAllByText(/グライドパス/).length).toBeGreaterThan(0)
    cleanup()
    render(<CompareTab />)
    expect(screen.getAllByText(/設計比較/).length).toBeGreaterThan(0)
    cleanup()
    render(<SensitivityTab />)
    expect(screen.getAllByText(/感応度分析/).length).toBeGreaterThan(0)
    cleanup()
    render(<SettingsTab />)
    expect(screen.getAllByText(/CMAセット/).length).toBeGreaterThan(0)
    cleanup()
  })

  it('ReportView が再現情報(FR-REP-02)を含んで描画される', () => {
    useStore.setState({ run: { status: 'idle', progress: 100, kind: 'full', data, error: null, hash: 'ab12cd34'.repeat(8) }, reportOpen: true })
    render(<ReportView />)
    expect(screen.getAllByText(/再現情報/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(new RegExp(data.run_id)).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/免責事項/).length).toBeGreaterThan(0)
    cleanup()
  })
})
