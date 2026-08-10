// 数値フォーマット(表示専用 — 計算値の丸め直しは行わず、表示時のみ整形する)

export function fmtYen(v: number): string {
  if (!Number.isFinite(v)) return '—'
  if (v < 0) return '−' + fmtYen(-v)
  if (v >= 1e8) {
    const x = v / 1e8
    const s = x >= 10 ? x.toFixed(1) : x.toFixed(2)
    return s.replace(/\.?0+$/, '') + '億円'
  }
  if (v >= 1e4) return Math.round(v / 1e4).toLocaleString('ja-JP') + '万円'
  return Math.round(v).toLocaleString('ja-JP') + '円'
}

/** 軸ラベル用の短縮表記(「円」なし) */
export function fmtYenAxis(v: number): string {
  if (v === 0) return '0'
  if (v < 0) return '−' + fmtYenAxis(-v)
  if (v >= 1e8) {
    const x = v / 1e8
    const s = x >= 10 ? x.toFixed(0) : x.toFixed(1)
    return s.replace(/\.0$/, '') + '億'
  }
  if (v >= 1e4) return Math.round(v / 1e4).toLocaleString('ja-JP') + '万'
  return Math.round(v).toLocaleString('ja-JP')
}

export function fmtPct(p: number, digits = 1): string {
  if (!Number.isFinite(p)) return '—'
  return (p * 100).toFixed(digits) + '%'
}

/** 符号付きポイント表記(確率差分など) */
export function fmtPt(p: number, digits = 1): string {
  if (!Number.isFinite(p)) return '—'
  const v = p * 100
  const sign = v > 0 ? '+' : v < 0 ? '−' : '±'
  return sign + Math.abs(v).toFixed(digits) + 'pt'
}

export function fmtAge(a: number): string {
  return (Number.isInteger(a) ? a.toString() : a.toFixed(1)) + '歳'
}

export function fmtNum(v: number): string {
  return v.toLocaleString('ja-JP')
}
