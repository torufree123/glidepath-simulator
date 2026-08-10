// 決定論的モンテカルロ・エンジン(仕様書 6章 / FR-SIM / FR-OUT)
//
// - 多変量対数正規(コレスキー分解による相関付与)の月次シミュレーション(6.3)
// - 毎月リバランス(目標配分一致)/ 乖離バンド方式(FR-SIM-03)
// - 複数バリアントを同一乱数系列(CRN)で同時評価(FR-OUT-07 / FR-CMP-01)
// - ストレスオーバーレイ: 指定時点に株式クラスへ決定論的ショック(FR-OUT-06)

import { PCG32 } from './rng'
import { cholesky, ensurePositiveDefiniteCorr } from './linalg'
import { buildWeightMatrix } from './glidepath'
import type {
  AssumptionsEcho,
  CMASet,
  DistStats,
  PercentileSeries,
  SimulationRequest,
  SimulationResult,
  VariantResult,
} from './types'
import { DISCLAIMER_ID, ENGINE_VERSION } from './types'

const TAX_RATE = 0.20315 // 受取時の評価益への簡易一律課税(FR-SIM-05)

// ---------------------------------------------------------------- ユーティリティ

function quantileSorted(sorted: Float64Array, q: number): number {
  const n = sorted.length
  if (n === 0) return NaN
  const idx = q * (n - 1)
  const lo = Math.floor(idx)
  const hi = Math.min(n - 1, lo + 1)
  const frac = idx - lo
  return sorted[lo] * (1 - frac) + sorted[hi] * frac
}

function cvar05Sorted(sorted: Float64Array): number {
  const m = Math.max(1, Math.round(sorted.length * 0.05))
  let s = 0
  for (let i = 0; i < m; i++) s += sorted[i]
  return s / m
}

function distStats(values: Float64Array): { stats: DistStats; sorted: Float64Array } {
  const sorted = values.slice()
  sorted.sort()
  let sum = 0
  for (let i = 0; i < sorted.length; i++) sum += sorted[i]
  return {
    stats: {
      mean: sum / sorted.length,
      median: quantileSorted(sorted, 0.5),
      p05: quantileSorted(sorted, 0.05),
      p25: quantileSorted(sorted, 0.25),
      p75: quantileSorted(sorted, 0.75),
      p95: quantileSorted(sorted, 0.95),
      cvar05: cvar05Sorted(sorted),
    },
    sorted,
  }
}

/** CMA準備: 月次対数リターンの平均ベクトル m と、スケール済み下三角 S·L(6.3) */
export function prepareCma(cmaSet: CMASet): {
  m: Float64Array
  SL: Float64Array // 36要素フラット(行優先、下三角)
  geoRets: number[]
  psdCorrected: boolean
  conversionNote: string | null
} {
  const geoRets = cmaSet.assets.map((a) => {
    if (a.ret_type === 'geometric') return a.ret
    // 算術→幾何: g = (1 + μ)·exp(−σ²/2) − 1(6.3 の対数正規整合変換)
    return (1 + a.ret) * Math.exp((-a.vol * a.vol) / 2) - 1
  })
  const hasArith = cmaSet.assets.some((a) => a.ret_type === 'arithmetic')
  const conversionNote = hasArith
    ? '算術期待リターンに g = (1+μ)·exp(−σ²/2) − 1 の対数正規整合変換を適用'
    : null

  const { corr, corrected } = ensurePositiveDefiniteCorr(cmaSet.corr)
  const L = cholesky(corr)
  if (!L) throw new Error('相関行列のコレスキー分解に失敗しました(補正後も非正定値)')

  const m = new Float64Array(6)
  const SL = new Float64Array(36)
  for (let i = 0; i < 6; i++) {
    m[i] = Math.log(1 + geoRets[i]) / 12
    const sMonthly = cmaSet.assets[i].vol / Math.sqrt(12)
    for (let j = 0; j <= i; j++) SL[i * 6 + j] = sMonthly * L[i][j]
  }
  return { m, SL, geoRets, psdCorrected: corrected, conversionNote }
}

// ---------------------------------------------------------------- バリアント状態

interface VariantState {
  V: Float64Array
  basis: Float64Array | null
  ruinM: Int32Array
  termV: Float64Array
  peak: Float64Array
  maxDD: Float64Array
  wPeak: Float64Array
  wMaxDD: Float64Array
  assetBal: Float64Array | null // band リバランス時のみ
}

