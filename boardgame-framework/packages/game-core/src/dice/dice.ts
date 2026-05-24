import { RandomSource } from './random.js';

export interface DieRoll {
  readonly sides: number;
  readonly value: number;
}

export interface DiceResult {
  readonly rolls: ReadonlyArray<DieRoll>;
  readonly sum: number;
}

/** Roll N dice of M sides each, using the given RandomSource. */
export function rollDice(rng: RandomSource, count: number, sides: number): DiceResult {
  if (count <= 0) throw new Error('count must be > 0');
  if (sides <= 1) throw new Error('sides must be > 1');
  const rolls: DieRoll[] = [];
  let sum = 0;
  for (let i = 0; i < count; i++) {
    const v = rng.intInRange(1, sides);
    rolls.push({ sides, value: v });
    sum += v;
  }
  return { rolls, sum };
}
