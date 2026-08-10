// グライドパス定義セクション(FR-GP-01〜05)

import { useRef, useState } from 'react'
import { useStore } from '../../state/store'
import type { AssetKey, CurveKind } from '../../engine/types'
import { ASSET_LABELS, RISKY_KEYS, SAFE_KEYS } from '../../engine/types'
import { GP_PRESETS } from '../../engine/presets'
import { SAMPLE_CSV, parseGlidepathCsv } from '../../lib/csv'
import { MiniGlidepath } from '../charts/MiniGlidepath'
import { Section } from './Section'
import { NumField, SegField, SelectField, SliderField } from './fields'
import { fmtPct } from '../../lib/format'

function SplitEditor({
  title,
  keys,
  split,
  onChange,
}: {
  title: string
  keys: readonly AssetKey[]
  split: Partial<Record<AssetKey, number>>
  onChange: (s: Partial<Record<AssetKey, number>>) => void
}) {
  const sum = keys.reduce((s, k) => s + (split[k] ?? 0), 0)
  const ok = Math.abs(sum - 1) < 1e-6
  return (
    <div className="rounded-lg border border-ink/10 bg-page/60 p-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11px] font-medium text-ink2">{title}</span>
        <span className={`tnum rounded px-1.5 py-0.5 text-[10px] font-semibold ${ok ? 'bg-surface text-ink2' : 'bg-warn/20 text-ink'}`}>
          合計 {(sum * 100).toFixed(0)}%{ok ? '' : ' → 正規化されます'}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {keys.map((k) => (
          <label key={k} className="block">
            <span className="mb-0.5 block text-[10px] text-muted">{ASSET_LABELS[k]}</span>
            <div className="relative">
              <input
                type="number"
                className="w-full rounded border border-ink/10 bg-white px-1.5 py-1 pr-5 text-[12px] tnum outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                value={Math.round((split[k] ?? 0) * 1000) / 10}
                min={0}
                max={100}
                step={5}
                onChange={(e) => onChange({ ...split, [k]: Number(e.target.value) / 100 })}
              />
              <span className="pointer-events-none absolute inset-y-0 right-1 flex items-center text-[10px] text-muted">%</span>
            </div>
          </label>
        ))}
      </div>
    </div>
  )
}

