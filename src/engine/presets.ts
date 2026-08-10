// プリセット定義 — CMAセット(FR-CMA-03)/ グライドパス設定例(付録A)/
// 拠出上限テンプレート(FR-CF-02)/ 免責マスタ(CP-04)

import type { CMASet, GlidePathDefinition } from './types'

// ---------------------------------------------------------------- CMAセット
// 出所: 説明用サンプル値(特定機関の公表値ではない)。前提の明示は CP-05 に基づき
// 出力物へ常時表示される。実運用では設定画面から差し替えること(未決事項#1)。

const CORR_STD: number[][] = [
  //        国株    先株    新株    国債    外債    短期
  [1.0, 0.75, 0.65, -0.1, 0.3, 0.02],
  [0.75, 1.0, 0.8, -0.15, 0.45, 0.0],
  [0.65, 0.8, 1.0, -0.1, 0.4, 0.0],
  [-0.1, -0.15, -0.1, 1.0, 0.3, 0.25],
  [0.3, 0.45, 0.4, 0.3, 1.0, 0.1],
  [0.02, 0.0, 0.0, 0.25, 0.1, 1.0],
]

function cma(
  id: string,
  label: string,
  rets: [number, number, number, number, number, number],
  vols: [number, number, number, number, number, number],
  inflation: number,
  note: string,
): CMASet {
  const names = ['国内株式', '先進国株式', '新興国株式', '国内債券', '外国債券', '短期資産']
  const keys = ['dom_eq', 'dev_eq', 'em_eq', 'dom_bond', 'for_bond', 'cash'] as const
  return {
    id,
    version: 'v1',
    label,
    source: '説明用サンプル値(社内検討用。特定機関の公表値ではありません)',
    created_at: '2026-08-08',
    assets: keys.map((k, i) => ({ key: k, name: names[i], ret: rets[i], ret_type: 'geometric', vol: vols[i] })),
    corr: CORR_STD.map((r) => r.slice()),
    inflation,
    note,
    builtin: true,
  }
}

export const BUILTIN_CMA_SETS: CMASet[] = [
  cma(
    'std-2026H1',
    '標準',
    [0.045, 0.05, 0.058, 0.01, 0.023, 0.006],
    [0.17, 0.18, 0.22, 0.03, 0.08, 0.007],
    0.015,
    '中立的な長期前提の例',
  ),
  cma(
    'cons-2026H1',
    '保守',
    [0.035, 0.04, 0.048, 0.005, 0.018, 0.003],
    [0.19, 0.2, 0.24, 0.035, 0.09, 0.007],
    0.02,
    'リターン低め・ボラティリティ高め・インフレ高めの例',
  ),
  cma(
    'opt-2026H1',
    '楽観',
    [0.055, 0.06, 0.068, 0.015, 0.028, 0.01],
    [0.17, 0.18, 0.22, 0.03, 0.08, 0.007],
    0.01,
    'リターン高め・インフレ低めの例',
  ),
]

// ---------------------------------------------------------------- グライドパス プリセット
// 付録A「グライドパス形状の設定例」に基づく。数値は説明用の例であり、推奨値ではない。

export const DEFAULT_RISKY_SPLIT = { dom_eq: 0.35, dev_eq: 0.5, em_eq: 0.15 }
export const DEFAULT_SAFE_SPLIT = { dom_bond: 0.6, for_bond: 0.25, cash: 0.15 }

export function baseGlidepath(): GlidePathDefinition {
  return {
    kind: 'parametric',
    name: '標準型(例)',
    gp_type: 'to',
    curve: 'linear',
    risky_start: 0.85,
    risky_end: 0.35,
    decline_begin_age: 40,
    decline_end_age: 60,
    step_years: 5,
    curve_shape: 3,
    decline_end2_age: 75,
    risky_final: 0.25,
    risky_table: [
      { age: 30, risky: 0.85 },
      { age: 45, risky: 0.7 },
      { age: 60, risky: 0.35 },
    ],
    fixed_risky: 0.5,
    split_mode: 'fixed',
    risky_split: { ...DEFAULT_RISKY_SPLIT },
    safe_split: { ...DEFAULT_SAFE_SPLIT },
    risky_split_end: { dom_eq: 0.4, dev_eq: 0.5, em_eq: 0.1 },
    safe_split_end: { dom_bond: 0.65, for_bond: 0.15, cash: 0.2 },
  }
}

