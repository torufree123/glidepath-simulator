// グライドパス関数(6.2 / FR-GP-01〜06)

import type { GlidePathDefinition, RiskySplit, SafeSplit } from './types'
import { ASSET_KEYS, RISKY_KEYS, SAFE_KEYS } from './types'

/** テーブル(年齢×値)の線形補間。範囲外は端点で固定。 */
function interpTable(points: { age: number; v: number }[], age: number): number {
  if (points.length === 0) return 0
  const sorted = points
  if (age <= sorted[0].age) return sorted[0].v
  if (age >= sorted[sorted.length - 1].age) return sorted[sorted.length - 1].v
  for (let i = 1; i < sorted.length; i++) {
    if (age <= sorted[i].age) {
      const a = sorted[i - 1]
      const b = sorted[i]
      const t = b.age === a.age ? 0 : (age - a.age) / (b.age - a.age)
      return a.v + (b.v - a.v) * t
    }
  }
  return sorted[sorted.length - 1].v
}

/** リスク資産比率 w_eq(a)(6.2 の一般形 + カーブ形状 FR-GP-02 + Through型 FR-GP-03) */
export function riskyAt(gp: GlidePathDefinition, age: number): number {
  let w: number
  if (gp.kind === 'fixed') {
    w = gp.fixed_risky
  } else if (gp.kind === 'weights_table' && gp.weights_table) {
    const pts = gp.weights_table.map((r) => ({
      age: r.age,
      v: RISKY_KEYS.reduce((s, k) => s + (r.weights[k] ?? 0), 0),
    }))
    w = interpTable(pts, age)
  } else if (gp.curve === 'table') {
    const pts = [...gp.risky_table].sort((a, b) => a.age - b.age).map((p) => ({ age: p.age, v: p.risky }))
    w = interpTable(pts, age)
  } else {
    const w0 = gp.risky_start
    const w1 = gp.risky_end
    const a0 = gp.decline_begin_age
    const a1 = gp.decline_end_age
    if (a1 <= a0) {
      // 境界値: a_begin = a_end はその年齢での段差として扱う
      w = age < a0 ? w0 : w1
    } else if (age <= a0) {
      w = w0
    } else if (age >= a1) {
      w = w1
    } else {
      const x = (age - a0) / (a1 - a0)
      switch (gp.curve) {
        case 'linear':
          w = w0 + (w1 - w0) * x
          break
        case 'step': {
          const stepY = Math.max(1, gp.step_years)
          const bracket = a0 + Math.floor((age - a0) / stepY) * stepY
          const xs = (bracket - a0) / (a1 - a0)
          w = w0 + (w1 - w0) * xs
          break
        }
        case 'exponential': {
          const k = Math.max(0.1, gp.curve_shape)
          const e = Math.exp(-k)
          w = w1 + ((w0 - w1) * (Math.exp(-k * x) - e)) / (1 - e)
          break
        }
        case 'logistic': {
          const k = Math.max(0.5, gp.curve_shape)
          const s = (t: number) => 1 / (1 + Math.exp(k * (t - 0.5)))
          w = w1 + ((w0 - w1) * (s(x) - s(1))) / (s(0) - s(1))
          break
        }
        default:
          w = w0 + (w1 - w0) * x
      }
    }
    // Through型: 着地後 a_end2 まで w_end → w_final へ線形逓減、以後固定
    if (gp.gp_type === 'through' && age > a1) {
      const a2 = gp.decline_end2_age
      const wf = gp.risky_final
      if (a2 <= a1 || age >= a2) w = wf
      else w = w1 + ((wf - w1) * (age - a1)) / (a2 - a1)
    }
  }
  return Math.min(1, Math.max(0, w))
}

function normalizeSplit<T extends { [K in keyof T]: number }>(split: T): { split: T; fixed: boolean } {
  const values = Object.values(split) as number[]
  const sum = values.reduce((s, v) => s + v, 0)
  if (Math.abs(sum - 1) < 1e-9) return { split, fixed: false }
  if (sum <= 0) return { split, fixed: false }
  const out = {} as Record<string, number>
  for (const [k, v] of Object.entries(split) as [string, number][]) out[k] = v / sum
  return { split: out as T, fixed: true }
}

function lerpSplit<T extends { [K in keyof T]: number }>(a: T, b: T, t: number): T {
  const out = {} as Record<string, number>
  for (const [k, v] of Object.entries(a) as [string, number][]) {
    out[k] = v + ((b as Record<string, number>)[k] - v) * t
  }
  return out as T
}

