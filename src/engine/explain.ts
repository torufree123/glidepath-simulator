// 説明生成層(FR-EXP-01〜03)+ 表現ガードレール(CP-01 / CP-02 / G2)
//
// v0.1 は決定論的テンプレートによる生成。数値はエンジン出力JSONからの
// テンプレート差し込みのみで、生成側での計算・丸め直しは行わない(FR-EXP-01)。
// LLM接続時も本モジュールと同じ入出力契約(エンジン出力JSONのみを根拠、
// 禁止辞書+ガードレール検査、遮断時は定型文フォールバック)を用いる。

import type { SimulationResult } from './types'
import { fmtYen, fmtPct, fmtPt, fmtNum } from '../lib/format'

export type ExplainLevel = 'basic' | 'expert'

export interface ExplanationOutput {
  text: string
  blocked: boolean
  matched: string | null
  guardrail_id: 'G2'
}

/** 禁止辞書(断定的判断・推奨・元本保証等 — CP-01/CP-02)。否定表現の免責文は許容する。 */
const FORBIDDEN_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /必ず/, label: '必ず' },
  { re: /絶対/, label: '絶対' },
  { re: /確実/, label: '確実' },
  { re: /元本保証/, label: '元本保証' },
  { re: /保証(?!するものではありません|はありません|しません|いたしません|されません|するものではなく)/, label: '保証(肯定文)' },
  { re: /損(を|は)?(しない|しません)/, label: '損をしない' },
  { re: /(おすすめ|オススメ|お勧め|お薦め)/, label: 'おすすめ' },
  { re: /推奨/, label: '推奨' },
  { re: /(買う|購入す|売る|乗り換える)べき/, label: '売買指示' },
  { re: /最適です/, label: '最適(断定)' },
]

export function checkForbidden(text: string): string | null {
  for (const p of FORBIDDEN_PATTERNS) {
    if (p.re.test(text)) return p.label
  }
  return null
}

const FALLBACK_TEXT =
  'シミュレーション結果の要約文は表示できません(表現ガードレールにより定型文へ置き換えられました)。' +
  '画面上の数値および前提条件を直接ご確認ください。'

/** エンジン出力JSONのみを根拠として説明文を生成する(FR-EXP-01) */
export function generateExplanation(result: SimulationResult, level: ExplainLevel): ExplanationOutput {
  const v = result.variants[0]
  if (!v) return { text: FALLBACK_TEXT, blocked: true, matched: null, guardrail_id: 'G2' }
  const mt = v.metrics
  const a = result.assumptions_echo
  const tl = a.timeline
  const hasWd = mt.ruin_curve.ages.length > 0
  const st = mt.stress

  let text: string
  if (level === 'basic') {
    const parts: string[] = []
    parts.push(
      `${tl.current_age}歳から${tl.target_age}歳に向けた運用を、${fmtNum(result.n_paths)}通りの市場シナリオで試算しました。`,
    )
    parts.push(
      `${tl.target_age}歳時点の資産額は中央値でおよそ${fmtYen(mt.terminal.median)}となり、シナリオ全体の${fmtPct(mt.success_prob)}で目標額${fmtYen(a.goal_amount)}を上回りました。`,
    )
    parts.push(
      `一方、下回るシナリオも${fmtPct(mt.shortfall_prob)}あり、成績が下位5%に入る厳しい市場環境では平均およそ${fmtYen(mt.terminal.cvar05)}にとどまりました。結果には幅がある点にご留意ください。`,
    )
    if (hasWd) {
      parts.push(
        `取り崩し期については、${tl.end_age}歳までに資産が尽きたシナリオの割合は${fmtPct(mt.ruin_prob_end)}でした。`,
      )
    }
    if (st) {
      parts.push(
        `ターゲットの${a.stress.years_before_target}年前に株式が${fmtPct(Math.abs(a.stress.equity_shock_pct), 0)}下落する状況を重ねた試算では、目標を上回る割合は${fmtPct(st.success_prob)}(${fmtPt(st.success_delta)})に変化しました。退職直前の下落が結果に与える影響(収益率配列リスク)を確認するためのものです。`,
      )
    }
    parts.push(
      '本試算は一定の前提に基づく計算結果であり、将来の運用成果を示すものではありません。前提条件と免責事項もあわせてご確認ください。',
    )
    text = parts.join('')
  } else {
    const parts: string[] = []
    parts.push(
      `モンテカルロ試算(N=${fmtNum(result.n_paths)}、シード${result.seed}、月次・多変量対数正規、毎月リバランス${a.engine.rebalance === 'band' ? '(乖離バンド方式)' : ''})の結果、ターゲット時点(${tl.target_age}歳)の目標達成確率 P(V_T≥G) は ${fmtPct(mt.success_prob)}(MC標準誤差 ±${fmtPct(mt.success_se, 2)})でした。`,
    )
    parts.push(
      `最終資産は中央値${fmtYen(mt.terminal.median)}・平均${fmtYen(mt.terminal.mean)}・CVaR(5%)${fmtYen(mt.terminal.cvar05)}。期待ショートフォール E[max(G−V_T,0)] は${fmtYen(mt.expected_shortfall)}です(実質値では中央値${fmtYen(mt.terminal_real_median)})。`,
    )
    parts.push(
      `経路指標は、最大ドローダウン中央値${fmtPct(mt.max_drawdown.p50)}(p95: ${fmtPct(mt.max_drawdown.p95)})、ターゲット直前5年間の下落幅 p95 は${fmtPct(mt.pre_target_drawdown.p95)}でした。`,
    )
    if (hasWd) {
      const ruinStr = mt.ruin_prob_by_age.map((r) => `${r.age}歳 ${fmtPct(r.prob)}`).join(' / ')
      const life = mt.asset_life.p50
      parts.push(
        `取り崩し期の資産枯渇確率は ${ruinStr || `${tl.end_age}歳 ${fmtPct(mt.ruin_prob_end)}`}。` +
          (life !== null
            ? `資産寿命の中央値(枯渇パスのみ、全体の${fmtPct(mt.asset_life.ruined_pct)})は${life.toFixed(1)}歳です。`
            : '評価期間内に枯渇したパスはありません。'),
      )
    }
    if (st) {
      parts.push(
        `SoRRストレス(ターゲット${a.stress.years_before_target}年前に株式クラスへ${fmtPct(a.stress.equity_shock_pct, 0)}の決定論的ショック)適用時は、成功確率${fmtPct(st.success_prob)}(${fmtPt(st.success_delta)})・最終資産中央値${fmtYen(st.terminal_median)}でした。`,
      )
    }
    parts.push(
      `前提: CMA=${a.cma.label}(${a.cma.id} ${a.cma.version})、税制=${a.tax_mode_label}、インフレ${fmtPct(a.inflation_annual)}。数値はすべて計算エンジンの出力値です(engine ${result.engine_version} / run ${result.run_id})。`,
    )
    text = parts.join('')
  }

  const matched = checkForbidden(text)
  if (matched) return { text: FALLBACK_TEXT, blocked: true, matched, guardrail_id: 'G2' }
  return { text, blocked: false, matched: null, guardrail_id: 'G2' }
}
