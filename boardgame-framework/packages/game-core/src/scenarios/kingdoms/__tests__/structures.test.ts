import { describe, it, expect } from 'vitest';
import {
  STRUCTURE_DEFS,
  STRUCTURE_KINDS,
  BUILDABLE_STRUCTURES,
  type StructureKind,
} from '../structures.js';
import { STRUCTURE_INCOME_EFFECTS } from '../economy.js';
import { STRUCTURE_STATS } from '../pieces.js';

// ── STRUCTURE_DEFS completeness ───────────────────────────────────────────────

const EXPECTED_KINDS: StructureKind[] = ['capital-base', 'farm', 'city', 'castle', 'gate'];

describe('STRUCTURE_DEFS — completeness', () => {
  for (const kind of EXPECTED_KINDS) {
    it(`has a definition for ${kind}`, () => {
      expect(STRUCTURE_DEFS[kind]).toBeDefined();
      expect(STRUCTURE_DEFS[kind]!.kind).toBe(kind);
    });
  }

  it('every def has all required fields', () => {
    for (const def of Object.values(STRUCTURE_DEFS)) {
      expect(typeof def.displayName).toBe('string');
      expect(typeof def.hp).toBe('number');
      expect(def.hp).toBeGreaterThan(0);
      expect(typeof def.defenseMultiplier).toBe('number');
      expect(def.defenseMultiplier).toBeGreaterThanOrEqual(1.0);
      expect(typeof def.foodCostPerRound).toBe('number');
      expect(def.foodCostPerRound).toBeGreaterThanOrEqual(0);
      expect(typeof def.canBeBuilt).toBe('boolean');
      expect(def.incomeEffect).toBeDefined();
    }
  });
});

// ── STRUCTURE_KINDS / BUILDABLE_STRUCTURES ────────────────────────────────────

describe('STRUCTURE_KINDS', () => {
  it('includes all five kinds', () => {
    for (const kind of EXPECTED_KINDS) {
      expect(STRUCTURE_KINDS.has(kind)).toBe(true);
    }
  });
});

describe('BUILDABLE_STRUCTURES', () => {
  it('does NOT include capital-base (placed by setup)', () => {
    expect(BUILDABLE_STRUCTURES.has('capital-base')).toBe(false);
  });

  it('includes farm, city, castle, gate', () => {
    expect(BUILDABLE_STRUCTURES.has('farm')).toBe(true);
    expect(BUILDABLE_STRUCTURES.has('city')).toBe(true);
    expect(BUILDABLE_STRUCTURES.has('castle')).toBe(true);
    expect(BUILDABLE_STRUCTURES.has('gate')).toBe(true);
  });
});

// ── Specific balance values ───────────────────────────────────────────────────

describe('capital-base', () => {
  const def = STRUCTURE_DEFS['capital-base'];

  it('has defenseMultiplier = 2.0 (fortified starting position)', () => {
    expect(def.defenseMultiplier).toBe(2.0);
  });

  it('has limitPerPlayer = 1', () => {
    expect(def.limitPerPlayer).toBe(1);
  });

  it('has +1 gold flat income bonus', () => {
    expect(def.incomeEffect.goldFlat).toBe(1);
  });

  it('does not consume food', () => {
    expect(def.foodCostPerRound).toBe(0);
  });
});

describe('city', () => {
  const def = STRUCTURE_DEFS['city'];

  it('doubles gold income on its tile', () => {
    expect(def.incomeEffect.goldMultiplier).toBe(2.0);
  });

  it('consumes 2 food per round', () => {
    expect(def.foodCostPerRound).toBe(2);
  });

  it('has limitPerPlayer = 3', () => {
    expect(def.limitPerPlayer).toBe(3);
  });
});

describe('farm', () => {
  const def = STRUCTURE_DEFS['farm'];

  it('multiplies resource yield by 1.5', () => {
    expect(def.incomeEffect.resourceMultiplier).toBe(1.5);
  });

  it('does not affect gold multiplier', () => {
    expect(def.incomeEffect.goldMultiplier).toBe(1.0);
  });

  it('does not consume food', () => {
    expect(def.foodCostPerRound).toBe(0);
  });
});

describe('castle', () => {
  const def = STRUCTURE_DEFS['castle'];

  it('has defenseMultiplier = 2.0', () => {
    expect(def.defenseMultiplier).toBe(2.0);
  });

  it('has no income effect (all 1.0 multipliers, 0 flat)', () => {
    expect(def.incomeEffect.goldFlat).toBe(0);
    expect(def.incomeEffect.goldMultiplier).toBe(1.0);
    expect(def.incomeEffect.resourceMultiplier).toBe(1.0);
  });
});

describe('gate', () => {
  const def = STRUCTURE_DEFS['gate'];

  it('has no income effect', () => {
    expect(def.incomeEffect.goldFlat).toBe(0);
    expect(def.incomeEffect.goldMultiplier).toBe(1.0);
    expect(def.incomeEffect.resourceMultiplier).toBe(1.0);
  });

  it('has no per-player limit (unlimited)', () => {
    expect(def.limitPerPlayer).toBeUndefined();
  });
});

// ── Derived constants (economy.ts and pieces.ts both come from structures.ts) ─

describe('STRUCTURE_INCOME_EFFECTS derived from STRUCTURE_DEFS', () => {
  it('matches STRUCTURE_DEFS income effects for all structures', () => {
    for (const [kind, def] of Object.entries(STRUCTURE_DEFS)) {
      const effect = STRUCTURE_INCOME_EFFECTS[kind];
      expect(effect).toBeDefined();
      expect(effect!.goldFlat).toBe(def.incomeEffect.goldFlat);
      expect(effect!.goldMultiplier).toBe(def.incomeEffect.goldMultiplier);
      expect(effect!.resourceMultiplier).toBe(def.incomeEffect.resourceMultiplier);
    }
  });
});

describe('STRUCTURE_STATS derived from STRUCTURE_DEFS (via pieces.ts)', () => {
  it('matches STRUCTURE_DEFS hp and defenseMultiplier for all structures', () => {
    for (const [kind, def] of Object.entries(STRUCTURE_DEFS)) {
      const stats = STRUCTURE_STATS[kind];
      expect(stats).toBeDefined();
      expect(stats!.hp).toBe(def.hp);
      expect(stats!.defenseMultiplier).toBe(def.defenseMultiplier);
    }
  });
});
