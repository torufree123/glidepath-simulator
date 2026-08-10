import { describe, expect, it } from 'vitest'
import { cholesky, ensurePositiveDefiniteCorr, jacobiEigen } from '../linalg'
import { BUILTIN_CMA_SETS } from '../presets'

describe('コレスキー分解(6.3)', () => {
  it('L·Lᵀ = A を再構成できる', () => {
    const A = [
      [1, 0.5, 0.3],
      [0.5, 1, 0.2],
      [0.3, 0.2, 1],
    ]
    const L = cholesky(A)!
    expect(L).not.toBeNull()
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        let s = 0
        for (let k = 0; k < 3; k++) s += L[i][k] * L[j][k]
        expect(s).toBeCloseTo(A[i][j], 10)
      }
    }
  })

  it('非正定値行列では null を返す', () => {
    const bad = [
      [1, 0.99, -0.99],
      [0.99, 1, 0.99],
      [-0.99, 0.99, 1],
    ]
    expect(cholesky(bad)).toBeNull()
  })

  it('組み込みCMAセットの相関行列はすべて正定値(補正不要)', () => {
    for (const set of BUILTIN_CMA_SETS) {
      expect(cholesky(set.corr), `${set.id} の相関行列`).not.toBeNull()
    }
  })
})

describe('最近接正定値補正(FR-CMA-02)', () => {
  it('非正定値行列を正定値な相関行列へ補正し、補正フラグを立てる', () => {
    const bad = [
      [1, 0.99, -0.99],
      [0.99, 1, 0.99],
      [-0.99, 0.99, 1],
    ]
    const { corr, corrected } = ensurePositiveDefiniteCorr(bad)
    expect(corrected).toBe(true)
    expect(cholesky(corr)).not.toBeNull()
    for (let i = 0; i < 3; i++) {
      expect(corr[i][i]).toBeCloseTo(1, 8)
      for (let j = 0; j < 3; j++) {
        expect(corr[i][j]).toBeCloseTo(corr[j][i], 8)
        expect(Math.abs(corr[i][j])).toBeLessThanOrEqual(1 + 1e-8)
      }
    }
  })

  it('正定値行列はそのまま返す(補正なし)', () => {
    const good = [
      [1, 0.3],
      [0.3, 1],
    ]
    const { corr, corrected } = ensurePositiveDefiniteCorr(good)
    expect(corrected).toBe(false)
    expect(corr).toBe(good)
  })

  it('ヤコビ法の固有値分解が対称行列を再構成できる', () => {
    const A = [
      [2, 0.5, 0.1],
      [0.5, 1.5, -0.2],
      [0.1, -0.2, 1],
    ]
    const { values, vectors } = jacobiEigen(A)
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        let s = 0
        for (let k = 0; k < 3; k++) s += vectors[i][k] * values[k] * vectors[j][k]
        expect(s).toBeCloseTo(A[i][j], 6)
      }
    }
  })
})
