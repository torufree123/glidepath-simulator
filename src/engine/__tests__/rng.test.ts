import { describe, expect, it } from 'vitest'
import { PCG32, add64, mul64 } from '../rng'

const MASK64 = (1n << 64n) - 1n

/** BigInt による PCG32 参照実装(アルゴリズム定義そのもの) */
class RefPCG32 {
  static MUL = 6364136223846793005n
  state: bigint
  inc: bigint
  constructor(seed: bigint, seq: bigint) {
    this.inc = ((seq << 1n) | 1n) & MASK64
    this.state = 0n
    this.step()
    this.state = (this.state + seed) & MASK64
    this.step()
  }
  step() {
    this.state = (this.state * RefPCG32.MUL + this.inc) & MASK64
  }
  next(): number {
    const old = this.state
    this.step()
    const xorshifted = Number((((old >> 18n) ^ old) >> 27n) & 0xffffffffn)
    const rot = Number(old >> 59n)
    return ((xorshifted >>> rot) | (xorshifted << ((32 - rot) & 31))) >>> 0
  }
}

describe('64bit リム演算', () => {
  it('mul64 / add64 が BigInt と一致する(ランダム1000ケース)', () => {
    const out = new Uint32Array(2)
    for (let i = 0; i < 1000; i++) {
      const aHi = (Math.random() * 0x100000000) >>> 0
      const aLo = (Math.random() * 0x100000000) >>> 0
      const bHi = (Math.random() * 0x100000000) >>> 0
      const bLo = (Math.random() * 0x100000000) >>> 0
      const a = (BigInt(aHi) << 32n) | BigInt(aLo)
      const b = (BigInt(bHi) << 32n) | BigInt(bLo)

      mul64(aHi, aLo, bHi, bLo, out)
      const refMul = (a * b) & MASK64
      expect((BigInt(out[0]) << 32n) | BigInt(out[1])).toBe(refMul)

      add64(aHi, aLo, bHi, bLo, out)
      const refAdd = (a + b) & MASK64
      expect((BigInt(out[0]) << 32n) | BigInt(out[1])).toBe(refAdd)
    }
  })
})

describe('PCG32(FR-SIM-02: シード指定で完全再現)', () => {
  it('BigInt 参照実装と完全一致する(複数シード×1000出力)', () => {
    for (const seed of [0, 1, 42, 20260808, 987654321, Number.MAX_SAFE_INTEGER]) {
      const impl = new PCG32(seed)
      const ref = new RefPCG32(BigInt(seed), 54n)
      for (let i = 0; i < 1000; i++) {
        expect(impl.next()).toBe(ref.next())
      }
    }
  })

  it('既知のテストベクトルと一致する(seed=42, seq=54 — PCG公式デモ)', () => {
    const impl = new PCG32(42, 54)
    const expected = [0xa15c02b7, 0x7b47f409, 0xba1d3330, 0x83d2f293, 0xbfa4784b, 0xcbed606e]
    for (const e of expected) expect(impl.next()).toBe(e)
  })

  it('同一シードで同一系列、異なるシードで異なる系列', () => {
    const a1 = new PCG32(123)
    const a2 = new PCG32(123)
    const b = new PCG32(124)
    const s1 = Array.from({ length: 20 }, () => a1.next())
    const s2 = Array.from({ length: 20 }, () => a2.next())
    const s3 = Array.from({ length: 20 }, () => b.next())
    expect(s1).toEqual(s2)
    expect(s1).not.toEqual(s3)
  })

  it('正規乱数の平均・分散・歪度が理論値に収束する', () => {
    const rng = new PCG32(7)
    const n = 200000
    let sum = 0
    let sum2 = 0
    let sum3 = 0
    for (let i = 0; i < n; i++) {
      const x = rng.nextNormal()
      sum += x
      sum2 += x * x
      sum3 += x * x * x
    }
    const mean = sum / n
    const varc = sum2 / n - mean * mean
    expect(Math.abs(mean)).toBeLessThan(0.01)
    expect(Math.abs(varc - 1)).toBeLessThan(0.02)
    expect(Math.abs(sum3 / n)).toBeLessThan(0.05)
  })
})
