import { useEffect } from 'react'
import { useStore, type TabId } from './state/store'
import { fmtNum } from './lib/format'
import { DISCLAIMER_SHORT } from './engine/presets'
import { ENGINE_VERSION } from './engine/types'
import { Sidebar } from './components/inputs/Sidebar'
import { ResultsPanel } from './components/results/ResultsPanel'
import { CompareTab } from './components/compare/CompareTab'
import { SensitivityTab } from './components/sensitivity/SensitivityTab'
import { SettingsTab } from './components/settings/SettingsTab'
import { ReportView } from './components/report/ReportView'

const TABS: { id: TabId; label: string }[] = [
  { id: 'sim', label: 'シミュレーション' },
  { id: 'compare', label: '比較(CRN)' },
  { id: 'sensitivity', label: '感応度' },
  { id: 'settings', label: '前提・設定' },
]

function Header() {
  const tab = useStore((s) => s.tab)
  const setTab = useStore((s) => s.setTab)
  const run = useStore((s) => s.run)
  const nPaths = useStore((s) => s.params.engine.n_paths)
  const runFull = useStore((s) => s.runFull)
  const setReportOpen = useStore((s) => s.setReportOpen)

  return (
    <header className="flex h-[54px] shrink-0 items-center gap-4 border-b border-ink/10 bg-surface px-4">
      <div className="flex items-center gap-2.5">
        <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
          <rect width="32" height="32" rx="7" fill="#2a78d6" />
          <path d="M6 8h8c0 8-2 16 12 16" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" />
        </svg>
        <div>
          <h1 className="text-[14px] font-bold leading-4 text-ink">グライドパス・シミュレーター</h1>
          <p className="text-[9.5px] leading-3 text-muted">Glide Path Simulation Tool v{ENGINE_VERSION}(仕様書 v0.1 準拠)</p>
        </div>
      </div>
      <nav className="ml-2 flex gap-0.5 rounded-lg border border-ink/10 bg-page p-0.5" aria-label="メインナビゲーション">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`rounded-md px-3 py-1.5 text-[12px] transition-colors ${
              tab === t.id ? 'bg-surface font-semibold text-ink shadow-[0_1px_2px_rgba(11,11,11,0.08)]' : 'text-ink2 hover:text-ink'
            }`}
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-2">
        {run.status === 'running' && (
          <span className="tnum hidden text-[11px] text-muted sm:inline">
            {run.kind === 'preview' ? 'プレビュー計算中' : '計算中'} {run.progress}%
          </span>
        )}
        <button
          className="rounded-lg border border-ink/10 bg-surface px-3 py-1.5 text-[12px] font-medium text-ink2 transition-colors hover:border-accent hover:text-accent-deep disabled:opacity-40"
          onClick={() => setReportOpen(true)}
          disabled={!run.data}
        >
          レポート
        </button>
        <button
          className="rounded-lg bg-accent px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-accent-deep disabled:opacity-50"
          onClick={runFull}
          disabled={run.status === 'running' && run.kind === 'full'}
        >
          本計算を実行({fmtNum(nPaths)}パス)
        </button>
      </div>
    </header>
  )
}

function Footer() {
  return (
    <footer className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-ink/10 bg-surface/95 px-4 py-1.5 backdrop-blur">
      <p className="mx-auto max-w-[1600px] truncate text-center text-[10.5px] text-muted" title={DISCLAIMER_SHORT}>
        {DISCLAIMER_SHORT} 特定の金融商品の推奨・勧誘、投資助言を目的とするものではありません。(DSC-001)
      </p>
    </footer>
  )
}

export default function App() {
  const tab = useStore((s) => s.tab)
  const params = useStore((s) => s.params)
  const cmaSets = useStore((s) => s.cmaSets)
  const capTemplates = useStore((s) => s.capTemplates)
  const reportOpen = useStore((s) => s.reportOpen)

  // 入力変更で自動プレビュー(2,000パス・デバウンス)。本計算はヘッダーから明示実行。
  useEffect(() => {
    const t = setTimeout(() => useStore.getState().runPreview(), 350)
    return () => clearTimeout(t)
  }, [params, cmaSets, capTemplates])

  return (
    <>
      <div id="app-root" className="flex h-screen flex-col">
        <Header />
        <div className="flex min-h-0 flex-1">
          {tab !== 'settings' && <Sidebar />}
          <main className="thin-scroll min-w-0 flex-1 overflow-y-auto px-5 pb-16 pt-4">
            <div className="mx-auto max-w-[1240px]">
              {tab === 'sim' && <ResultsPanel />}
              {tab === 'compare' && <CompareTab />}
              {tab === 'sensitivity' && <SensitivityTab />}
              {tab === 'settings' && <SettingsTab />}
            </div>
          </main>
        </div>
        <Footer />
      </div>
      {reportOpen && <ReportView />}
    </>
  )
}
