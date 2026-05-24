/**
 * Abstract source of randomness. The framework never uses Math.random()
 * directly — everything routes through RandomSource so games are reproducible
 * given a seed (essential for replay, debugging and unit tests).
 */
export interface RandomSource {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max] inclusive. */
  intInRange(min: number, max: number): number;
}

/** Deterministic xorshift32. Tiny, fast, good enough for board games. */
export class SeededRandom implements RandomSource {
  private state: number;

  constructor(seed: number) {
    this.state = seed | 0;
    if (this.state === 0) this.state = 1; // xorshift dies on zero
  }

  next(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x | 0;
    // Map to [0, 1)
    return ((x >>> 0) / 0x1_0000_0000);
  }

  intInRange(min: number, max: number): number {
    if (max < min) throw new Error('max < min');
    return min + Math.floor(this.next() * (max - min + 1));
  }
}
