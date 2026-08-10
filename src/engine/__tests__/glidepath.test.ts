import { describe, expect, it } from 'vitest'
import { buildWeightMatrix, riskyAt, weightsAt } from '../glidepath'
import { baseGlidepath } from '../presets'

describe('グライドパス関数(6.2 / FR-GP)', () => {
  it('区分線形(To型)の一般形どおりに計算する', () => {
    const gp = baseGlidepath() // 0.85 → 0.35, 40〜60歳, linear
    expect(riskyAt(gp, 30)).toBeCloseTo(0.85, 10)
    expect(riskyAt(gp, 40)).toBeCloseTo(0.85, 10)
    expect(riskyAt(gp, 50)).toBeCloseTo(0.6, 10)
    expect(riskyAt(gp, 60)).toBeCloseTo(0.35, 10)
    expect(riskyAt(gp, 80)).toBeCloseTo(0.35, 10) // To型: 着地後固定
  })

  it('境界値: a_begin = a_end はその年齢での段差になる', () => {
    const gp = { ...baseGlidepath(), decline_begin_age: 50, decline_end_age: 50 }
    expect(riskyAt(gp, 49.99)).toBeCloseTo(0.85, 10)
    expect(riskyAt(gp, 50)).toBeCloseTo(0.35, 10)
  })

  it('境界値: w_start = w_end は定数経路になる', () => {
    const gp = { ...baseGlidepath(), risky_start: 0.5, risky_end: 0.5 }
    for (const a of [30, 45, 60, 90]) expect(riskyAt(gp, a)).toBeCloseTo(0.5, 10)
  })

  it('Through型は第2逓減区間ののち w_final で固定する(FR-GP-03)', () => {
    const gp = {
      ...baseGlidepath(),
      gp_type: 'through' as const,
      risky_end: 0.4,
      decline_end2_age: 75,
      risky_final: 0.25,
    }
    expect(riskyAt(gp, 60)).toBeCloseTo(0.4, 10)
    expect(riskyAt(gp, 67.5)).toBeCloseTo(0.325, 10)
    expect(riskyAt(gp, 75)).toBeCloseTo(0.25, 10)
    expect(riskyAt(gp, 95)).toBeCloseTo(0.25, 10)
  })

  it('table 指定は端点の外側で固定される(FR-GP-02)', () => {
    const gp = {
      ...baseGlidepath(),
      curve: 'table' as const,
      risky_table: [
        { age: 40, risky: 0.8 },
        { age: 60, risky: 0.3 },
      ],
    }
    expect(riskyAt(gp, 20)).toBeCloseTo(0.8, 10)
    expect(riskyAt(gp, 50)).toBeCloseTo(0.55, 10)
    expect(riskyAt(gp, 90)).toBeCloseTo(0.3, 10)
  })

  it('step カーブは刻み内で一定値を保つ', () => {
    const gp = { ...baseGlidepath(), curve: 'step' as const, step_years: 5 }
    expect(riskyAt(gp, 41)).toBeCloseTo(riskyAt(gp, 44.9), 10)
    expect(riskyAt(gp, 41)).toBeGreaterThan(riskyAt(gp, 46))
  })

  it('exponential / logistic は端点で w_start / w_end に一致する', () => {
    for (const curve of ['exponential', 'logistic'] as const) {
      const gp = { ...baseGlidepath(), curve }
      expect(riskyAt(gp, 40)).toBeCloseTo(0.85, 6)
      expect(riskyAt(gp, 60)).toBeCloseTo(0.35, 6)
      const mid = riskyAt(gp, 50)
      expect(mid).toBeLessThan(0.85)
      expect(mid).toBeGreaterThan(0.35)
    }
  })

  it('全時点で配分合計 = 1(FR-GP-06)', () => {
    const gp = baseGlidepath()
    const { W } = buildWeightMatrix(gp, 30, 780)
    for (let t = 0; t < 780; t++) {
      let s = 0
      for (let i = 0; i < 6; i++) s += W[t * 6 + i]
      expect(s).toBeCloseTo(1, 9)
    }
  })

  it('リスク資産比率の再上昇を警告として検出する(FR-GP-06: エラーとしない)', () => {
    const gp = {
      ...baseGlidepath(),
      curve: 'table' as const,
      risky_table: [
        { age: 30, risky: 0.8 },
        { age: 50, risky: 0.3 },
        { age: 60, risky: 0.6 }, // 再上昇
      ],
    }
    const { warnings } = buildWeightMatrix(gp, 30, 400)
    expect(warnings.some((w) => w.includes('再上昇'))).toBe(true)
  })

  it('内訳比率の合計が100%でない場合は正規化して警告する', () => {
    const gp = { ...baseGlidepath(), risky_split: { dom_eq: 0.5, dev_eq: 0.5, em_eq: 0.5 } }
    const { warnings, W } = buildWeightMatrix(gp, 30, 12)
    expect(warnings.some((w) => w.includes('正規化'))).toBe(true)
    let s = 0
    for (let i = 0; i < 6; i++) s += W[i]
    expect(s).toBeCloseTo(1, 9)
  })

  it('年齢依存分割は逓減区間で内訳を補間する(FR-GP-04)', () => {
    const gp = { ...baseGlidepath(), split_mode: 'age_linked' as const }
    const wBegin = weightsAt(gp, 30)
    const wEnd = weightsAt(gp, 70)
    // 開始時点: risky_split(EM 15%)、終了時点: risky_split_end(EM 10%)
    expect(wBegin[2] / (wBegin[0] + wBegin[1] + wBegin[2])).toBeCloseTo(0.15, 6)
    expect(wEnd[2] / (wEnd[0] + wEnd[1] + wEnd[2])).toBeCloseTo(0.1, 6)
  })
})
