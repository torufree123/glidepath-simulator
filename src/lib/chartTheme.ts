// チャート配色 — dataviz 検証済みリファレンスパレット(light mode)
// カテゴリカルの並びは固定順(CVD安全性の仕組み)。循環・生成は行わない。

export const INK = '#0b0b0b'
export const INK2 = '#52514e'
export const MUTED = '#898781'
export const GRID = '#e1e0d9'
export const BASELINE = '#c3c2b7'
export const SURFACE = '#fcfcfb'

/** カテゴリカル・スロット(固定順) */
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'] as const

/** 資産クラス → スロット1..6(積み上げの隣接順に割当て) */
export const ASSET_COLORS = SERIES.slice(0, 6) as readonly string[]

/** 単一系列(ファンチャート等)の既定色 = スロット1 */
export const PRIMARY = SERIES[0]

/** 順序2段(目標以上/未満)— 同一ヒューの ordinal 2ステップ(250/450) */
export const SEQ_LIGHT = '#86b6ef'
export const SEQ_MAIN = '#2a78d6'

/** ダイバージング(トルネード): blue ↔ red、中立グレー */
export const DIV_POS = '#2a78d6'
export const DIV_NEG = '#e34948'
export const DIV_MID = '#f0efec'

export const STATUS = {
  good: '#0ca30c',
  goodText: '#006300',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
} as const

/** 目盛りの丸め(1-2-5系列) */
export function niceTicks(lo: number, hi: number, target = 5): number[] {
  if (!(hi > lo)) hi = lo + 1
  const span = hi - lo
  const step0 = Math.pow(10, Math.floor(Math.log10(span / target)))
  let step = step0
  for (const mul of [1, 2, 2.5, 5, 10]) {
    if (span / (step0 * mul) <= target) {
      step = step0 * mul
      break
    }
  }
  const start = Math.ceil(lo / step) * step
  const ticks: number[] = []
  for (let v = start; v <= hi + step * 1e-9; v += step) ticks.push(Math.abs(v) < step * 1e-9 ? 0 : v)
  return ticks
}
