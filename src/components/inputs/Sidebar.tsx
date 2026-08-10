// 入力サイドバー — 基本設定 / 積立・取り崩し / 市場前提 / エンジン設定

import { useStore, uid } from '../../state/store'
import type { WithdrawalMode } from '../../engine/types'
import { fmtNum } from '../../lib/format'
import { Section } from './Section'
import { CheckField, NumField, PctField, SegField, SelectField } from './fields'
import { GlidepathSection } from './GlidepathSection'

function PersonSection() {
  const person = useStore((s) => s.params.person)
  const goal = useStore((s) => s.params.goal)
  const setPerson = useStore((s) => s.setPerson)
  const setGoal = useStore((s) => s.setGoal)
  return (
    <Section title="基本設定">
      <div className="grid grid-cols-3 gap-2">
        <NumField label="現在年齢" value={person.current_age} onChange={(v) => setPerson({ current_age: v })} min={18} max={80} unit="歳" />
        <NumField label="ターゲット" value={person.target_age} onChange={(v) => setPerson({ target_age: v })} min={person.current_age} max={90} unit="歳" />
        <NumField label="評価終了" value={person.end_age} onChange={(v) => setPerson({ end_age: v })} min={person.target_age} max={110} unit="歳" />
      </div>
      <NumField
        label="目標額(ターゲット時点・名目)"
        value={goal.target_amount_at_target_age}
        onChange={(v) => setGoal({ target_amount_at_target_age: v })}
        min={0}
        step={1000000}
        unit="円"
        showYen
      />
    </Section>
  )
}

const MONTH_LABELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']

