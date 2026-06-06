import { describe, it, expect } from 'vitest';
import {
  calculateTileIncome,
  calculateFoodConsumption,
  calculateStructureFoodCost,
  calculateGoldIncome,
  BASE_RESOURCE_YIELD,
  GOLD_PER_ECONOMIC_VALUE,
  STRUCTURE_INCOME_EFFECTS,
} from '../economy.js';

// ── Tile factory ──────────────────────────────────────────────────────────────

function tile(economicValue: number, resourceType: string | null) {
  return { properties: { economicValue, resourceType } };
}

const PLAINS_CENTER  = tile(5, 'food');
const PLAINS_EDGE    = tile(1, 'food');
const FOREST_MIDDLE  = tile(3, 'wood');
const HILLS_MIDDLE   = tile(3, 'iron');
const NO_RESOURCE    = tile(4, null);

// ── calculateTileIncome — no structure ───────────────────────────────────────

describe('calculateTileIncome — bare tile', () => {
  it('produces gold equal to economicValue × GOLD_PER_ECONOMIC_VALUE', () => {
    const inc = calculateTileIncome(PLAINS_CENTER, []);
    expect(inc.gold).toBe(5 * GOLD_PER_ECONOMIC_VALUE);
  });

  it('produces BASE_RESOURCE_YIELD of the tile resourceType', () => {
    const inc = calculateTileIncome(PLAINS_CENTER, []);
    expect(inc.resource).toBe('food');
    expect(inc.resourceAmount).toBe(BASE_RESOURCE_YIELD);
  });

  it('produces no resource when resourceType is null', () => {
    const inc = calculateTileIncome(NO_RESOURCE, []);
    expect(inc.resource).toBeNull();
    expect(inc.resourceAmount).toBe(0);
  });

  it('edge tile (economicValue=1) still produces gold', () => {
    const inc = calculateTileIncome(PLAINS_EDGE, []);
    expect(inc.gold).toBe(1 * GOLD_PER_ECONOMIC_VALUE);
    expect(inc.resource).toBe('food');
  });

  it('defaults economicValue to 1 when properties are missing', () => {
    const inc = calculateTileIncome({}, []);
    expect(inc.gold).toBe(1);
  });
});

// ── calculateTileIncome — capital-base ───────────────────────────────────────

describe('calculateTileIncome — capital-base', () => {
  it('adds goldFlat=1 bonus on top of tile gold', () => {
    const inc = calculateTileIncome(PLAINS_CENTER, ['capital-base']);
    expect(inc.gold).toBe(5 * GOLD_PER_ECONOMIC_VALUE + 1); // economicValue + goldFlat
  });

  it('does not multiply resource', () => {
    const inc = calculateTileIncome(PLAINS_CENTER, ['capital-base']);
    expect(inc.resource).toBe('food');
    expect(inc.resourceAmount).toBe(BASE_RESOURCE_YIELD); // unchanged
  });
});

// ── calculateTileIncome — farm ────────────────────────────────────────────────

describe('calculateTileIncome — farm', () => {
  it('multiplies resource yield by 1.5 (floored)', () => {
    const withoutFarm = calculateTileIncome(PLAINS_CENTER, []);
    const withFarm    = calculateTileIncome(PLAINS_CENTER, ['farm']);
    expect(withFarm.resourceAmount).toBe(Math.floor(BASE_RESOURCE_YIELD * 1.5));
    expect(withFarm.resourceAmount).toBeGreaterThan(withoutFarm.resourceAmount);
  });

  it('does not affect gold income', () => {
    const withoutFarm = calculateTileIncome(PLAINS_CENTER, []);
    const withFarm    = calculateTileIncome(PLAINS_CENTER, ['farm']);
    expect(withFarm.gold).toBe(withoutFarm.gold);
  });

  it('farm on non-food tile multiplies that tile resource', () => {
    const inc = calculateTileIncome(FOREST_MIDDLE, ['farm']);
    expect(inc.resource).toBe('wood');
    expect(inc.resourceAmount).toBe(Math.floor(BASE_RESOURCE_YIELD * 1.5));
  });

  it('farm on null-resource tile produces no resource', () => {
    const inc = calculateTileIncome(NO_RESOURCE, ['farm']);
    expect(inc.resource).toBeNull();
    expect(inc.resourceAmount).toBe(0);
  });
});

// ── calculateTileIncome — city ────────────────────────────────────────────────

describe('calculateTileIncome — city', () => {
  it('doubles gold income', () => {
    const withoutCity = calculateTileIncome(PLAINS_CENTER, []);
    const withCity    = calculateTileIncome(PLAINS_CENTER, ['city']);
    expect(withCity.gold).toBe(withoutCity.gold * 2);
  });

  it('does not affect resource yield', () => {
    const withoutCity = calculateTileIncome(PLAINS_CENTER, []);
    const withCity    = calculateTileIncome(PLAINS_CENTER, ['city']);
    expect(withCity.resourceAmount).toBe(withoutCity.resourceAmount);
  });
});

