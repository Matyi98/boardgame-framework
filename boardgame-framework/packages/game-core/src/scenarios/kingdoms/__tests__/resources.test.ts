import { describe, it, expect } from 'vitest';
import { canExchange, executeExchange, exchangeForFood } from '../resources.js';
import { EXCHANGE_RATE } from '../economy.js';
import { Inventory } from '../../../resources/inventory.js';

function inv(gold: number, food = 0, wood = 0, iron = 0): Inventory {
  const i = new Inventory();
  if (gold > 0) i.add('gold', gold);
  if (food > 0) i.add('food', food);
  if (wood > 0) i.add('wood', wood);
  if (iron > 0) i.add('iron', iron);
  return i;
}

// ── EXCHANGE_RATE ─────────────────────────────────────────────────────────────

describe('EXCHANGE_RATE', () => {
  it('is a positive integer', () => {
    expect(EXCHANGE_RATE).toBeGreaterThan(0);
    expect(Number.isInteger(EXCHANGE_RATE)).toBe(true);
  });
});

// ── canExchange ───────────────────────────────────────────────────────────────

describe('canExchange', () => {
  it('returns true when gold >= qty × EXCHANGE_RATE', () => {
    const i = inv(EXCHANGE_RATE * 3);
    expect(canExchange(i, 'food', 3)).toBe(true);
  });

  it('returns true for exact gold amount', () => {
    const i = inv(EXCHANGE_RATE);
    expect(canExchange(i, 'wood', 1)).toBe(true);
  });

  it('returns false when gold is insufficient', () => {
    const i = inv(EXCHANGE_RATE - 1);
    expect(canExchange(i, 'iron', 1)).toBe(false);
  });

  it('returns false with zero gold', () => {
    expect(canExchange(inv(0), 'food', 1)).toBe(false);
  });

  it('resource parameter does not change outcome (all same rate)', () => {
    const i = inv(EXCHANGE_RATE);
    expect(canExchange(i, 'wood', 1)).toBe(canExchange(i, 'food', 1));
    expect(canExchange(i, 'iron', 1)).toBe(canExchange(i, 'food', 1));
  });
});

// ── executeExchange ───────────────────────────────────────────────────────────

describe('executeExchange', () => {
  it('deducts gold and adds resource', () => {
    const i = inv(EXCHANGE_RATE * 2);
    executeExchange(i, 'food', 2);
    expect(i.get('gold')).toBe(0);
    expect(i.get('food')).toBe(2);
  });

  it('works for any resource type', () => {
    const i = inv(EXCHANGE_RATE);
    executeExchange(i, 'wood', 1);
    expect(i.get('wood')).toBe(1);
    expect(i.get('gold')).toBe(0);
  });

  it('does nothing when qty is 0', () => {
    const i = inv(10);
    executeExchange(i, 'food', 0);
    expect(i.get('gold')).toBe(10);
    expect(i.get('food')).toBe(0);
  });

  it('throws when gold is insufficient', () => {
    const i = inv(0);
    expect(() => executeExchange(i, 'food', 1)).toThrow();
  });
});

// ── exchangeForFood ───────────────────────────────────────────────────────────

describe('exchangeForFood', () => {
  it('buys exactly the needed food when gold is sufficient', () => {
    const i = inv(EXCHANGE_RATE * 5);
    const bought = exchangeForFood(i, 3);
    expect(bought).toBe(3);
    expect(i.get('food')).toBe(3);
    expect(i.get('gold')).toBe(EXCHANGE_RATE * 2);
  });

  it('buys as much as possible when gold is short', () => {
    const i = inv(EXCHANGE_RATE * 2); // can only afford 2
    const bought = exchangeForFood(i, 5);
    expect(bought).toBe(2);
    expect(i.get('food')).toBe(2);
    expect(i.get('gold')).toBe(0);
  });

  it('returns 0 and does not throw when no gold', () => {
    const i = inv(0);
    const bought = exchangeForFood(i, 3);
    expect(bought).toBe(0);
    expect(i.get('food')).toBe(0);
  });

  it('returns 0 when foodNeeded is 0', () => {
    const i = inv(EXCHANGE_RATE * 10);
    const bought = exchangeForFood(i, 0);
    expect(bought).toBe(0);
    expect(i.get('gold')).toBe(EXCHANGE_RATE * 10); // untouched
  });

  it('returns 0 when foodNeeded is negative', () => {
    const i = inv(EXCHANGE_RATE * 10);
    const bought = exchangeForFood(i, -1);
    expect(bought).toBe(0);
  });

  it('buys whole units only (floors to affordable integer)', () => {
    // EXCHANGE_RATE * 2.5 gold → can afford 2 food
    const i = inv(Math.floor(EXCHANGE_RATE * 2.5));
    const bought = exchangeForFood(i, 10);
    expect(bought).toBe(2);
  });
});