/** 年齢 age における6資産クラスのウェイト(FR-GP-04 の写像) */
export function weightsAt(gp: GlidePathDefinition, age: number): Float64Array {
  const w = new Float64Array(6)
  if (gp.kind === 'weights_table' && gp.weights_table) {
    ASSET_KEYS.forEach((k, i) => {
      const pts = gp.weights_table!.map((r) => ({ age: r.age, v: r.weights[k] ?? 0 }))
      w[i] = interpTable(pts, age)
    })
    // 補間誤差を正規化して Σw=1 を保証(FR-GP-06)
    const sum = w.reduce((s, v) => s + v, 0)
    if (sum > 0) for (let i = 0; i < 6; i++) w[i] /= sum
    return w
  }
  const eq = riskyAt(gp, age)
  let rs: RiskySplit = normalizeSplit(gp.risky_split).split
  let ss: SafeSplit = normalizeSplit(gp.safe_split).split
  if (gp.split_mode === 'age_linked' && gp.kind === 'parametric') {
    const a0 = gp.decline_begin_age
    const a1 = gp.gp_type === 'through' ? gp.decline_end2_age : gp.decline_end_age
    const t = a1 <= a0 ? (age < a0 ? 0 : 1) : Math.min(1, Math.max(0, (age - a0) / (a1 - a0)))
    rs = normalizeSplit(lerpSplit(gp.risky_split, gp.risky_split_end, t)).split
    ss = normalizeSplit(lerpSplit(gp.safe_split, gp.safe_split_end, t)).split
  }
  RISKY_KEYS.forEach((k, i) => {
    w[i] = eq * rs[k as keyof RiskySplit]
  })
  SAFE_KEYS.forEach((k, i) => {
    w[3 + i] = (1 - eq) * ss[k as keyof SafeSplit]
  })
  return w
}

/**
 * 月次ウェイト行列の構築と制約検証(FR-GP-06)。
 * W: 長さ months×6 のフラット配列。risky: 各月のリスク資産比率。
 */
export function buildWeightMatrix(
  gp: GlidePathDefinition,
  currentAge: number,
  months: number,
): { W: Float64Array; risky: Float64Array; warnings: string[] } {
  const W = new Float64Array(months * 6)
  const risky = new Float64Array(months)
  const warnings: string[] = []

  const rsSum = Object.values(gp.risky_split).reduce((s, v) => s + v, 0)
  const ssSum = Object.values(gp.safe_split).reduce((s, v) => s + v, 0)
  if (gp.kind !== 'weights_table') {
    if (Math.abs(rsSum - 1) > 1e-6)
      warnings.push(`リスク資産内訳の合計が${(rsSum * 100).toFixed(1)}%のため、100%に正規化して計算しました`)
    if (Math.abs(ssSum - 1) > 1e-6)
      warnings.push(`安全資産内訳の合計が${(ssSum * 100).toFixed(1)}%のため、100%に正規化して計算しました`)
  }

  let reRise = false
  for (let t = 0; t < months; t++) {
    const age = currentAge + t / 12
    const w = weightsAt(gp, age)
    let sum = 0
    for (let i = 0; i < 6; i++) {
      const v = Math.min(1, Math.max(0, w[i]))
      W[t * 6 + i] = v
      sum += v
    }
    if (sum > 0 && Math.abs(sum - 1) > 1e-9) {
      for (let i = 0; i < 6; i++) W[t * 6 + i] /= sum
    }
    risky[t] = W[t * 6] + W[t * 6 + 1] + W[t * 6 + 2]
    if (t > 0 && risky[t] > risky[t - 1] + 1e-9) reRise = true
  }
  if (reRise && gp.kind !== 'fixed') {
    warnings.push('リスク資産比率が途中で再上昇する非単調な経路です(FR-GP-06 警告)')
  }
  return { W, risky, warnings }
}

/** グラフ用: 年次粒度のグライドパス系列(UI・レポートで使用) */
export function riskySeries(
  gp: GlidePathDefinition,
  fromAge: number,
  toAge: number,
  stepYears = 0.25,
): { ages: number[]; risky: number[] } {
  const ages: number[] = []
  const risky: number[] = []
  for (let a = fromAge; a <= toAge + 1e-9; a += stepYears) {
    ages.push(a)
    risky.push(riskyAt(gp, a))
  }
  return { ages, risky }
}
