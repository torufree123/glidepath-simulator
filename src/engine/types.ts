// 型定義 — 仕様書 7.3「主要オブジェクトのスキーマ概要」に対応

export type AssetKey = 'dom_eq' | 'dev_eq' | 'em_eq' | 'dom_bond' | 'for_bond' | 'cash'

/** 資産クラスの固定順序(FR-GP-04 標準6区分)。エンジン内の添字はこの順。 */
export const ASSET_KEYS: readonly AssetKey[] = ['dom_eq', 'dev_eq', 'em_eq', 'dom_bond', 'for_bond', 'cash']
export const RISKY_KEYS: readonly AssetKey[] = ['dom_eq', 'dev_eq', 'em_eq']
export const SAFE_KEYS: readonly AssetKey[] = ['dom_bond', 'for_bond', 'cash']
/** 株式クラスの添字(ストレスショック対象 FR-OUT-06) */
export const EQUITY_INDICES = [0, 1, 2] as const

export const ASSET_LABELS: Record<AssetKey, string> = {
  dom_eq: '国内株式',
  dev_eq: '先進国株式',
  em_eq: '新興国株式',
  dom_bond: '国内債券',
  for_bond: '外国債券',
  cash: '短期資産',
}

// ---------------------------------------------------------------- グライドパス

export type CurveKind = 'linear' | 'step' | 'exponential' | 'logistic' | 'table'
export type GpKind = 'parametric' | 'fixed' | 'weights_table'

export interface RiskySplit { dom_eq: number; dev_eq: number; em_eq: number }
export interface SafeSplit { dom_bond: number; for_bond: number; cash: number }

/** GlidePathDefinition(FR-GP-01〜05) */
export interface GlidePathDefinition {
  kind: GpKind
  name: string
  // --- パラメトリック定義(kind: parametric)
  gp_type: 'to' | 'through'
  curve: CurveKind
  risky_start: number
  risky_end: number
  decline_begin_age: number
  decline_end_age: number
  step_years: number // curve: step
  curve_shape: number // curve: exponential / logistic の形状パラメータ
  decline_end2_age: number // Through型 第2逓減終了年齢(FR-GP-03)
  risky_final: number // Through型 最終比率
  risky_table: { age: number; risky: number }[] // curve: table(年齢×比率の直接指定)
  // --- 固定配分(kind: fixed / UC-06 ベンチマーク)
  fixed_risky: number
  // --- リスク資産比率 → 資産クラス写像(FR-GP-04)
  split_mode: 'fixed' | 'age_linked'
  risky_split: RiskySplit
  safe_split: SafeSplit
  risky_split_end: RiskySplit // age_linked 時の逓減終了時点の内訳
  safe_split_end: SafeSplit
  // --- CSVインポート(kind: weights_table / FR-GP-05)
  weights_table?: { age: number; weights: Record<AssetKey, number> }[]
  imported_from?: string
}

// ---------------------------------------------------------------- CMA

export interface CmaAsset {
  key: AssetKey
  name: string
  /** 年率期待リターン。ret_type で算術/幾何を必ず明示(FR-CMA-01) */
  ret: number
  ret_type: 'geometric' | 'arithmetic'
  /** 年率ボラティリティ */
  vol: number
}

export interface CMASet {
  id: string
  version: string
  label: string
  source: string
  created_at: string
  assets: CmaAsset[] // ASSET_KEYS の順
  corr: number[][] // 6x6 相関行列
  inflation: number // 年率インフレ率(FR-CMA-04, v0.1 は確定値)
  note?: string
  builtin?: boolean
}

// ---------------------------------------------------------------- キャッシュフロー

export type WithdrawalMode = 'fixed_nominal' | 'fixed_real' | 'rate' | 'period'

export interface SpotEvent {
  id: string
  age: number
  /** 正: 一時金の投入 / 負: 引き出し(FR-CF-04) */
  amount: number
  label: string
}

export interface CashflowPlan {
  initial_balance: number
  monthly_contribution: number
  contribution_growth_annual: number // 年次改定率(FR-CF-01)
  bonus_months: number[] // 開始月起点の年内月番号(1〜12)
  bonus_amount: number // 賞与月の加算額
  contribution_start_age: number
  contribution_end_age: number
  withdrawal: {
    mode: WithdrawalMode
    monthly_amount: number // fixed_nominal / fixed_real: 月額(実質は開始時点価値)
    rate_annual: number // rate: 年率(残高×x%)
    start_age: number
    period_end_age: number // period: 取り崩し終了年齢
  }
  events: SpotEvent[]
  /** 拠出上限テンプレート(FR-CF-02)— UI側で解決した上限値を引き渡す */
  contribution_cap?: { label: string; monthly_limit: number | null }
}

// ---------------------------------------------------------------- リクエスト