export interface GpPreset {
  id: string
  label: string
  description: string
  apply: (gp: GlidePathDefinition) => GlidePathDefinition
}

export const GP_PRESETS: GpPreset[] = [
  {
    id: 'aggressive',
    label: '積極型(例)',
    description: '0.95 → 0.45(40〜60歳で逓減・To型)',
    apply: (gp) => ({
      ...gp, kind: 'parametric', name: '積極型(例)', gp_type: 'to', curve: 'linear',
      risky_start: 0.95, risky_end: 0.45, decline_begin_age: 40, decline_end_age: 60,
    }),
  },
  {
    id: 'standard',
    label: '標準型(例)',
    description: '0.85 → 0.35(40〜60歳で逓減・To型)',
    apply: (gp) => ({
      ...gp, kind: 'parametric', name: '標準型(例)', gp_type: 'to', curve: 'linear',
      risky_start: 0.85, risky_end: 0.35, decline_begin_age: 40, decline_end_age: 60,
    }),
  },
  {
    id: 'conservative',
    label: '保守型(例)',
    description: '0.70 → 0.25(40〜60歳で逓減・To型)',
    apply: (gp) => ({
      ...gp, kind: 'parametric', name: '保守型(例)', gp_type: 'to', curve: 'linear',
      risky_start: 0.7, risky_end: 0.25, decline_begin_age: 40, decline_end_age: 60,
    }),
  },
  {
    id: 'through',
    label: 'スルー型(例)',
    description: '0.85 → 0.40(60歳)→ 0.25(75歳まで逓減継続)',
    apply: (gp) => ({
      ...gp, kind: 'parametric', name: 'スルー型(例)', gp_type: 'through', curve: 'linear',
      risky_start: 0.85, risky_end: 0.4, decline_begin_age: 40, decline_end_age: 60,
      decline_end2_age: 75, risky_final: 0.25,
    }),
  },
  {
    id: 'balanced50',
    label: 'バランス50(固定)',
    description: 'リスク資産50%の固定配分(UC-06 対比用)',
    apply: (gp) => ({ ...gp, kind: 'fixed', name: 'バランス50(固定)', fixed_risky: 0.5 }),
  },
]

// ---------------------------------------------------------------- 拠出上限テンプレート
// FR-CF-02: 法定値は仕様書にハードコードせず、設定マスタとして管理・更新する。
// 以下は 2026-08 時点の参考初期値。法改正時は設定画面から更新すること。

export interface CapTemplate {
  id: string
  label: string
  monthly_limit: number | null // null = 上限なし
}

export const DEFAULT_CAP_TEMPLATES: CapTemplate[] = [
  { id: 'none', label: '上限なし(課税口座等)', monthly_limit: null },
  { id: 'corp_dc_only', label: '企業型DC(他制度なし)', monthly_limit: 55000 },
  { id: 'corp_dc_db', label: '企業型DC(DB等併用)', monthly_limit: 27500 },
  { id: 'ideco_emp', label: 'iDeCo(会社員・企業年金なし)', monthly_limit: 23000 },
  { id: 'ideco_civil', label: 'iDeCo(公務員等)', monthly_limit: 12000 },
  { id: 'ideco_self', label: 'iDeCo(第1号・自営業等)', monthly_limit: 68000 },
]

// ---------------------------------------------------------------- 免責マスタ(CP-04)

export const DISCLAIMER_TEXT =
  '本シミュレーションは一定の前提条件に基づく試算であり、将来の運用成果を予測・示唆・保証するものではありません。' +
  '数値はすべて計算エンジンの出力値です。特定の金融商品の推奨・勧誘、投資助言を目的とするものではありません。' +
  '手数料・税・インフレ等の前提は「前提条件」をご確認ください。'

export const DISCLAIMER_SHORT =
  '本シミュレーションは一定の前提に基づく試算であり、将来の運用成果を示唆・保証するものではありません。'
