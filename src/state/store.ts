// アプリ状態管理(zustand)— 入力パラメータ / 実行制御 / 履歴(append-only)

import { create } from 'zustand'
import type {
  CMASet,
  CashflowPlan,
  EngineParams,
  GlidePathDefinition,
  GoalParams,
  PersonParams,
  RunRecord,
  SimulationRequest,
  SimulationResult,
  StressParams,
  TaxMode,
  VariantSpec,
} from '../engine/types'
import {
  BUILTIN_CMA_SETS,
  DEFAULT_CAP_TEMPLATES,
  baseGlidepath,
  type CapTemplate,
} from '../engine/presets'
import {
  DEFAULT_SENSITIVITY_DELTAS,
  buildSensitivityRequest,
  mapSensitivityResult,
  type SensitivityDeltas,
  type SensitivityOutput,
} from '../engine/sensitivity'
import { GOLDEN_SEED, type AccuracyResult } from '../engine/selftest'
import type { ExplainLevel } from '../engine/explain'
import { engineClient, isCancelled } from './workerClient'
import { sha256Hex } from '../lib/hash'

export const PREVIEW_PATHS = 2000

export interface MarketParams {
  cma_set_id: string
  expense_ratio_annual: number
  fixed_fee_monthly: number
  tax_mode: TaxMode
  inflation_annual: number
}

export interface UiCashflow extends Omit<CashflowPlan, 'contribution_cap'> {
  cap_template_id: string
}

export interface UiParams {
  person: PersonParams
  glidepath: GlidePathDefinition
  cashflow: UiCashflow
  market: MarketParams
  engine: EngineParams
  goal: GoalParams
  stress: StressParams
}

export interface CompareVariant {
  id: string
  label: string
  glidepath: GlidePathDefinition
  costs: { expense_ratio_annual: number; fixed_fee_monthly: number }
}

export interface RunSlot {
  status: 'idle' | 'running'
  progress: number
  kind: 'preview' | 'full' | null
  data: SimulationResult | null
  error: string | null
  hash: string | null
}

const idleSlot = (): RunSlot => ({ status: 'idle', progress: 0, kind: null, data: null, error: null, hash: null })

export type TabId = 'sim' | 'compare' | 'sensitivity' | 'settings'

let uidSeq = 0
export const uid = (prefix = 'v') => `${prefix}-${Date.now().toString(36)}-${(uidSeq++).toString(36)}`

function defaultParams(): UiParams {
  return {
    person: { current_age: 30, target_age: 60, end_age: 95 },
    glidepath: baseGlidepath(),
    cashflow: {
      initial_balance: 1_000_000,
      monthly_contribution: 23_000,
      contribution_growth_annual: 0.01,
      bonus_months: [],
      bonus_amount: 0,
      contribution_start_age: 30,
      contribution_end_age: 60,
      withdrawal: { mode: 'fixed_real', monthly_amount: 150_000, rate_annual: 0.04, start_age: 65, period_end_age: 90 },
      events: [],
      cap_template_id: 'ideco_emp',
    },
    market: {
      cma_set_id: 'std-2026H1',
      expense_ratio_annual: 0.003,
      fixed_fee_monthly: 0,
      tax_mode: 'tax_free',
      inflation_annual: 0.015,
    },
    engine: { n_paths: 10000, seed: 20260808, rebalance: 'monthly_to_target', band_pct: 0.05 },
    goal: { target_amount_at_target_age: 30_000_000 },
    stress: { enabled: true, equity_shock_pct: -0.3, years_before_target: 3 },
  }
}

// ---------------------------------------------------------------- localStorage

const LS = {
  params: 'gpsim_params_v1',
  cma: 'gpsim_cma_v1',
  caps: 'gpsim_caps_v1',
  history: 'gpsim_history_v1',
  compare: 'gpsim_compare_v1',
}

function loadLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function saveLS(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* 容量超過などは無視(履歴は非必須) */
  }
}

// ---------------------------------------------------------------- ストア

interface Store {
  params: UiParams
  cmaSets: CMASet[]
  capTemplates: CapTemplate[]
  tab: TabId
  displayReal: boolean
  explainLevel: ExplainLevel
  reportOpen: boolean
  run: RunSlot
  compareExtras: CompareVariant[]
  compareSlot: RunSlot
  sensDeltas: SensitivityDeltas
  sensOut: SensitivityOutput | null
  sensStatus: 'idle' | 'running'
  sensProgress: number
  sensError: string | null
  selftestResult: AccuracyResult | null
  selftestStatus: 'idle' | 'running'
  history: RunRecord[]

