// 既存商品グライドパスの CSV インポート(FR-GP-05)
// 形式: 先頭列 age(年齢)または years_to_target(残存年数)、
//       続く列は資産クラス別ウェイト(キー名または日本語名)

import type { AssetKey } from '../engine/types'
import { ASSET_KEYS, ASSET_LABELS } from '../engine/types'

const HEADER_ALIASES: Record<string, AssetKey> = {
  dom_eq: 'dom_eq', 国内株式: 'dom_eq',
  dev_eq: 'dev_eq', 先進国株式: 'dev_eq', 外国株式: 'dev_eq',
  em_eq: 'em_eq', 新興国株式: 'em_eq',
  dom_bond: 'dom_bond', 国内債券: 'dom_bond',
  for_bond: 'for_bond', 外国債券: 'for_bond', 先進国債券: 'for_bond',
  cash: 'cash', 短期資産: 'cash', 現金: 'cash',
}

export interface ParsedGlidepathCsv {
  mode: 'age' | 'ytt'
  rows: { t: number; weights: Record<AssetKey, number> }[]
  warnings: string[]
}

export function parseGlidepathCsv(text: string): ParsedGlidepathCsv | { error: string } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  if (lines.length < 2) return { error: 'データ行がありません(ヘッダー行+1行以上が必要です)' }

  const header = lines[0].split(/[,\t]/).map((h) => h.trim())
  const first = header[0].toLowerCase()
  let mode: 'age' | 'ytt'
  if (first === 'age' || header[0] === '年齢') mode = 'age'
  else if (first === 'years_to_target' || header[0] === '残存年数') mode = 'ytt'
  else return { error: `先頭列は age(年齢)または years_to_target(残存年数)としてください(現在: "${header[0]}")` }

  const colMap: (AssetKey | null)[] = header.slice(1).map((h) => HEADER_ALIASES[h] ?? HEADER_ALIASES[h.toLowerCase()] ?? null)
  const mapped = colMap.filter((c) => c !== null)
  if (mapped.length < 2) {
    return {
      error: `資産クラス列を認識できません。列名は ${ASSET_KEYS.map((k) => `${ASSET_LABELS[k]}(${k})`).join(', ')} を使用してください`,
    }
  }

  const warnings: string[] = []
  const rows: { t: number; weights: Record<AssetKey, number> }[] = []
  for (let li = 1; li < lines.length; li++) {
    const cells = lines[li].split(/[,\t]/).map((c) => c.trim())
    const t = Number(cells[0])
    if (!Number.isFinite(t)) return { error: `${li + 1}行目: 先頭列が数値ではありません("${cells[0]}")` }
    const weights = { dom_eq: 0, dev_eq: 0, em_eq: 0, dom_bond: 0, for_bond: 0, cash: 0 }
    let sum = 0
    colMap.forEach((key, ci) => {
      if (!key) return
      const v = Number(cells[ci + 1] ?? 0)
      if (Number.isFinite(v)) {
        weights[key] += v
        sum += v
      }
    })
    if (sum <= 0) return { error: `${li + 1}行目: ウェイトの合計が0です` }
    // %表記(合計≈100)なら小数へ変換
    if (sum > 1.5) {
      for (const k of ASSET_KEYS) weights[k] /= 100
      sum /= 100
    }
    if (Math.abs(sum - 1) > 0.02) {
      warnings.push(`${li + 1}行目: ウェイト合計が${(sum * 100).toFixed(1)}%のため100%に正規化しました`)
    }
    for (const k of ASSET_KEYS) weights[k] /= sum
    rows.push({ t, weights })
  }
  rows.sort((a, b) => a.t - b.t)
  return { mode, rows, warnings }
}

export const SAMPLE_CSV = `age,国内株式,先進国株式,新興国株式,国内債券,外国債券,短期資産
30,0.30,0.42,0.13,0.09,0.04,0.02
40,0.30,0.42,0.13,0.09,0.04,0.02
50,0.23,0.32,0.10,0.21,0.09,0.05
60,0.12,0.18,0.05,0.39,0.16,0.10
70,0.12,0.18,0.05,0.39,0.16,0.10
`