function CashflowSection() {
  const cf = useStore((s) => s.params.cashflow)
  const capTemplates = useStore((s) => s.capTemplates)
  const setCashflow = useStore((s) => s.setCashflow)
  const setWithdrawal = useStore((s) => s.setWithdrawal)

  const cap = capTemplates.find((t) => t.id === cf.cap_template_id)
  const capExceeded = cap && cap.monthly_limit !== null && cf.monthly_contribution > cap.monthly_limit

  const toggleBonusMonth = (m: number) => {
    const has = cf.bonus_months.includes(m)
    setCashflow({ bonus_months: has ? cf.bonus_months.filter((x) => x !== m) : [...cf.bonus_months, m].sort((a, b) => a - b) })
  }

  return (
    <Section title="積立・取り崩し">
      <NumField label="初期残高" value={cf.initial_balance} onChange={(v) => setCashflow({ initial_balance: v })} min={0} step={100000} unit="円" showYen />
      <div className="grid grid-cols-2 gap-2">
        <NumField label="月額拠出" value={cf.monthly_contribution} onChange={(v) => setCashflow({ monthly_contribution: v })} min={0} step={1000} unit="円" />
        <PctField label="年次改定率" value={cf.contribution_growth_annual} onChange={(v) => setCashflow({ contribution_growth_annual: v })} min={0} max={10} hint="昇給連動" />
      </div>
      <SelectField
        label="拠出上限テンプレート(FR-CF-02)"
        value={cf.cap_template_id}
        onChange={(v) => setCashflow({ cap_template_id: v })}
        options={capTemplates.map((t) => ({
          value: t.id,
          label: t.monthly_limit === null ? t.label : `${t.label} 〜${fmtNum(t.monthly_limit)}円/月`,
        }))}
        hint="設定タブで編集可"
      />
      {capExceeded && (
        <p className="rounded-md bg-warn/15 px-2 py-1.5 text-[11px] text-ink">
          <span aria-hidden>⚠</span> 月額拠出が上限({fmtNum(cap!.monthly_limit!)}円/月)を超えています(警告のみ・計算は実行されます)
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <NumField label="拠出開始年齢" value={cf.contribution_start_age} onChange={(v) => setCashflow({ contribution_start_age: v })} min={18} max={90} unit="歳" />
        <NumField label="拠出終了年齢" value={cf.contribution_end_age} onChange={(v) => setCashflow({ contribution_end_age: v })} min={18} max={95} unit="歳" />
      </div>
      <div>
        <div className="mb-1 text-[11px] font-medium text-ink2">賞与月加算(開始月起点の月番号)</div>
        <div className="flex flex-wrap gap-1">
          {MONTH_LABELS.map((label, i) => (
            <button
              key={i}
              className={`h-6 w-7 rounded text-[10.5px] tnum transition-colors ${
                cf.bonus_months.includes(i + 1) ? 'bg-accent font-semibold text-white' : 'bg-page text-ink2 hover:bg-grid'
              }`}
              onClick={() => toggleBonusMonth(i + 1)}
              aria-pressed={cf.bonus_months.includes(i + 1)}
            >
              {label}
            </button>
          ))}
        </div>
        {cf.bonus_months.length > 0 && (
          <div className="mt-2">
            <NumField label="賞与月の加算額" value={cf.bonus_amount} onChange={(v) => setCashflow({ bonus_amount: v })} min={0} step={10000} unit="円" />
          </div>
        )}
      </div>

      <div className="border-t border-ink/5 pt-3">
        <SelectField
          label="取り崩し方式(FR-CF-03)"
          value={cf.withdrawal.mode}
          onChange={(v) => setWithdrawal({ mode: v as WithdrawalMode })}
          options={[
            { value: 'fixed_nominal', label: '定額(名目固定)' },
            { value: 'fixed_real', label: '定額(実質固定・インフレ連動)' },
            { value: 'rate', label: '定率(残高×年率)' },
            { value: 'period', label: '期間指定(残存月数で均等割)' },
          ]}
        />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <NumField label="開始年齢" value={cf.withdrawal.start_age} onChange={(v) => setWithdrawal({ start_age: v })} min={40} max={110} unit="歳" />
          {(cf.withdrawal.mode === 'fixed_nominal' || cf.withdrawal.mode === 'fixed_real') && (
            <NumField label="月額(手取り目標)" value={cf.withdrawal.monthly_amount} onChange={(v) => setWithdrawal({ monthly_amount: v })} min={0} step={10000} unit="円" />
          )}
          {cf.withdrawal.mode === 'rate' && (
            <PctField label="取り崩し率(年)" value={cf.withdrawal.rate_annual} onChange={(v) => setWithdrawal({ rate_annual: v })} min={0} max={20} />
          )}
          {cf.withdrawal.mode === 'period' && (
            <NumField label="取り崩し終了年齢" value={cf.withdrawal.period_end_age} onChange={(v) => setWithdrawal({ period_end_age: v })} min={cf.withdrawal.start_age} max={110} unit="歳" />
          )}
        </div>
      </div>

      <div className="border-t border-ink/5 pt-3">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[11px] font-medium text-ink2">一時金イベント(FR-CF-04)</span>
          <button
            className="rounded-md border border-dashed border-ink/20 px-2 py-0.5 text-[10.5px] text-ink2 hover:border-accent hover:text-accent-deep"
            onClick={() =>
              setCashflow({ events: [...cf.events, { id: uid('ev'), age: 60, amount: 1_000_000, label: '退職一時金' }] })
            }
          >
            + 追加
          </button>
        </div>
        {cf.events.length === 0 && <p className="text-[10.5px] text-muted">なし(例: 退職一時金の投入、住宅資金の引き出し)</p>}
        <div className="space-y-1.5">
          {cf.events.map((ev) => (
            <div key={ev.id} className="rounded-lg border border-ink/10 bg-page/60 p-2">
              <div className="flex items-center gap-1.5">
                <input
                  className="w-full min-w-0 flex-1 rounded border border-ink/10 bg-white px-1.5 py-1 text-[11.5px] outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                  value={ev.label}
                  placeholder="ラベル"
                  onChange={(e) => setCashflow({ events: cf.events.map((x) => (x.id === ev.id ? { ...x, label: e.target.value } : x)) })}
                />
                <button
                  className="shrink-0 rounded px-1.5 py-0.5 text-[11px] text-muted hover:bg-surface hover:text-critical"
                  onClick={() => setCashflow({ events: cf.events.filter((x) => x.id !== ev.id) })}
                >
                  削除
                </button>
              </div>
              <div className="mt-1.5 flex items-center gap-1.5">
                <input
                  type="number"
                  className="w-16 rounded border border-ink/10 bg-white px-1.5 py-1 text-[11.5px] tnum outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                  value={ev.age}
                  onChange={(e) => setCashflow({ events: cf.events.map((x) => (x.id === ev.id ? { ...x, age: Number(e.target.value) } : x)) })}
                />
                <span className="text-[10px] text-muted">歳</span>
                <input
                  type="number"
                  step={100000}
                  className="min-w-0 flex-1 rounded border border-ink/10 bg-white px-1.5 py-1 text-[11.5px] tnum outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                  value={ev.amount}
                  onChange={(e) => setCashflow({ events: cf.events.map((x) => (x.id === ev.id ? { ...x, amount: Number(e.target.value) } : x)) })}
                />
                <span className="shrink-0 text-[10px] text-muted">円({ev.amount >= 0 ? '投入' : '引出'})</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  )
}

function MarketSection() {
  const market = useStore((s) => s.params.market)
  const cmaSets = useStore((s) => s.cmaSets)
  const setMarket = useStore((s) => s.setMarket)
  const selectCmaSet = useStore((s) => s.selectCmaSet)
  const setTab = useStore((s) => s.setTab)
  const cma = cmaSets.find((c) => c.id === market.cma_set_id)

  return (
    <Section title="市場前提・コスト">
      <div>
        <SelectField
          label="CMAセット(FR-CMA-03)"
          value={market.cma_set_id}
          onChange={selectCmaSet}
          options={cmaSets.map((c) => ({ value: c.id, label: `${c.label}(${c.id} ${c.version})` }))}
        />
        {cma && (
          <p className="mt-1 text-[10.5px] leading-relaxed text-muted">
            出所: {cma.source} / 作成 {cma.created_at}{' '}
            <button className="text-accent-deep hover:underline" onClick={() => setTab('settings')}>
              詳細・編集
            </button>
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <PctField label="信託報酬(年率)" value={market.expense_ratio_annual} onChange={(v) => setMarket({ expense_ratio_annual: v })} min={0} max={3} step={0.05} digits={2} />
        <NumField label="口座管理料" value={market.fixed_fee_monthly} onChange={(v) => setMarket({ fixed_fee_monthly: v })} min={0} step={100} unit="円/月" />
      </div>
      <SegField
        label="税制モード(FR-SIM-05)"
        value={market.tax_mode}
        onChange={(v) => setMarket({ tax_mode: v })}
        options={[
          { value: 'tax_free', label: '非課税(DC/NISA)' },
          { value: 'simple_tax', label: '簡易課税 20.315%' },
        ]}
      />
      <PctField label="インフレ率(年)" value={market.inflation_annual} onChange={(v) => setMarket({ inflation_annual: v })} min={-2} max={10} hint="CMA既定から変更可" />
    </Section>
  )
}

function EngineSection() {
  const engine = useStore((s) => s.params.engine)
  const stress = useStore((s) => s.params.stress)
  const setEngine = useStore((s) => s.setEngine)
  const setStress = useStore((s) => s.setStress)

  return (
    <Section title="エンジン・ストレス" defaultOpen={false}>
      <SelectField
        label="パス数(FR-SIM-01)"
        value={String(engine.n_paths)}
        onChange={(v) => setEngine({ n_paths: Number(v) })}
        options={[
          { value: '1000', label: '1,000(高速)' },
          { value: '5000', label: '5,000' },
          { value: '10000', label: '10,000(既定)' },
          { value: '20000', label: '20,000' },
          { value: '50000', label: '50,000(低速)' },
          { value: '100000', label: '100,000(数十秒)' },
        ]}
      />
      <div className="flex items-end gap-1.5">
        <div className="flex-1">
          <NumField label="乱数シード(FR-SIM-02)" value={engine.seed} onChange={(v) => setEngine({ seed: Math.floor(v) })} min={0} hint="同一シードで完全再現" />
        </div>
        <button
          className="mb-[1px] rounded-md border border-ink/10 bg-surface px-2 py-1.5 text-[13px] hover:border-accent"
          title="ランダムなシードを設定"
          onClick={() => setEngine({ seed: Math.floor(Math.random() * 1e8) })}
        >
          🎲
        </button>
      </div>
      <SegField
        label="リバランス方式(FR-SIM-03)"
        value={engine.rebalance}
        onChange={(v) => setEngine({ rebalance: v })}
        options={[
          { value: 'monthly_to_target', label: '毎月目標配分一致' },
          { value: 'band', label: '乖離バンド' },
        ]}
      />
      {engine.rebalance === 'band' && (
        <PctField label="乖離バンド幅 ±" value={engine.band_pct} onChange={(v) => setEngine({ band_pct: v })} min={0.5} max={20} />
      )}
      <div className="border-t border-ink/5 pt-2">
        <CheckField label="SoRRストレス(FR-OUT-06)" hint="退職直前ショックの重ね掛け" checked={stress.enabled} onChange={(v) => setStress({ enabled: v })} />
        {stress.enabled && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <PctField label="株式下落率" value={-stress.equity_shock_pct} onChange={(v) => setStress({ equity_shock_pct: -v })} min={0} max={80} digits={0} />
            <NumField label="ターゲット何年前" value={stress.years_before_target} onChange={(v) => setStress({ years_before_target: v })} min={0} max={20} unit="年" />
          </div>
        )}
      </div>
    </Section>
  )
}

export function Sidebar() {
  const resetParams = useStore((s) => s.resetParams)
  return (
    <aside className="flex h-full w-[330px] shrink-0 flex-col border-r border-ink/10 bg-surface">
      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto pb-6">
        <PersonSection />
        <GlidepathSection />
        <CashflowSection />
        <MarketSection />
        <EngineSection />
        <div className="px-4 pt-3">
          <button className="text-[10.5px] text-muted hover:text-critical hover:underline" onClick={() => confirm('入力をすべて既定値に戻しますか?') && resetParams()}>
            入力を既定値へリセット
          </button>
        </div>
      </div>
    </aside>
  )
}
