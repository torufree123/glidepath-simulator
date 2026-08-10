// Web Worker エントリ — 計算層をUIスレッドから分離して実行する

import { runSimulation } from './engine'
import { runAccuracyTest } from './selftest'
import type { SimulationRequest } from './types'

export type WorkerInMsg =
  | { type: 'run'; token: number; req: SimulationRequest }
  | { type: 'selftest'; token: number; n_paths: number; seed: number }

export type WorkerOutMsg =
  | { type: 'progress'; token: number; pct: number }
  | { type: 'done'; token: number; result: unknown }
  | { type: 'selftest_done'; token: number; result: unknown }
  | { type: 'error'; token: number; message: string }

const post = (m: WorkerOutMsg) => (self as unknown as { postMessage(m: unknown): void }).postMessage(m)

self.onmessage = (e: MessageEvent<WorkerInMsg>) => {
  const msg = e.data
  try {
    if (msg.type === 'run') {
      const result = runSimulation(msg.req, (pct) => post({ type: 'progress', token: msg.token, pct }))
      post({ type: 'done', token: msg.token, result })
    } else if (msg.type === 'selftest') {
      const result = runAccuracyTest(msg.n_paths, msg.seed)
      post({ type: 'selftest_done', token: msg.token, result })
    }
  } catch (err) {
    post({ type: 'error', token: msg.token, message: err instanceof Error ? err.message : String(err) })
  }
}