  setTab: (t: TabId) => void
  setDisplayReal: (v: boolean) => void
  setExplainLevel: (v: ExplainLevel) => void
  setReportOpen: (v: boolean) => void
  setPerson: (p: Partial<PersonParams>) => void
  setGlidepath: (p: Partial<GlidePathDefinition>) => void
  replaceGlidepath: (gp: GlidePathDefinition) => void
  setCashflow: (p: Partial<UiCashflow>) => void
  setWithdrawal: (p: Partial<UiCashflow['withdrawal']>) => void
  setMarket: (p: Partial<MarketParams>) => void
  setEngine: (p: Partial<EngineParams>) => void
  setGoal: (p: Partial<GoalParams>) => void
  setStress: (p: Partial<StressParams>) => void
  selectCmaSet: (id: string) => void
  updateCmaSet: (setDef: CMASet) => void
  resetCmaSet: (id: string) => void
  duplicateCmaSet: (id: string) => void
  updateCapTemplate: (t: CapTemplate) => void
  resetParams: () => void

  addCompareVariant: (v: CompareVariant) => void
  removeCompareVariant: (id: string) => void
  updateCompareVariant: (id: string, patch: Partial<CompareVariant>) => void

  setSensDeltas: (d: Partial<SensitivityDeltas>) => void

  buildRequest: (opts?: { variants?: VariantSpec[]; preview?: boolean; nPaths?: number }) => SimulationRequest
  runPreview: () => void
  runFull: () => void
  runCompare: () => void
  runSensitivity: () => void
  runSelftest: () => void
  cancelRuns: () => void
  restoreFromHistory: (runId: string) => void
  clearHistory: () => void
}