export interface PersonParams { current_age: number; target_age: number; end_age: number }
export interface GoalParams { target_amount_at_target_age: number }
export interface StressParams { enabled: boolean; equity_shock_pct: number; years_before_target: number }
export type TaxMode = 'tax_free' | 'simple_tax'
export type RebalanceMode = 'monthly_to_target' | 'band'

export interface EngineParams {
  n_paths: number // 1,000〜100,000(FR-SIM-01)
  seed: number // 完全再現用(FR-SIM-02)
  rebalance: RebalanceMode // FR-SIM-03
  band_pct: number // band 方式の乖離閾値(例 0.05)
}

export interface VariantCosts { expense_ratio_annual: number; fixed_fee_monthly: number }

/** 比較・感応度で用いる設定バリアント。CRN(同一乱数系列)で同時評価される。 */
export interface VariantSpec {
  id: string
  label: string
  glidepath: GlidePathDefinition
  costs: VariantCosts
  want_percentiles?: boolean
  /** 感応度分析用: 拠出額の上書き(リターン系列は共有されるため CRN は維持される) */
  cashflow_override?: { monthly_contribution?: number }
}

export interface SimulationRequest {
  variants: VariantSpec[] // 最大5(FR-CMP-01)。感応度分析では内部的に11
  person: PersonParams
  cashflow: CashflowPlan
  cma: CMASet
  tax_mode: TaxMode
  inflation_annual: number
  engine: EngineParams
  goal: GoalParams
  stress: StressParams
  preview?: boolean
}

// ---------------------------------------------------------------- 結果

export interface PercentileSeries {
  ages: number[]
  p05: number[]
  p25: number[]
  p50: number[]
  p75: number[]
  p95: number[]
}

export interface DistStats {
  mean: number
  median: number
  p05: number
  p25: number
  p75: number
  p95: number
  cvar05: number // 下位5%パスの平均(CVaR 5%)
}

export interface VariantMetrics {
  success_prob: number // P(V_T ≥ G)
  success_se: number // モンテカルロ標準誤差 √(p(1−p)/N)
  shortfall_prob: number
  expected_shortfall: number // E[max(G − V_T, 0)]
  terminal: DistStats // ターゲット年齢時点の最終資産(名目)
  terminal_real_median: number
  terminal_real_cvar05: number
  ruin_prob_by_age: { age: number; prob: number }[] // 例: 80/85/90/95歳(FR-OUT-05)
  ruin_prob_end: number // 評価終了年齢時点
  ruin_curve: { ages: number[]; probs: number[] } // 年次の累積枯渇確率
  asset_life: { ruined_pct: number; p25: number | null; p50: number | null; p75: number | null }
  max_drawdown: { p50: number; p75: number; p95: number } // 正の値(下落率)
  pre_target_drawdown: { p50: number; p95: number } // ターゲット直前5年間(FR-OUT-04)
  stress?: {
    success_prob: number
    success_delta: number
    terminal_median: number
    ruin_prob_end: number
  }
}

export interface VariantResult {
  id: string
  label: string
  percentiles?: PercentileSeries // 名目値。実質値は単調変換のため表示側でデフレート(6.5)
  metrics: VariantMetrics
  terminal_hist: { edges: number[]; counts: number[] }
  costs: VariantCosts
  warnings: string[]
}

export interface AssumptionsEcho {
  cma: {
    id: string
    version: string
    label: string
    source: string
    created_at: string
    return_conversion: string | null // 算術→幾何変換を適用した場合の記録(6.3)
    psd_corrected: boolean // 最近接正定値行列への補正実施(FR-CMA-02)
    assets: { name: string; ret_geo: number; ret_input: number; ret_type: string; vol: number }[]
  }
  inflation_annual: number
  tax_mode: TaxMode
  tax_mode_label: string
  timeline: { current_age: number; target_age: number; end_age: number; months: number }
  engine: { n_paths: number; seed: number; rebalance: RebalanceMode; band_pct: number; rng: string }
  goal_amount: number
  contribution_cap: { label: string; monthly_limit: number | null; exceeded: boolean } | null
  withdrawal_note: string
  stress: StressParams
}

export interface SimulationResult {
  run_id: string
  engine_version: string
  cma_id: string
  cma_version: string
  seed: number
  n_paths: number
  months: number
  preview: boolean
  variants: VariantResult[]
  warnings: string[] // 全体警告(PSD補正・拠出上限超過など)
  assumptions_echo: AssumptionsEcho
  disclaimer_id: string
  timing_ms: number
  created_at: string
}

// ---------------------------------------------------------------- 履歴(SimulationRun の簡易版・追記専用)

export interface RunRecord {
  run_id: string
  created_at: string
  engine_version: string
  cma_id: string
  seed: number
  n_paths: number
  label: string
  success_prob: number
  terminal_median: number
  result_hash: string // 指標JSONのSHA-256(監査・ゴールデンラン照合用)
  params_json: string // 再現用パラメータ一式
}

export const ENGINE_VERSION = '0.1.0'
export const DISCLAIMER_ID = 'DSC-001'