export function GlidepathSection() {
  const gp = useStore((s) => s.params.glidepath)
  const person = useStore((s) => s.params.person)
  const setGlidepath = useStore((s) => s.setGlidepath)
  const replaceGlidepath = useStore((s) => s.replaceGlidepath)
  const fileRef = useRef<HTMLInputElement>(null)
  const [csvMsg, setCsvMsg] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null)
  const [showSplits, setShowSplits] = useState(false)

  const applyPreset = (id: string) => {
    const p = GP_PRESETS.find((x) => x.id === id)
    if (p) replaceGlidepath(p.apply(gp))
  }

  const onFile = async (file: File) => {
    const text = await file.text()
    const parsed = parseGlidepathCsv(text)
    if ('error' in parsed) {
      setCsvMsg({ kind: 'error', text: parsed.error })
      return
    }
    const rows = parsed.rows
      .map((r) => ({ age: parsed.mode === 'age' ? r.t : person.target_age - r.t, weights: r.weights }))
      .sort((a, b) => a.age - b.age)
    replaceGlidepath({
      ...gp,
      kind: 'weights_table',
      name: file.name.replace(/\.(csv|txt)$/i, ''),
      weights_table: rows,
      imported_from: file.name,
    })
    setCsvMsg({
      kind: 'ok',
      text: `${file.name} を取り込みました(${rows.length}行)` + (parsed.warnings.length ? ` / ${parsed.warnings.length}件の正規化警告` : ''),
    })
  }

  const downloadSample = () => {
    const blob = new Blob([SAMPLE_CSV], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'glidepath_sample.csv'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const kindOptions = [
    { value: 'parametric' as const, label: 'パラメトリック' },
    { value: 'fixed' as const, label: '固定配分' },
    ...(gp.weights_table ? [{ value: 'weights_table' as const, label: 'CSV' }] : []),
  ]

  return (
    <Section title="グライドパス" badge={gp.gp_type === 'through' && gp.kind === 'parametric' ? 'Through型' : gp.kind === 'parametric' ? 'To型' : undefined}>
      <div className="-mb-1 rounded-lg border border-ink/10 bg-white/60 px-2 pt-1">
        <MiniGlidepath gp={gp} currentAge={person.current_age} endAge={person.end_age} targetAge={person.target_age} />
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[11px] font-medium text-ink2">プリセット(説明用の例・推奨値ではありません)</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {GP_PRESETS.map((p) => (
            <button
              key={p.id}
              title={p.description}
              className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                gp.name === p.label ? 'border-accent bg-accent/10 font-semibold text-accent-deep' : 'border-ink/10 bg-surface text-ink2 hover:border-ink/25'
              }`}
              onClick={() => applyPreset(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <SegField value={gp.kind} onChange={(v) => setGlidepath({ kind: v })} options={kindOptions} label="定義タイプ" />

      {gp.kind === 'parametric' && (
        <>
          <SegField
            label="設計タイプ(FR-GP-03)"
            value={gp.gp_type}
            onChange={(v) => setGlidepath({ gp_type: v })}
            options={[
              { value: 'to', label: 'To型(着地後固定)' },
              { value: 'through', label: 'Through型(継続逓減)' },
            ]}
          />
          <SelectField
            label="逓減カーブ(FR-GP-02)"
            value={gp.curve}
            onChange={(v) => setGlidepath({ curve: v as CurveKind })}
            options={[
              { value: 'linear', label: '線形(linear)' },
              { value: 'step', label: 'ステップ(5年刻み等)' },
              { value: 'exponential', label: '指数(exponential)' },
              { value: 'logistic', label: 'ロジスティック(logistic)' },
              { value: 'table', label: 'テーブル(年齢×比率)' },
            ]}
          />
          {gp.curve !== 'table' && (
            <>
              <SliderField label="開始リスク資産比率 w_start" value={gp.risky_start} onChange={(v) => setGlidepath({ risky_start: v })} min={0} max={1} step={0.05} fmt={(v) => fmtPct(v, 0)} />
              <SliderField label="最終リスク資産比率 w_end" value={gp.risky_end} onChange={(v) => setGlidepath({ risky_end: v })} min={0} max={1} step={0.05} fmt={(v) => fmtPct(v, 0)} />
              <div className="grid grid-cols-2 gap-2">
                <NumField label="逓減開始年齢" value={gp.decline_begin_age} onChange={(v) => setGlidepath({ decline_begin_age: v })} min={20} max={90} unit="歳" />
                <NumField label="逓減終了年齢" value={gp.decline_end_age} onChange={(v) => setGlidepath({ decline_end_age: v })} min={20} max={95} unit="歳" />
              </div>
              {gp.curve === 'step' && (
                <NumField label="ステップ幅" value={gp.step_years} onChange={(v) => setGlidepath({ step_years: v })} min={1} max={10} unit="年" />
              )}
              {(gp.curve === 'exponential' || gp.curve === 'logistic') && (
                <NumField label="形状パラメータ" value={gp.curve_shape} onChange={(v) => setGlidepath({ curve_shape: v })} min={0.5} max={12} step={0.5} hint="大きいほど急峻" />
              )}
              {gp.gp_type === 'through' && (
                <div className="grid grid-cols-2 gap-2">
                  <NumField label="第2逓減終了年齢" value={gp.decline_end2_age} onChange={(v) => setGlidepath({ decline_end2_age: v })} min={gp.decline_end_age} max={95} unit="歳" />
                  <NumField
                    label="最終比率 w_final"
                    value={Math.round(gp.risky_final * 100)}
                    onChange={(v) => setGlidepath({ risky_final: v / 100 })}
                    min={0}
                    max={100}
                    unit="%"
                  />
                </div>
              )}
            </>
          )}
          {gp.curve === 'table' && (
            <div className="space-y-1.5">
              <span className="text-[11px] font-medium text-ink2">年齢×リスク資産比率テーブル</span>
              {gp.risky_table.map((row, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input
                    type="number"
                    className="w-20 rounded border border-ink/10 bg-white px-1.5 py-1 text-[12px] tnum outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                    value={row.age}
                    onChange={(e) => {
                      const t = gp.risky_table.slice()
                      t[i] = { ...t[i], age: Number(e.target.value) }
                      setGlidepath({ risky_table: t })
                    }}
                  />
                  <span className="text-[10px] text-muted">歳</span>
                  <input
                    type="number"
                    className="w-20 rounded border border-ink/10 bg-white px-1.5 py-1 text-[12px] tnum outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                    value={Math.round(row.risky * 100)}
                    min={0}
                    max={100}
                    onChange={(e) => {
                      const t = gp.risky_table.slice()
                      t[i] = { ...t[i], risky: Number(e.target.value) / 100 }
                      setGlidepath({ risky_table: t })
                    }}
                  />
                  <span className="text-[10px] text-muted">%</span>
                  <button
                    className="ml-auto rounded px-1.5 py-0.5 text-[11px] text-muted hover:bg-page hover:text-critical"
                    onClick={() => setGlidepath({ risky_table: gp.risky_table.filter((_, j) => j !== i) })}
                    aria-label="行を削除"
                  >
                    削除
                  </button>
                </div>
              ))}
              <button
                className="rounded-md border border-dashed border-ink/20 px-2 py-1 text-[11px] text-ink2 hover:border-accent hover:text-accent-deep"
                onClick={() =>
                  setGlidepath({
                    risky_table: [...gp.risky_table, { age: (gp.risky_table[gp.risky_table.length - 1]?.age ?? 40) + 10, risky: 0.3 }],
                  })
                }
              >
                + 行を追加
              </button>
            </div>
          )}
        </>
      )}

      {gp.kind === 'fixed' && (
        <SliderField label="固定リスク資産比率(UC-06 対比用)" value={gp.fixed_risky} onChange={(v) => setGlidepath({ fixed_risky: v })} min={0} max={1} step={0.05} fmt={(v) => fmtPct(v, 0)} />
      )}

      {gp.kind === 'weights_table' && gp.weights_table && (
        <div className="rounded-lg border border-ink/10 bg-page/60 p-2.5 text-[11px] text-ink2">
          <div className="font-medium text-ink">{gp.name}</div>
          <div className="mt-0.5 text-muted">
            取込元: {gp.imported_from} / {gp.weights_table.length}行({gp.weights_table[0].age}〜{gp.weights_table[gp.weights_table.length - 1].age}歳)
          </div>
        </div>
      )}

      {gp.kind !== 'weights_table' && (
        <div>
          <button className="text-[11px] font-medium text-accent-deep hover:underline" onClick={() => setShowSplits(!showSplits)}>
            {showSplits ? '▾' : '▸'} 資産クラス内訳(FR-GP-04)
          </button>
          {showSplits && (
            <div className="mt-2 space-y-2">
              <SegField
                value={gp.split_mode}
                onChange={(v) => setGlidepath({ split_mode: v })}
                options={[
                  { value: 'fixed', label: '固定分割' },
                  { value: 'age_linked', label: '年齢依存分割' },
                ]}
              />
              <SplitEditor title={gp.split_mode === 'age_linked' ? 'リスク資産内訳(逓減開始時)' : 'リスク資産内訳'} keys={RISKY_KEYS} split={gp.risky_split} onChange={(s) => setGlidepath({ risky_split: { ...gp.risky_split, ...s } })} />
              <SplitEditor title={gp.split_mode === 'age_linked' ? '安全資産内訳(逓減開始時)' : '安全資産内訳'} keys={SAFE_KEYS} split={gp.safe_split} onChange={(s) => setGlidepath({ safe_split: { ...gp.safe_split, ...s } })} />
              {gp.split_mode === 'age_linked' && (
                <>
                  <SplitEditor title="リスク資産内訳(逓減終了時)" keys={RISKY_KEYS} split={gp.risky_split_end} onChange={(s) => setGlidepath({ risky_split_end: { ...gp.risky_split_end, ...s } })} />
                  <SplitEditor title="安全資産内訳(逓減終了時)" keys={SAFE_KEYS} split={gp.safe_split_end} onChange={(s) => setGlidepath({ safe_split_end: { ...gp.safe_split_end, ...s } })} />
                </>
              )}
            </div>
          )}
        </div>
      )}

      <div className="rounded-lg border border-dashed border-ink/15 p-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-ink2">既存商品CSVの取込(FR-GP-05)</span>
          <button className="text-[10.5px] text-accent-deep hover:underline" onClick={downloadSample}>
            サンプルCSV
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void onFile(f)
            e.target.value = ''
          }}
        />
        <button
          className="mt-1.5 w-full rounded-md border border-ink/10 bg-surface py-1.5 text-[11.5px] text-ink2 transition-colors hover:border-accent hover:text-accent-deep"
          onClick={() => fileRef.current?.click()}
        >
          CSVファイルを選択…
        </button>
        {csvMsg && (
          <p className={`mt-1.5 text-[10.5px] ${csvMsg.kind === 'error' ? 'text-critical' : 'text-goodtext'}`}>{csvMsg.text}</p>
        )}
      </div>
    </Section>
  )
}
