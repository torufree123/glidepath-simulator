// 乱数生成器 — PCG ファミリー(FR-SIM-02)
//
// ブラウザ実装のため PCG32(XSH-RR、64bit状態)を 32bit 整数演算で実装する。
// (仕様書は PCG64 を指定。NumPy PCG64 とのビット互換はないが、
//  (engine_version, seed) の組での完全再現性は本実装で保証される。README 参照)
//
// 64bit 演算は 16bit リムに分解して Math.imul / 浮動小数で正確に計算する。
// テストで BigInt 参照実装との完全一致を検証している。

const MUL_HI = 0x5851f42d // 6364136223846793005 の上位32bit
const MUL_LO = 0x4c957f2d // 下位32bit

/** 64bit 乗算 (mod 2^64)。out[0]=hi, out[1]=lo */
export function mul64(aHi: number, aLo: number, bHi: number, bLo: number, out: Uint32Array): void {
  const aL = aLo & 0xffff
  const aH = aLo >>> 16
  const bL = bLo & 0xffff
  const bH = bLo >>> 16
  const ll = aL * bL
  const mid = aL * bH + aH * bL // < 2^33、倍精度で正確
  const hh = aH * bH
  const lo64 = ll + mid * 65536 // < 2^50、正確
  const carry = Math.floor(lo64 / 4294967296)
  out[1] = lo64 >>> 0
  out[0] = (hh + carry + Math.imul(aHi, bLo) + Math.imul(aLo, bHi)) >>> 0
}

/** 64bit 加算 (mod 2^64)。out[0]=hi, out[1]=lo */
export function add64(aHi: number, aLo: number, bHi: number, bLo: number, out: Uint32Array): void {
  const lo = (aLo >>> 0) + (bLo >>> 0)
  out[1] = lo >>> 0
  out[0] = (aHi + bHi + (lo > 0xffffffff ? 1 : 0)) >>> 0
}

export class PCG32 {
  private sHi = 0
  private sLo = 0
  private incHi = 0
  private incLo = 0
  private spare: number | null = null
  private tmp = new Uint32Array(2)

  /**
   * @param seed 初期状態(JS安全整数)。実行パラメータとして保存し完全再現に用いる。
   * @param seq  ストリーム番号(既定 54)
   */
  constructor(seed: number, seq = 54) {
    const seedHi = Math.floor(Math.abs(seed) / 4294967296) >>> 0
    const seedLo = Math.abs(seed) >>> 0
    const seqHi = Math.floor(Math.abs(seq) / 4294967296) >>> 0
    const seqLo = Math.abs(seq) >>> 0
    // pcg32_srandom: inc = (seq << 1) | 1; state = 0; step; state += seed; step
    this.incHi = ((seqHi << 1) | (seqLo >>> 31)) >>> 0
    this.incLo = ((seqLo << 1) | 1) >>> 0
    this.sHi = 0
    this.sLo = 0
    this.step()
    add64(this.sHi, this.sLo, seedHi, seedLo, this.tmp)
    this.sHi = this.tmp[0]
    this.sLo = this.tmp[1]
    this.step()
  }

  private step(): void {
    mul64(this.sHi, this.sLo, MUL_HI, MUL_LO, this.tmp)
    add64(this.tmp[0], this.tmp[1], this.incHi, this.incLo, this.tmp)
    this.sHi = this.tmp[0]
    this.sLo = this.tmp[1]
  }

  /** 一様32bit整数(PCG32 XSH-RR 出力関数) */
  next(): number {
    const oldHi = this.sHi
    const oldLo = this.sLo
    this.step()
    // xorshifted = ((old >> 18) ^ old) >> 27 の下位32bit
    const xHi = (oldHi ^ (oldHi >>> 18)) >>> 0
    const xLo = (oldLo ^ (((oldHi << 14) | (oldLo >>> 18)) >>> 0)) >>> 0
    const xorshifted = ((xHi << 5) | (xLo >>> 27)) >>> 0
    const rot = oldHi >>> 27 // 64bit 状態の上位5bit
    return ((xorshifted >>> rot) | (xorshifted << ((32 - rot) & 31))) >>> 0
  }

  /** (0,1) の一様乱数 */
  nextFloat(): number {
    return (this.next() + 0.5) * 2.3283064365386963e-10 // / 2^32
  }

  /** 標準正規乱数(Marsaglia の polar 法、スペア値キャッシュ付き) */
  nextNormal(): number {
    if (this.spare !== null) {
      const v = this.spare
      this.spare = null
      return v
    }
    let u: number, v: number, s: number
    do {
      u = 2 * this.nextFloat() - 1
      v = 2 * this.nextFloat() - 1
      s = u * u + v * v
    } while (s >= 1 || s === 0)
    const m = Math.sqrt((-2 * Math.log(s)) / s)
    this.spare = v * m
    return u * m
  }
}
