// エンジンWorkerクライアント — 実行のトークン管理とキャンセル(terminate & respawn)

import type { SimulationRequest, SimulationResult } from '../engine/types'
import type { AccuracyResult } from '../engine/selftest'
import type { WorkerOutMsg } from '../engine/worker'

type Pending = {
  resolve: (v: unknown) => void
  reject: (e: Error) => void
  onProgress?: (pct: number) => void
}

class EngineWorkerClient {
  private worker: Worker | null = null
  private tokenSeq = 0
  private pending = new Map<number, Pending>()

  private ensure(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('../engine/worker.ts', import.meta.url), { type: 'module' })
      this.worker.onmessage = (e: MessageEvent<WorkerOutMsg>) => {
        const msg = e.data
        const p = this.pending.get(msg.token)
        if (!p) return
        if (msg.type === 'progress') {
          p.onProgress?.(msg.pct)
        } else if (msg.type === 'done' || msg.type === 'selftest_done') {
          this.pending.delete(msg.token)
          p.resolve(msg.result)
        } else if (msg.type === 'error') {
          this.pending.delete(msg.token)
          p.reject(new Error(msg.message))
        }
      }
      this.worker.onerror = (e) => {
        const err = new Error(e.message || 'Worker エラー')
        for (const p of this.pending.values()) p.reject(err)
        this.pending.clear()
      }
    }
    return this.worker
  }

  /** 実行中の計算をすべて破棄する(Worker を terminate して再生成) */
  cancelAll(): void {
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
    const err = new Error('cancelled')
    err.name = 'CancelledError'
    for (const p of this.pending.values()) p.reject(err)
    this.pending.clear()
  }

  run(req: SimulationRequest, onProgress?: (pct: number) => void): Promise<SimulationResult> {
    const token = ++this.tokenSeq
    const w = this.ensure()
    return new Promise<SimulationResult>((resolve, reject) => {
      this.pending.set(token, { resolve: (v) => resolve(v as SimulationResult), reject, onProgress })
      w.postMessage({ type: 'run', token, req })
    })
  }

  selftest(nPaths: number, seed: number): Promise<AccuracyResult> {
    const token = ++this.tokenSeq
    const w = this.ensure()
    return new Promise<AccuracyResult>((resolve, reject) => {
      this.pending.set(token, { resolve: (v) => resolve(v as AccuracyResult), reject })
      w.postMessage({ type: 'selftest', token, n_paths: nPaths, seed })
    })
  }
}

export const engineClient = new EngineWorkerClient()

export function isCancelled(e: unknown): boolean {
  return e instanceof Error && e.name === 'CancelledError'
}