export const useStore = create<Store>()((set, get) => {
  const persist = () => {
    const s = get()
    saveLS(LS.params, s.params)
    saveLS(LS.cma, s.cmaSets)
    saveLS(LS.caps, s.capTemplates)
    saveLS(LS.compare, s.compareExtras)
  }
  const setP = (patch: Partial<UiParams>) => {
    set((s) => ({ params: { ...s.params, ...patch } }))
    persist()
  }

  const initialParams = loadLS(LS.params, defaultParams())
  // 旧バージョンの保存値に新フィールドを補完
  const mergedParams: UiParams = {
    ...defaultParams(),
    ...initialParams,
    glidepath: { ...baseGlidepath(), ...initialParams.glidepath },
  }

  return {
    params: mergedParams,
    cmaSets: loadLS(LS.cma, BUILTIN_CMA_SETS),
    capTemplates: loadLS(LS.caps, DEFAULT_CAP_TEMPLATES),
    tab: 'sim',
    displayReal: false,
    explainLevel: 'basic',
    reportOpen: false,
    run: idleSlot(),
    compareExtras: loadLS(LS.compare, []),
    compareSlot: idleSlot(),
    sensDeltas: { ...DEFAULT_SENSITIVITY_DELTAS },
    sensOut: null,
    sensStatus: 'idle',
    sensProgress: 0,
    sensError: null,
    selftestResult: null,
    selftestStatus: 'idle',
    history: loadLS(LS.history, []),

    setTab: (t) => set({ tab: t }),
    setDisplayReal: (v) => set({ displayReal: v }),
    setExplainLevel: (v) => set({ explainLevel: v }),
    setReportOpen: (v) => set({ reportOpen: v }),

    setPerson: (p) => setP({ person: { ...get().params.person, ...p } }),
    setGlidepath: (p) => setP({ glidepath: { ...get().params.glidepath, ...p } }),
    replaceGlidepath: (gp) => setP({ glidepath: gp }),
    setCashflow: (p) => setP({ cashflow: { ...get().params.cashflow, ...p } }),
    setWithdrawal: (p) =>
      setP({ cashflow: { ...get().params.cashflow, withdrawal: { ...get().params.cashflow.withdrawal, ...p } } }),
    setMarket: (p) => setP({ market: { ...get().params.market, ...p } }),
    setEngine: (p) => setP({ engine: { ...get().params.engine, ...p } }),
    setGoal: (p) => setP({ goal: { ...get().params.goal, ...p } }),
    setStress: (p) => setP({ stress: { ...get().params.stress, ...p } }),

    selectCmaSet: (id) => {
      const cma = get().cmaSets.find((c) => c.id === id)
      if (!cma) return
      setP({ market: { ...get().params.market, cma_set_id: id, inflation_annual: cma.inflation } })
    },
    updateCmaSet: (setDef) => {
      set((s) => ({ cmaSets: s.cmaSets.map((c) => (c.id === setDef.id ? { ...setDef, builtin: c.builtin } : c)) }))
      persist()
    },
    resetCmaSet: (id) => {
      const original = BUILTIN_CMA_SETS.find((c) => c.id === id)
      if (!original) return
      set((s) => ({ cmaSets: s.cmaSets.map((c) => (c.id === id ? structuredClone(original) : c)) }))
      persist()
    },
    duplicateCmaSet: (id) => {
      const src = get().cmaSets.find((c) => c.id === id)
      if (!src) return
      const copy = structuredClone(src)
      copy.id = uid('cma')
      copy.label = `${src.label}(複製)`
      copy.source = 'ユーザー編集(複製)'
      copy.builtin = false
      set((s) => ({ cmaSets: [...s.cmaSets, copy] }))
      persist()
    },
    updateCapTemplate: (t) => {
      set((s) => ({ capTemplates: s.capTemplates.map((c) => (c.id === t.id ? t : c)) }))
      persist()
    },
    resetParams: () => {
      setP(defaultParams())
    },

    addCompareVariant: (v) => {
      if (get().compareExtras.length >= 4) return // 現在の設計 + 4 = 最大5(FR-CMP-01)
      set((s) => ({ compareExtras: [...s.compareExtras, v] }))
      persist()
    },
    removeCompareVariant: (id) => {
      set((s) => ({ compareExtras: s.compareExtras.filter((x) => x.id !== id) }))
      persist()
    },
    updateCompareVariant: (id, patch) => {
      set((s) => ({ compareExtras: s.compareExtras.map((x) => (x.id === id ? { ...x, ...patch } : x)) }))
      persist()
    },

    setSensDeltas: (d) => set((s) => ({ sensDeltas: { ...s.sensDeltas, ...d } })),

    buildRequest: (opts = {}) => {
      const { params, cmaSets, capTemplates } = get()
      const cma = cmaSets.find((c) => c.id === params.market.cma_set_id) ?? cmaSets[0] ?? BUILTIN_CMA_SETS[0]
      const cap = capTemplates.find((t) => t.id === params.cashflow.cap_template_id)
      const { cap_template_id: _capId, ...cashflowRest } = params.cashflow
      void _capId
      const cashflow: CashflowPlan = {
        ...cashflowRest,
        contribution_cap: cap ? { label: cap.label, monthly_limit: cap.monthly_limit } : undefined,
      }
      const variants: VariantSpec[] = opts.variants ?? [
        {
          id: 'current',
          label: params.glidepath.name || '現在の設計',
          glidepath: params.glidepath,
          costs: {
            expense_ratio_annual: params.market.expense_ratio_annual,
            fixed_fee_monthly: params.market.fixed_fee_monthly,
          },
        },
      ]
      return {
        variants,
        person: params.person,
        cashflow,
        cma,
        tax_mode: params.market.tax_mode,
        inflation_annual: params.market.inflation_annual,
        engine: { ...params.engine, n_paths: opts.nPaths ?? params.engine.n_paths },
        goal: params.goal,
        stress: params.stress,
        preview: opts.preview,
      }
    },

    runPreview: () => {
      const s = get()
      engineClient.cancelAll()
      set({ run: { ...s.run, status: 'running', kind: 'preview', progress: 0, error: null } })
      const req = s.buildRequest({ preview: true, nPaths: Math.min(PREVIEW_PATHS, s.params.engine.n_paths) })
      engineClient
        .run(req, (pct) => set((st) => ({ run: { ...st.run, progress: pct } })))
        .then((data) => {
          set({ run: { status: 'idle', progress: 100, kind: 'preview', data, error: null, hash: null } })
        })
        .catch((e) => {
          if (isCancelled(e)) return
          set((st) => ({ run: { ...st.run, status: 'idle', error: e.message } }))
        })
    },

    runFull: () => {
      const s = get()
      engineClient.cancelAll()
      set({ run: { ...s.run, status: 'running', kind: 'full', progress: 0, error: null } })
      const req = s.buildRequest({})
      engineClient
        .run(req, (pct) => set((st) => ({ run: { ...st.run, progress: pct } })))
        .then(async (data) => {
          const hash = await sha256Hex(JSON.stringify(data.variants.map((v) => v.metrics)))
          set({ run: { status: 'idle', progress: 100, kind: 'full', data, error: null, hash } })
          // 実行履歴(SimulationRun の簡易版)へ追記 — append-only
          const record: RunRecord = {
            run_id: data.run_id,
            created_at: data.created_at,
            engine_version: data.engine_version,
            cma_id: data.cma_id,
            seed: data.seed,
            n_paths: data.n_paths,
            label: data.variants[0].label,
            success_prob: data.variants[0].metrics.success_prob,
            terminal_median: data.variants[0].metrics.terminal.median,
            result_hash: hash,
            params_json: JSON.stringify(get().params),
          }
          const history = [record, ...get().history].slice(0, 50)
          set({ history })
          saveLS(LS.history, history)
        })
        .catch((e) => {
          if (isCancelled(e)) return
          set((st) => ({ run: { ...st.run, status: 'idle', error: e.message } }))
        })
    },

    runCompare: () => {
      const s = get()
      engineClient.cancelAll()
      set({ compareSlot: { ...s.compareSlot, status: 'running', kind: 'full', progress: 0, error: null } })
      const base = s.buildRequest({})
      const variants: VariantSpec[] = [
        { ...base.variants[0], id: 'current', label: `基準: ${base.variants[0].label}` },
        ...s.compareExtras.map((x) => ({ id: x.id, label: x.label, glidepath: x.glidepath, costs: x.costs })),
      ].slice(0, 5)
      const req = { ...base, variants }
      engineClient
        .run(req, (pct) => set((st) => ({ compareSlot: { ...st.compareSlot, progress: pct } })))
        .then(async (data) => {
          const hash = await sha256Hex(JSON.stringify(data.variants.map((v) => v.metrics)))
          set({ compareSlot: { status: 'idle', progress: 100, kind: 'full', data, error: null, hash } })
        })
        .catch((e) => {
          if (isCancelled(e)) return
          set((st) => ({ compareSlot: { ...st.compareSlot, status: 'idle', error: e.message } }))
        })
    },

    runSensitivity: () => {
      const s = get()
      engineClient.cancelAll()
      set({ sensStatus: 'running', sensProgress: 0, sensError: null })
      const nPaths = Math.min(s.params.engine.n_paths, 5000)
      const base = s.buildRequest({ nPaths })
      base.variants = base.variants.map((v) => ({ ...v, want_percentiles: false }))
      const req = buildSensitivityRequest(base, s.sensDeltas)
      engineClient
        .run(req, (pct) => set({ sensProgress: pct }))
        .then((data) => {
          set({ sensOut: mapSensitivityResult(data, s.params.glidepath, s.sensDeltas), sensStatus: 'idle' })
        })
        .catch((e) => {
          if (isCancelled(e)) return
          set({ sensStatus: 'idle', sensError: e.message })
        })
    },

    runSelftest: () => {
      set({ selftestStatus: 'running' })
      engineClient
        .selftest(10000, GOLDEN_SEED)
        .then((result) => set({ selftestResult: result, selftestStatus: 'idle' }))
        .catch(() => set({ selftestStatus: 'idle' }))
    },

    cancelRuns: () => {
      engineClient.cancelAll()
      set((s) => ({
        run: { ...s.run, status: 'idle' },
        compareSlot: { ...s.compareSlot, status: 'idle' },
        sensStatus: 'idle',
      }))
    },

    restoreFromHistory: (runId) => {
      const rec = get().history.find((h) => h.run_id === runId)
      if (!rec) return
      try {
        const params = JSON.parse(rec.params_json) as UiParams
        setP({ ...defaultParams(), ...params })
        set({ tab: 'sim' })
      } catch {
        /* 破損した履歴は無視 */
      }
    },

    clearHistory: () => {
      set({ history: [] })
      saveLS(LS.history, [])
    },
  }
})