function newState(n: number, v0: number, useTax: boolean, band: boolean, w0: Float64Array | null): VariantState {
  const st: VariantState = {
    V: new Float64Array(n).fill(v0),
    basis: useTax ? new Float64Array(n).fill(v0) : null,
    ruinM: new Int32Array(n).fill(-1),
    termV: new Float64Array(n).fill(v0),
    peak: new Float64Array(n).fill(v0),
    maxDD: new Float64Array(n),
    wPeak: new Float64Array(n),
    wMaxDD: new Float64Array(n),
    assetBal: band ? new Float64Array(n * 6) : null,
  }
  if (band && st.assetBal && w0) {
    for (let p = 0; p < n; p++) {
      for (let i = 0; i < 6; i++) st.assetBal[p * 6 + i] = v0 * w0[i]
    }
  }
  return st
}

// ---------------------------------------------------------------- メイン

export function runSimulation(
  req: SimulationRequest,
  onProgress?: (pct: number) => void,
): SimulationResult {
  const t0 = performance.now()
  const { person, cashflow, goal, stress } = req
  const a0 = person.current_age

  if (!(person.end_age > person.current_age)) throw new Error('評価終了年齢は現在年齢より大きく設定してください')
  if (!(person.target_age >= person.current_age && person.target_age <= person.end_age))
    throw new Error('ターゲット年齢は現在年齢〜評価終了年齢の範囲で設定してください')
  if (req.variants.length === 0) throw new Error('評価対象の設定がありません')

  const T = Math.round((person.end_age - a0) * 12)
  const targetM = Math.round((person.target_age - a0) * 12)
  const N = req.preview
    ? Math.max(500, Math.min(req.engine.n_paths, 100000))
    : Math.max(1000, Math.min(req.engine.n_paths, 100000)) // FR-SIM-01 設定範囲
  const K = req.variants.length
  const band = req.engine.rebalance === 'band'
  const bandPct = Math.max(0.005, req.engine.band_pct)
  const useTax = req.tax_mode === 'simple_tax'

  // --- CMA
  const { m, SL, geoRets, psdCorrected, conversionNote } = prepareCma(req.cma)
  const globalWarnings: string[] = []
  if (psdCorrected)
    globalWarnings.push('相関行列が正定値でないため、最近接正定値行列へ補正して計算しました(FR-CMA-02)')

  // --- ウェイト行列(バリアント別)+ 検証警告
  const weightMatrices: Float64Array[] = []
  const variantWarnings: string[][] = []
  for (const v of req.variants) {
    const { W, warnings } = buildWeightMatrix(v.glidepath, a0, T)
    weightMatrices.push(W)
    variantWarnings.push(warnings)
  }

  // --- キャッシュフロー(月次配列)
  const infl = req.inflation_annual
  const defl = new Float64Array(T + 1)
  for (let t = 0; t <= T; t++) defl[t] = Math.pow(1 + infl, t / 12)

  const contribStartM = Math.round((cashflow.contribution_start_age - a0) * 12)
  const contribEndM = Math.round((cashflow.contribution_end_age - a0) * 12)
  const wdStartM = Math.round((cashflow.withdrawal.start_age - a0) * 12)
  const periodEndM = Math.round((cashflow.withdrawal.period_end_age - a0) * 12)
  const bonusSet = new Set(cashflow.bonus_months.map((mn) => ((mn - 1) % 12 + 12) % 12))

  const buildContrib = (monthly: number): Float64Array => {
    const arr = new Float64Array(T)
    for (let t = 0; t < T; t++) {
      if (t < contribStartM || t >= contribEndM) continue
      const grown = monthly * Math.pow(1 + cashflow.contribution_growth_annual, Math.floor(t / 12))
      arr[t] = grown + (bonusSet.has(t % 12) ? cashflow.bonus_amount : 0)
    }
    return arr
  }
  const contribBase = buildContrib(cashflow.monthly_contribution)
  const contribArr: Float64Array[] = req.variants.map((v) =>
    v.cashflow_override?.monthly_contribution !== undefined
      ? buildContrib(v.cashflow_override.monthly_contribution)
      : contribBase,
  )

  const eventArr = new Float64Array(T)
  for (const ev of cashflow.events) {
    const tm = Math.round((ev.age - a0) * 12)
    if (tm >= 0 && tm < T) eventArr[tm] += ev.amount
    else globalWarnings.push(`イベント「${ev.label || '無題'}」(${ev.age}歳)は評価期間外のため無視されました`)
  }

  // 拠出上限チェック(FR-CF-02: 超過は警告、エラーとしない)
  const cap = cashflow.contribution_cap ?? null
  const capExceeded = !!(cap && cap.monthly_limit !== null && cashflow.monthly_contribution > cap.monthly_limit)
  if (cap && capExceeded)
    globalWarnings.push(
      `月額拠出 ${cashflow.monthly_contribution.toLocaleString()}円 が拠出上限テンプレート「${cap.label}」の上限 ${cap.monthly_limit!.toLocaleString()}円/月 を超えています`,
    )

  const wdMode = cashflow.withdrawal.mode
  const wdRateM = cashflow.withdrawal.rate_annual / 12
  const stressEnabled = stress.enabled
  const shockM = targetM - Math.round(stress.years_before_target * 12)
  if (stressEnabled && (shockM < 0 || shockM >= T))
    globalWarnings.push('ストレスショックの時点が評価期間外のため、ショックは適用されていません')

  // --- 状態の確保
  const w0OfVariant = (k: number) => weightMatrices[k].subarray(0, 6)
  const states: VariantState[] = []
  const stressStates: (VariantState | null)[] = []
  for (let k = 0; k < K; k++) {
    states.push(newState(N, cashflow.initial_balance, useTax, band, band ? w0OfVariant(k) : null))
    stressStates.push(
      stressEnabled ? newState(N, cashflow.initial_balance, useTax, band, band ? w0OfVariant(k) : null) : null,
    )
  }

  // --- パーセンタイル系列(FR-OUT-01)
  const sampleEvery = N > 20000 ? 3 : 1
  const pctSeries: (PercentileSeries | null)[] = req.variants.map((v) =>
    v.want_percentiles !== false
      ? { ages: [a0], p05: [cashflow.initial_balance], p25: [cashflow.initial_balance], p50: [cashflow.initial_balance], p75: [cashflow.initial_balance], p95: [cashflow.initial_balance] }
      : null,
  )
  const scratch = new Float64Array(N)

  // --- 乱数・リターンバッファ
  const rng = new PCG32(req.engine.seed)
  const z = new Float64Array(6)
  const rBuf = new Float64Array(N * 6)
  const winStart = Math.max(0, targetM - 60) // ターゲット直前5年ウィンドウ(FR-OUT-04)

  const progressEvery = Math.max(1, Math.floor(T / 40))

  // ---------------------------------------------------------------- 月次ループ
  for (let t = 0; t < T; t++) {
    // 1) 相関付き月次リターンを全パス分生成(全バリアント共有 = CRN)
    for (let p = 0; p < N; p++) {
      for (let i = 0; i < 6; i++) z[i] = rng.nextNormal()
      const off = p * 6
      for (let i = 0; i < 6; i++) {
        let acc = m[i]
        const row = i * 6
        for (let j = 0; j <= i; j++) acc += SL[row + j] * z[j]
        rBuf[off + i] = Math.expm1(acc) // 月次単純リターン r = exp(ℓ) − 1
      }
    }

    const isShockMonth = stressEnabled && t === shockM
    const shockMul = 1 + stress.equity_shock_pct
    const wdActive = t >= wdStartM
    const ev = eventArr[t]
    const remaining = periodEndM - t
    const inWindow = t + 1 >= winStart && t + 1 <= targetM
    const isTargetMonth = t + 1 === targetM

    // 2) バリアント別に残高を更新
    for (let k = 0; k < K; k++) {
      const W = weightMatrices[k]
      const wOff = t * 6
      const kappa = Math.pow(1 - req.variants[k].costs.expense_ratio_annual, 1 / 12)
      const F = req.variants[k].costs.fixed_fee_monthly
      const c = contribArr[k][t]
      const wdNetBase =
        wdMode === 'fixed_nominal'
          ? cashflow.withdrawal.monthly_amount
          : wdMode === 'fixed_real'
            ? cashflow.withdrawal.monthly_amount * defl[t]
            : 0

      const advance = (st: VariantState, p: number, R: number, rOff: number, shocked: boolean, trackRisk: boolean) => {
        if (st.ruinM[p] >= 0) {
          if (isTargetMonth) st.termV[p] = 0
          return
        }
        let v = st.V[p]
        let b = st.basis ? st.basis[p] : 0
        // 拠出(積立期)・一時金イベント(FR-CF-04)
        if (c > 0) {
          v += c
          b += c
        }
        if (ev !== 0) {
          if (ev > 0) {
            v += ev
            b += ev
          } else if (v > 0) {
            const gross = Math.min(v, -ev)
            b -= b * (gross / v)
            v -= gross
          }
        }
        // 取り崩し(FR-CF-03)。簡易課税は受取額を確保するグロスアップ(FR-SIM-05)
        if (wdActive && v > 0) {
          let gross = 0
          if (wdMode === 'fixed_nominal' || wdMode === 'fixed_real') {
            let g = wdNetBase
            if (st.basis && v > b) {
              const gainFrac = (v - b) / v
              g = wdNetBase / (1 - TAX_RATE * gainFrac)
            }
            gross = Math.min(v, g)
          } else if (wdMode === 'rate') {
            gross = v * wdRateM
          } else {
            gross = remaining > 0 ? v / remaining : 0
          }
          if (gross > 0) {
            b -= b * (gross / v)
            v -= gross
          }
        }
        let ruined = false
        if (v <= 1e-9 && wdActive) {
          ruined = true
          v = 0
        } else {
          // 資産推移の再帰式(6.4): V' = (V ± CF)·(1+R)·κ − F_fix
          if (st.assetBal) {
            // band リバランス: 資産クラス別残高を個別追跡(FR-SIM-03)
            const bal = st.assetBal
            const off6 = p * 6
            let tot = 0
            for (let i = 0; i < 6; i++) tot += bal[off6 + i]
            const delta = v - tot // 当月の純フロー(拠出・イベント・取り崩し)
            if (delta >= 0) {
              // 純流入は目標配分で買付
              for (let i = 0; i < 6; i++) bal[off6 + i] += delta * W[wOff + i]
            } else if (tot > 0) {
              // 純流出は保有比率に応じて按分売却
              const scale = Math.max(0, v / tot)
              for (let i = 0; i < 6; i++) bal[off6 + i] *= scale
            }
            let nv = 0
            for (let i = 0; i < 6; i++) {
              let bi = bal[off6 + i]
              let r = rBuf[rOff + i]
              if (shocked && i < 3) r = (1 + r) * shockMul - 1
              bi *= (1 + r) * kappa
              bal[off6 + i] = bi
              nv += bi
            }
            if (F > 0 && nv > 0) {
              const scale = Math.max(0, (nv - F) / nv)
              for (let i = 0; i < 6; i++) bal[off6 + i] *= scale
              nv = Math.max(0, nv - F)
            }
            // 乖離バンド超過時のみ目標配分へ一致
            if (nv > 0) {
              let maxDev = 0
              for (let i = 0; i < 6; i++) {
                const dev = Math.abs(bal[off6 + i] / nv - W[wOff + i])
                if (dev > maxDev) maxDev = dev
              }
              if (maxDev > bandPct) {
                for (let i = 0; i < 6; i++) bal[off6 + i] = nv * W[wOff + i]
              }
            }
            v = nv
          } else {
            v = v * (1 + R) * kappa - F
          }
          if (v <= 0) {
            v = 0
            if (wdActive) ruined = true
          }
        }
        if (ruined) {
          st.ruinM[p] = t
          if (trackRisk) {
            st.maxDD[p] = 1
            if (inWindow) st.wMaxDD[p] = 1
          }
        }
        if (trackRisk && !ruined) {
          // パス別最大ドローダウン(6.6)
          if (v > st.peak[p]) st.peak[p] = v
          else if (st.peak[p] > 0) {
            const dd = 1 - v / st.peak[p]
            if (dd > st.maxDD[p]) st.maxDD[p] = dd
          }
          if (inWindow) {
            if (v > st.wPeak[p]) st.wPeak[p] = v
            else if (st.wPeak[p] > 0) {
              const dd = 1 - v / st.wPeak[p]
              if (dd > st.wMaxDD[p]) st.wMaxDD[p] = dd
            }
          }
        }
        if (isTargetMonth) st.termV[p] = v
        st.V[p] = v
        if (st.basis) st.basis[p] = Math.max(0, b)
      }

      const st = states[k]
      const sst = stressStates[k]
      for (let p = 0; p < N; p++) {
        const rOff = p * 6
        let R = 0
        for (let i = 0; i < 6; i++) R += W[wOff + i] * rBuf[rOff + i]
        advance(st, p, R, rOff, false, true)
        if (sst) {
          let Rs = R
          if (isShockMonth) {
            Rs = 0
            for (let i = 0; i < 6; i++) {
              let r = rBuf[rOff + i]
              if (i < 3) r = (1 + r) * shockMul - 1 // 株式クラスへ決定論的ショック
              Rs += W[wOff + i] * r
            }
          }
          advance(sst, p, Rs, rOff, isShockMonth, false)
        }
      }

      // 3) パーセンタイル系列のサンプリング
      const ps = pctSeries[k]
      if (ps && ((t + 1) % sampleEvery === 0 || t + 1 === T || isTargetMonth)) {
        scratch.set(states[k].V)
        scratch.sort()
        ps.ages.push(a0 + (t + 1) / 12)
        ps.p05.push(quantileSorted(scratch, 0.05))
        ps.p25.push(quantileSorted(scratch, 0.25))
        ps.p50.push(quantileSorted(scratch, 0.5))
        ps.p75.push(quantileSorted(scratch, 0.75))
        ps.p95.push(quantileSorted(scratch, 0.95))
      }
    }

    if (onProgress && t % progressEvery === 0) onProgress(Math.round((t / T) * 95))
  }

  // ---------------------------------------------------------------- 指標算出(6.6)
  const G = goal.target_amount_at_target_age
  const deflTarget = defl[targetM]

  const variants: VariantResult[] = req.variants.map((vspec, k) => {
    const st = states[k]
    const { stats: term, sorted: sortedTerm } = distStats(st.termV)

    let successCount = 0
    let sfSum = 0
    for (let p = 0; p < N; p++) {
      if (st.termV[p] >= G) successCount++
      else sfSum += G - st.termV[p]
    }
    const successProb = successCount / N
    const successSe = Math.sqrt((successProb * (1 - successProb)) / N)

    // ヒストグラム(ターゲット時点の最終資産)
    const histHi = Math.max(quantileSorted(sortedTerm, 0.995), G * 1.05, 1)
    const nBins = 36
    const binW = histHi / nBins
    const edges = Array.from({ length: nBins + 1 }, (_, i) => i * binW)
    const counts = new Array<number>(nBins).fill(0)
    for (let p = 0; p < N; p++) {
      const idx = Math.min(nBins - 1, Math.floor(st.termV[p] / binW))
      counts[idx]++
    }

    // 枯渇(ルイン)関連(FR-OUT-05)
    const ruinAges: number[] = []
    for (let p = 0; p < N; p++) if (st.ruinM[p] >= 0) ruinAges.push(a0 + st.ruinM[p] / 12)
    ruinAges.sort((x, y) => x - y)
    const ruinProbAt = (age: number) => {
      const mLimit = Math.round((age - a0) * 12)
      let cnt = 0
      for (let p = 0; p < N; p++) if (st.ruinM[p] >= 0 && st.ruinM[p] <= mLimit) cnt++
      return cnt / N
    }
    const checkAges = [80, 85, 90, 95].filter((x) => x > person.current_age && x <= person.end_age)
    const curveAges: number[] = []
    const curveProbs: number[] = []
    const curveFrom = Math.max(Math.floor(cashflow.withdrawal.start_age), Math.ceil(a0))
    if (wdStartM < T) {
      for (let age = curveFrom; age <= person.end_age; age++) {
        curveAges.push(age)
        curveProbs.push(ruinProbAt(age))
      }
    }
    const qArr = (arr: number[], q: number): number | null => {
      if (arr.length === 0) return null
      const idx = q * (arr.length - 1)
      const lo = Math.floor(idx)
      const hi = Math.min(arr.length - 1, lo + 1)
      return arr[lo] * (1 - (idx - lo)) + arr[hi] * (idx - lo)
    }

    // ドローダウン分布(FR-OUT-04)
    const ddSorted = st.maxDD.slice()
    ddSorted.sort()
    const wddSorted = st.wMaxDD.slice()
    wddSorted.sort()

    // ストレスオーバーレイ(FR-OUT-06)
    let stressMetrics
    const sst = stressStates[k]
    if (sst) {
      let sCnt = 0
      for (let p = 0; p < N; p++) if (sst.termV[p] >= G) sCnt++
      const sTermSorted = sst.termV.slice()
      sTermSorted.sort()
      let sRuinEnd = 0
      for (let p = 0; p < N; p++) if (sst.ruinM[p] >= 0) sRuinEnd++
      stressMetrics = {
        success_prob: sCnt / N,
        success_delta: sCnt / N - successProb,
        terminal_median: quantileSorted(sTermSorted, 0.5),
        ruin_prob_end: sRuinEnd / N,
      }
    }

    let ruinEnd = 0
    for (let p = 0; p < N; p++) if (st.ruinM[p] >= 0) ruinEnd++

    return {
      id: vspec.id,
      label: vspec.label,
      percentiles: pctSeries[k] ?? undefined,
      costs: vspec.costs,
      warnings: variantWarnings[k],
      terminal_hist: { edges, counts },
      metrics: {
        success_prob: successProb,
        success_se: successSe,
        shortfall_prob: 1 - successProb,
        expected_shortfall: sfSum / N,
        terminal: term,
        terminal_real_median: term.median / deflTarget,
        terminal_real_cvar05: term.cvar05 / deflTarget,
        ruin_prob_by_age: checkAges.map((age) => ({ age, prob: ruinProbAt(age) })),
        ruin_prob_end: ruinEnd / N,
        ruin_curve: { ages: curveAges, probs: curveProbs },
        asset_life: {
          ruined_pct: ruinAges.length / N,
          p25: qArr(ruinAges, 0.25),
          p50: qArr(ruinAges, 0.5),
          p75: qArr(ruinAges, 0.75),
        },
        max_drawdown: {
          p50: quantileSorted(ddSorted, 0.5),
          p75: quantileSorted(ddSorted, 0.75),
          p95: quantileSorted(ddSorted, 0.95),
        },
        pre_target_drawdown: {
          p50: quantileSorted(wddSorted, 0.5),
          p95: quantileSorted(wddSorted, 0.95),
        },
        stress: stressMetrics,
      },
    }
  })

  const wdLabels: Record<string, string> = {
    fixed_nominal: '定額(名目固定)',
    fixed_real: '定額(実質固定・インフレ連動)',
    rate: '定率(残高×年率)',
    period: '期間指定(残存期間で均等割)',
  }
  const assumptions: AssumptionsEcho = {
    cma: {
      id: req.cma.id,
      version: req.cma.version,
      label: req.cma.label,
      source: req.cma.source,
      created_at: req.cma.created_at,
      return_conversion: conversionNote,
      psd_corrected: psdCorrected,
      assets: req.cma.assets.map((a, i) => ({
        name: a.name,
        ret_geo: geoRets[i],
        ret_input: a.ret,
        ret_type: a.ret_type === 'geometric' ? '幾何' : '算術',
        vol: a.vol,
      })),
    },
    inflation_annual: infl,
    tax_mode: req.tax_mode,
    tax_mode_label:
      req.tax_mode === 'tax_free'
        ? '非課税(DC/NISA想定)'
        : `受取時に評価益へ一律${(TAX_RATE * 100).toFixed(3)}%課税(簡易近似・受取額確保のグロスアップ方式)`,
    timeline: { current_age: a0, target_age: person.target_age, end_age: person.end_age, months: T },
    engine: {
      n_paths: N,
      seed: req.engine.seed,
      rebalance: req.engine.rebalance,
      band_pct: bandPct,
      rng: 'PCG32(XSH-RR, 64bit状態)',
    },
    goal_amount: G,
    contribution_cap: cap ? { ...cap, exceeded: capExceeded } : null,
    withdrawal_note: `${wdLabels[wdMode]} / 開始 ${cashflow.withdrawal.start_age}歳`,
    stress: { ...stress },
  }

  onProgress?.(100)
  const runId = `gp-run-${Date.now().toString(36)}-${Math.floor(Math.random() * 1679616).toString(36).padStart(4, '0')}`

  return {
    run_id: runId,
    engine_version: ENGINE_VERSION,
    cma_id: req.cma.id,
    cma_version: req.cma.version,
    seed: req.engine.seed,
    n_paths: N,
    months: T,
    preview: !!req.preview,
    variants,
    warnings: globalWarnings,
    assumptions_echo: assumptions,
    disclaimer_id: DISCLAIMER_ID,
    timing_ms: Math.round(performance.now() - t0),
    created_at: new Date().toISOString(),
  }
}
