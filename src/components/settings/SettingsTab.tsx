// 前提・設定タブ — CMAセット管理(FR-CMA)/ 拠出上限マスタ(FR-CF-02)/
// 精度検証(6.7)/ 実行履歴(8章 SimulationRun 相当)/ ガードレール対応表(CP-06)

import { useMemo, useState } from 'react'
import { useStore } from '../../state/store'
import { cholesky } from '../../engine/linalg'
import { ENGINE_VERSION } from '../../engine/types'
import type { CMASet } from '../../engine/types'
import { fmtNum, fmtPct, fmtYen } from '../../lib/format'
import { DataTable } from '../charts/base'
import { SelectField } from '../inputs/fields'

function Card({ title, subtitle, children, actions }: { title: string; subtitle?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-ink/10 bg-surface p-4">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
          {subtitle && <p className="mt-0.5 max-w-3xl text-[11px] leading-relaxed text-muted">{subtitle}</p>}
        </div>
        {actions}
      </header>
      {children}
    </section>
  )
}

const numCls =
  'w-full rounded border border-ink/10 bg-white px-1.5 py-1 text-[11.5px] tnum outline-none focus-visible:ring-2 focus-visible:ring-accent/40'

function CmaEditor() {
  const cmaSets = useStore((s) => s.cmaSets)
  const activeId = useStore((s) => s.params.market.cma_set_id)
  const updateCmaSet = useStore((s) => s.updateCmaSet)
  const resetCmaSet = useStore((s) => s.resetCmaSet)
  const duplicateCmaSet = useStore((s) => s.duplicateCmaSet)
  const selectCmaSet = useStore((s) => s.selectCmaSet)
  const [editId, setEditId] = useState(activeId)
  const cma = cmaSets.find((c) => c.id === editId) ?? cmaSets[0]

  const psdOk = useMemo(() => (cma ? cholesky(cma.corr) !== null : true), [cma])
  if (!cma) return null

  const patch = (p: Partial<CMASet>) => updateCmaSet({ ...cma, ...p })
  const patchAsset = (i: number, p: Partial<CMASet['assets'][0]>) => {
    const assets = cma.assets.map((a, j) => (j === i ? { ...a, ...p } : a))
    patch({ assets })
  }
  const patchCorr = (i: number, j: number, v: number) => {
    const corr = cma.corr.map((row) => row.slice())
    const cv = Math.max(-1, Math.min(1, v))
    corr[i][j] = cv
    corr[j][i] = cv
    patch({ corr })
  }

  return (
    <Card
      title="CMAセット(資本市場前提)の管理 — FR-CMA-01〜04"
      subtitle="期待リターン(算術/幾何の別を明示)・ボラティリティ・相関行列・インフレ率をセット単位でバージョン管理します。組み込みセットの数値は説明用サンプルです。"
      actions={
        <div className="flex items-center gap-2">
          <button className="rounded-md border border-ink/10 px-2.5 py-1 text-[11px] text-ink2 hover:border-accent hover:text-accent-deep" onClick={() => duplicateCmaSet(cma.id)}>
            複製して新規作成
          </button>
          {cma.builtin && (
            <button className="rounded-md border border-ink/10 px-2.5 py-1 text-[11px] text-ink2 hover:border-critical hover:text-critical" onClick={() => resetCmaSet(cma.id)}>
              初期値へリセット
            </button>
          )}
        </div>
      }
    >
      <div className="mb-3 grid gap-2 md:grid-cols-4">
        <SelectField label="編集対象セット" value={cma.id} onChange={setEditId} options={cmaSets.map((c) => ({ value: c.id, label: `${c.label}(${c.id})` }))} />
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-ink2">名称</span>
          <input className={numCls + ' !text-[12.5px]'} value={cma.label} onChange={(e) => patch({ label: e.target.value })} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-ink2">バージョン</span>
          <input className={numCls + ' !text-[12.5px]'} value={cma.version} onChange={(e) => patch({ version: e.target.value })} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-ink2">インフレ率(年)%</span>
          <input type="number" step={0.1} className={numCls} value={Number((cma.inflation * 100).toFixed(2))} onChange={(e) => patch({ inflation: Number(e.target.value) / 100 })} />
        </label>
      </div>
      <label className="mb-3 block">
        <span className="mb-1 block text-[11px] font-medium text-ink2">出所(CP-05: 出力物に常時表示)</span>
        <input className={numCls + ' !text-[12.5px]'} value={cma.source} onChange={(e) => patch({ source: e.target.value })} />
      </label>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h4 className="mb-1.5 text-[11.5px] font-semibold text-ink2">資産クラス別前提</h4>
          <table className="w-full border-collapse text-[11.5px]">
            <thead>
              <tr>
                {['資産クラス', 'リターン(年)%', '種別', 'ボラ(年)%'].map((h, i) => (
                  <th key={h} className={`border-b border-ink/10 px-1.5 py-1 font-medium text-ink2 ${i === 0 ? 'text-left' : 'text-right'}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cma.assets.map((a, i) => (
                <tr key={a.key}>
                  <td className="border-b border-ink/5 px-1.5 py-1 text-ink2">{a.name}</td>
                  <td className="border-b border-ink/5 px-1.5 py-1">
                    <input type="number" step={0.1} className={numCls + ' text-right'} value={Number((a.ret * 100).toFixed(2))} onChange={(e) => patchAsset(i, { ret: Number(e.target.value) / 100 })} />
                  </td>
                  <td className="border-b border-ink/5 px-1.5 py-1 text-right">
                    <select className={numCls} value={a.ret_type} onChange={(e) => patchAsset(i, { ret_type: e.target.value as 'geometric' | 'arithmetic' })}>
                      <option value="geometric">幾何</option>
                      <option value="arithmetic">算術</option>
                    </select>
                  </td>
                  <td className="border-b border-ink/5 px-1.5 py-1">
                    <input type="number" step={0.5} min={0} className={numCls + ' text-right'} value={Number((a.vol * 100).toFixed(2))} onChange={(e) => patchAsset(i, { vol: Number(e.target.value) / 100 })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <h4 className="text-[11.5px] font-semibold text-ink2">相関行列(対称・対角=1)</h4>
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${psdOk ? 'bg-good/10 text-goodtext' : 'bg-warn/20 text-ink'}`}>
              <span aria-hidden>{psdOk ? '✓' : '⚠'}</span>
              {psdOk ? '正定値' : '非正定値 — 実行時に最近接正定値行列へ補正されます(FR-CMA-02)'}
            </span>
          </div>
          <div className="thin-scroll overflow-x-auto">
            <table className="border-collapse text-[10.5px]">
              <thead>
                <tr>
                  <th className="px-1 py-0.5" />
                  {cma.assets.map((a) => (
                    <th key={a.key} className="px-1 py-0.5 font-medium text-muted">
                      {a.name.slice(0, 2)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cma.assets.map((a, i) => (
                  <tr key={a.key}>
                    <td className="px-1 py-0.5 font-medium text-muted">{a.name.slice(0, 2)}</td>
                    {cma.assets.map((b, j) => (
                      <td key={b.key} className="p-0.5">
                        {i === j ? (
                          <span className="tnum block w-12 rounded bg-page px-1 py-1 text-center text-muted">1.00</span>
                        ) : j > i ? (
                          <input
                            type="number"
                            step={0.05}
                            min={-1}
                            max={1}
                            className="tnum w-12 rounded border border-ink/10 bg-white px-1 py-1 text-center outline-none focus-visible:ring-1 focus-visible:ring-accent/40"
                            value={Number(cma.corr[i][j].toFixed(2))}
                            onChange={(e) => patchCorr(i, j, Number(e.target.value))}
                            aria-label={`${a.name}×${b.name}の相関`}
                          />
                        ) : (
                          <span className="tnum block w-12 px-1 py-1 text-center text-muted">{cma.corr[i][j].toFixed(2)}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {editId !== activeId && (
        <button className="mt-3 rounded-md border border-accent/40 bg-accent/5 px-3 py-1.5 text-[11.5px] font-medium text-accent-deep hover:bg-accent/10" onClick={() => selectCmaSet(cma.id)}>
          このセットをシミュレーションで使用する
        </button>
      )}
    </Card>
  )
}

function CapMaster() {
  const caps = useStore((s) => s.capTemplates)
  const updateCap = useStore((s) => s.updateCapTemplate)
  return (
    <Card
      title="拠出上限テンプレート(設定マスタ)— FR-CF-02"
      subtitle="拠出上限は法改正に追随して本マスタで更新します(仕様書に法定値をハードコードしない方針)。初期値は2026-08時点の参考値です。上限超過の入力は警告のみでエラーとはなりません。"
    >
      <table className="w-full max-w-xl border-collapse text-[12px]">
        <thead>
          <tr>
            <th className="border-b border-ink/10 px-2 py-1.5 text-left font-medium text-ink2">テンプレート</th>
            <th className="border-b border-ink/10 px-2 py-1.5 text-right font-medium text-ink2">月額上限(円)</th>
          </tr>
        </thead>
        <tbody>
          {caps.map((t) => (
            <tr key={t.id}>
              <td className="border-b border-ink/5 px-2 py-1.5 text-ink2">{t.label}</td>
              <td className="border-b border-ink/5 px-2 py-1.5 text-right">
                {t.monthly_limit === null ? (
                  <span className="text-muted">上限なし</span>
                ) : (
                  <input
                    type="number"
                    step={500}
                    min={0}
                    className={numCls + ' max-w-32 text-right'}
                    value={t.monthly_limit}
                    onChange={(e) => updateCap({ ...t, monthly_limit: Number(e.target.value) })}
                    aria-label={`${t.label}の月額上限`}
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

function SelfTestPanel() {
  const result = useStore((s) => s.selftestResult)
  const status = useStore((s) => s.selftestStatus)
  const run = useStore((s) => s.runSelftest)
  return (
    <Card
      title="精度検証 — 解析解との突合(6.7)"
      subtitle="拠出・取り崩し・手数料ゼロの単一資産ケース(g=5%、σ=18%、30年、N=10,000)では最終資産が解析的に対数正規分布に従うことを利用し、モンテカルロ結果を理論値と突合します。受け入れ基準: 中央値の相対誤差 < 0.5%、5/25/75/95分位 < 1.5%(CIでも自動検証・ゴールデンシード)。"
      actions={
        <button className="rounded-lg bg-accent px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-accent-deep disabled:opacity-50" onClick={run} disabled={status === 'running'}>
          {status === 'running' ? '検証中…' : '検証を実行'}
        </button>
      }
    >
      {result ? (
        <div className="space-y-2">
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${result.passed ? 'bg-good/10 text-goodtext' : 'bg-critical/10 text-critical'}`}>
            <span aria-hidden>{result.passed ? '✓' : '✗'}</span>
            {result.passed ? '受け入れ基準を満たしています' : '受け入れ基準を満たしていません'}
            <span className="font-normal text-muted">(N={fmtNum(result.n_paths)} / seed {result.seed} / {fmtNum(result.timing_ms)}ms)</span>
          </span>
          <DataTable
            head={['指標', '理論値', 'モンテカルロ', '相対誤差', '許容', '判定']}
            rows={result.cases.map((c) => [
              c.name,
              fmtYen(c.theory),
              fmtYen(c.mc),
              fmtPct(c.relErr, 3),
              `< ${fmtPct(c.tol, 1)}`,
              c.pass ? '✓ 合格' : '✗ 不合格',
            ])}
          />
        </div>
      ) : (
        <p className="text-[11.5px] text-muted">「検証を実行」を押すと、このブラウザ上でエンジンの精度検証を実行します(数秒)。</p>
      )}
    </Card>
  )
}

function HistoryPanel() {
  const history = useStore((s) => s.history)
  const restore = useStore((s) => s.restoreFromHistory)
  const clear = useStore((s) => s.clearHistory)

  const download = (runId: string) => {
    const rec = history.find((h) => h.run_id === runId)
    if (!rec) return
    const blob = new Blob([JSON.stringify(rec, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${rec.run_id}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <Card
      title="実行履歴(SimulationRun 相当・追記専用)"
      subtitle="本計算の実行を、再現パラメータ・シード・結果ハッシュ(SHA-256)とともにローカルへ追記保存します(8章のappend-onlyストアの簡易実装・直近50件)。「復元」で当時の入力を呼び戻し、同一シードで完全再現できます。"
      actions={
        history.length > 0 ? (
          <button className="rounded-md border border-ink/10 px-2.5 py-1 text-[11px] text-ink2 hover:border-critical hover:text-critical" onClick={() => confirm('ローカル履歴をすべて削除しますか?(監査用途では削除しないでください)') && clear()}>
            全消去
          </button>
        ) : undefined
      }
    >
      {history.length === 0 ? (
        <p className="text-[11.5px] text-muted">まだ履歴がありません。「本計算を実行」すると追記されます。</p>
      ) : (
        <div className="thin-scroll overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-[11.5px]">
            <thead>
              <tr>
                {['日時', 'run_id', '設計', 'seed', 'パス数', '成功確率', '中央値', 'result_hash', ''].map((h, i) => (
                  <th key={i} className={`border-b border-ink/10 px-2 py-1.5 font-medium text-ink2 ${i <= 2 ? 'text-left' : 'text-right'}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.run_id} className="hover:bg-page">
                  <td className="tnum border-b border-ink/5 px-2 py-1.5 text-ink2">{new Date(h.created_at).toLocaleString('ja-JP')}</td>
                  <td className="tnum border-b border-ink/5 px-2 py-1.5 text-muted">{h.run_id.slice(0, 18)}…</td>
                  <td className="border-b border-ink/5 px-2 py-1.5 text-ink2">{h.label}</td>
                  <td className="tnum border-b border-ink/5 px-2 py-1.5 text-right">{h.seed}</td>
                  <td className="tnum border-b border-ink/5 px-2 py-1.5 text-right">{fmtNum(h.n_paths)}</td>
                  <td className="tnum border-b border-ink/5 px-2 py-1.5 text-right">{fmtPct(h.success_prob)}</td>
                  <td className="tnum border-b border-ink/5 px-2 py-1.5 text-right">{fmtYen(h.terminal_median)}</td>
                  <td className="tnum border-b border-ink/5 px-2 py-1.5 text-right text-muted">{h.result_hash.slice(0, 10)}…</td>
                  <td className="border-b border-ink/5 px-2 py-1.5 text-right">
                    <button className="mr-2 text-accent-deep hover:underline" onClick={() => restore(h.run_id)}>
                      復元
                    </button>
                    <button className="text-ink2 hover:underline" onClick={() => download(h.run_id)}>
                      JSON
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

function AboutPanel() {
  return (
    <Card title="このツールについて" subtitle={`グライドパス・シミュレーター v${ENGINE_VERSION} — 仕様書 v0.1(2026-08-08)準拠のリファレンス実装`}>
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h4 className="mb-1.5 text-[11.5px] font-semibold text-ink2">ガードレール対応表(CP-06 / FA-OS G0〜G4)</h4>
          <DataTable
            head={['ID', '分類', '本ツールでの対応']}
            rows={[
              ['G0', '基本原則', '数値はエンジン、言葉はテンプレート(数値の生成・改変禁止)'],
              ['G1', '入力検証', '配分合計=1、拠出上限警告、相関行列の正定値検証・補正'],
              ['G2', '表現制御', '禁止辞書+検査による断定・推奨・元本保証表現の遮断と定型文フォールバック'],
              ['G3', '越権行為', '個別商品推奨の不生成、比較の中立表示(追加順・優劣表示なし)'],
              ['G4', '免責・前提', '免責文(DSC-001)と前提条件(CMA出所・手数料・税・インフレ)の常時表示'],
            ]}
          />
        </div>
        <div className="space-y-2 text-[11.5px] leading-relaxed text-ink2">
          <h4 className="text-[11.5px] font-semibold">実装ノート</h4>
          <ul className="list-disc space-y-1 pl-4">
            <li>計算層: 多変量対数正規の月次モンテカルロ(6.3〜6.6)。ブラウザ内のWeb Workerで実行し、UIから独立しています。</li>
            <li>乱数: PCG32(XSH-RR・64bit状態)。仕様のPCG64からの逸脱で、(engine_version, seed)での完全再現性は本実装で保証されます(READMEに記録)。</li>
            <li>CRN: 比較・感応度は同一乱数系列を全設定で共有し、差分の分散を抑えています(FR-OUT-07)。</li>
            <li>LLM説明層: v0.1は決定論的テンプレート実装(FR-EXP-01の契約と同一)。LLM接続時も同じガードレールを通します。</li>
            <li>スコープ外(1.3): 特定商品の推奨・売買勧誘・投資助言、実売買・口座連携、将来リターンの予測、公的年金の精密計算。</li>
          </ul>
        </div>
      </div>
    </Card>
  )
}

export function SettingsTab() {
  return (
    <div className="space-y-4">
      <CmaEditor />
      <div className="grid items-start gap-4 xl:grid-cols-2">
        <CapMaster />
        <SelfTestPanel />
      </div>
      <HistoryPanel />
      <AboutPanel />
    </div>
  )
}