// ── calculateTileIncome — castle and gate ─────────────────────────────────────

describe('calculateTileIncome — defense structures', () => {
  it('castle provides no income effect', () => {
    const bare   = calculateTileIncome(HILLS_MIDDLE, []);
    const castle = calculateTileIncome(HILLS_MIDDLE, ['castle']);
    expect(castle.gold).toBe(bare.gold);
    expect(castle.resourceAmount).toBe(bare.resourceAmount);
  });

  it('gate provides no income effect', () => {
    const bare = calculateTileIncome(FOREST_MIDDLE, []);
    const gate = calculateTileIncome(FOREST_MIDDLE, ['gate']);
    expect(gate.gold).toBe(bare.gold);
    expect(gate.resourceAmount).toBe(bare.resourceAmount);
  });
});

// ── calculateFoodConsumption ──────────────────────────────────────────────────

describe('calculateFoodConsumption', () => {
  it('returns 0 for no units', () => {
    expect(calculateFoodConsumption([])).toBe(0);
  });

  it('sums foodPerRound for spearmen (1 each)', () => {
    expect(calculateFoodConsumption(['spearman', 'spearman', 'spearman'])).toBe(3);
  });

  it('sums foodPerRound for cannoneers (2 each)', () => {
    expect(calculateFoodConsumption(['cannoneer', 'cannoneer'])).toBe(4);
  });

  it('handles mixed unit types', () => {
    // spearman=1, cannoneer=2, noble=1
    expect(calculateFoodConsumption(['spearman', 'cannoneer', 'noble'])).toBe(4);
  });

  it('returns 0 for unknown unit kind', () => {
    expect(calculateFoodConsumption(['unknown-unit'])).toBe(0);
  });
});

// ── calculateStructureFoodCost ────────────────────────────────────────────────

describe('calculateStructureFoodCost', () => {
  it('returns 0 with no structures', () => {
    expect(calculateStructureFoodCost([])).toBe(0);
  });

  it('returns 0 for structures that do not consume food', () => {
    expect(calculateStructureFoodCost(['capital-base', 'farm', 'castle', 'gate'])).toBe(0);
  });

  it('returns 2 for each city', () => {
    expect(calculateStructureFoodCost(['city'])).toBe(2);
    expect(calculateStructureFoodCost(['city', 'city'])).toBe(4);
    expect(calculateStructureFoodCost(['city', 'city', 'city'])).toBe(6);
  });

  it('handles mixed structure types correctly', () => {
    // 2 cities (4 food) + farm, castle (0 food each) = 4
    expect(calculateStructureFoodCost(['city', 'farm', 'city', 'castle'])).toBe(4);
  });

  it('returns 0 for unknown structure kind', () => {
    expect(calculateStructureFoodCost(['unknown-structure'])).toBe(0);
  });
});

// ── calculateGoldIncome ───────────────────────────────────────────────────────

describe('calculateGoldIncome', () => {
  const tiles = [
    { id: 't1', properties: { economicValue: 5, resourceType: 'food' } },
    { id: 't2', properties: { economicValue: 3, resourceType: 'wood' } },
    { id: 't3', properties: { economicValue: 1, resourceType: 'iron' } },
  ];

  it('sums gold from all connected tiles with no structures', () => {
    const gold = calculateGoldIncome(tiles, new Map());
    expect(gold).toBe(5 + 3 + 1); // sum of economicValues
  });

  it('applies structure bonuses per tile', () => {
    const structures = new Map([['t1', ['city']]]);
    const gold = calculateGoldIncome(tiles, structures);
    // t1 with city: 5×2=10; t2: 3; t3: 1 → total 14
    expect(gold).toBe(10 + 3 + 1);
  });

  it('returns 0 for empty connected tiles', () => {
    expect(calculateGoldIncome([], new Map())).toBe(0);
  });

  it('capital-base flat bonus contributes per tile', () => {
    const structures = new Map([['t2', ['capital-base']]]);
    const gold = calculateGoldIncome(tiles, structures);
    // t1:5, t2:3+1=4, t3:1 → total 10
    expect(gold).toBe(5 + 4 + 1);
  });
});

// ── STRUCTURE_INCOME_EFFECTS completeness ─────────────────────────────────────

describe('STRUCTURE_INCOME_EFFECTS coverage', () => {
  const expectedKinds = ['capital-base', 'farm', 'city', 'castle', 'gate'];

  for (const kind of expectedKinds) {
    it(`has an entry for ${kind}`, () => {
      expect(STRUCTURE_INCOME_EFFECTS[kind]).toBeDefined();
    });
  }
});
