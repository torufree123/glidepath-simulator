// 線形代数 — コレスキー分解と最近接正定値補正(6.3 / FR-CMA-02)

/** コレスキー分解(下三角 L, A = L·Lᵀ)。正定値でなければ null。 */
export function cholesky(a: number[][]): number[][] | null {
  const n = a.length
  const L: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0))
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = a[i][j]
      for (let k = 0; k < j; k++) sum -= L[i][k] * L[j][k]
      if (i === j) {
        if (sum <= 1e-12) return null
        L[i][j] = Math.sqrt(sum)
      } else {
        L[i][j] = sum / L[j][j]
      }
    }
  }
  return L
}

/** 対称行列の固有値分解(ヤコビ法)。values: 固有値, vectors: 列が固有ベクトル。 */
export function jacobiEigen(a: number[][]): { values: number[]; vectors: number[][] } {
  const n = a.length
  const A = a.map((row) => row.slice())
  const V: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  )
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] * A[i][j]
    if (off < 1e-22) break
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(A[p][q]) < 1e-15) continue
        const theta = (A[q][q] - A[p][p]) / (2 * A[p][q])
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
        const c = 1 / Math.sqrt(t * t + 1)
        const s = t * c
        for (let k = 0; k < n; k++) {
          const akp = A[k][p]
          const akq = A[k][q]
          A[k][p] = c * akp - s * akq
          A[k][q] = s * akp + c * akq
        }
        for (let k = 0; k < n; k++) {
          const apk = A[p][k]
          const aqk = A[q][k]
          A[p][k] = c * apk - s * aqk
          A[q][k] = s * apk + c * aqk
        }
        for (let k = 0; k < n; k++) {
          const vkp = V[k][p]
          const vkq = V[k][q]
          V[k][p] = c * vkp - s * vkq
          V[k][q] = s * vkp + c * vkq
        }
      }
    }
  }
  return { values: A.map((_, i) => A[i][i]), vectors: V }
}

/**
 * 相関行列の最近接正定値補正(FR-CMA-02)。
 * 固有値を下限クリップして再構成し、対角を1に再スケールする(Higham法の簡易版)。
 * corrected: 補正を実施したかどうか(警告として記録される)。
 */
export function ensurePositiveDefiniteCorr(corr: number[][]): {
  corr: number[][]
  corrected: boolean
} {
  if (cholesky(corr)) return { corr, corrected: false }
  const n = corr.length
  const { values, vectors } = jacobiEigen(corr)
  const clipped = values.map((v) => Math.max(v, 1e-6))
  // B = V · diag(clipped) · Vᵀ
  const B: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0))
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let sum = 0
      for (let k = 0; k < n; k++) sum += vectors[i][k] * clipped[k] * vectors[j][k]
      B[i][j] = sum
    }
  }
  // 相関行列へ再スケール(対角=1、対称化)
  const d = B.map((_, i) => Math.sqrt(B[i][i]))
  const R: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0))
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      R[i][j] = i === j ? 1 : B[i][j] / (d[i] * d[j])
    }
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const m = (R[i][j] + R[j][i]) / 2
      R[i][j] = m
      R[j][i] = m
    }
  }
  return { corr: R, corrected: true }
}
