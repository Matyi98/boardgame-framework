import { describe, it, expect } from 'vitest';
import { computeIncome, computeFoodCost, chooseAttritionVictims } from '../income.js';
import { BASE_RESOURCE_YIELD } from '../economy.js';
import { MapBuilder } from '../../../map/map-builder.js';
import { makeUnitFromRegistry } from '../../../pieces/unit.js';
import { kingdomsPieces } from '../pieces.js';
import type { GameState } from '../../../state/game-state.js';

// ── Minimal state builder ─────────────────────────────────────────────────────
//
// We only construct the fields computeIncome/computeFoodCost actually read.
// TypeScript accepts the partial cast because we're only testing those paths.

function buildMap(tiles: Array<{ q: number; economicValue: number; resourceType: string | null }>) {
  const builder = new MapBuilder();
  for (const t of tiles) {
    builder.addTile({ q: t.q, r: 0 }, 'plains');
    builder.setTileProperties({ q: t.q, r: 0 }, { economicValue: t.economicValue, resourceType: t.resourceType });
  }
  return builder.build();
}

function minimalState(overrides: {
  ownership: Record<string, string>;
  capitals:  Record<string, string>;
  map: ReturnType<typeof buildMap>;
  pieces?: Map<string, { id: string; kind: string; owner: string; location: { kind: 'tile'; tileId: string }; stats?: Record<string, number> }>;
}): GameState {
  return {
    extras: {
      'k:ownership': overrides.ownership,
      'k:capitals':  overrides.capitals,
    },
    map:    overrides.map,
    pieces: (overrides.pieces ?? new Map()) as GameState['pieces'],
  } as unknown as GameState;
}

// ── computeIncome ─────────────────────────────────────────────────────────────

describe('computeIncome — basic', () => {
  const map = buildMap([
    { q: 0, economicValue: 5, resourceType: 'food' },
    { q: 1, economicValue: 3, resourceType: 'wood' },
    { q: 2, economicValue: 1, resourceType: 'iron' },
  ]);
  const ownership = { '0,0': 'p1', '1,0': 'p1', '2,0': 'p1' };
  const capitals  = { p1: '0,0' };
  const state = minimalState({ ownership, capitals, map });

  it('sums gold from all connected tiles', () => {
    const inc = computeIncome(state, 'p1');
    // 5 + 3 + 1 = 9 gold (no structures)
    expect(inc.gold).toBe(9);
  });

  it('accumulates resources by type', () => {
    const inc = computeIncome(state, 'p1');
    expect(inc.food).toBeGreaterThan(0); // tile (0,0) = food
    expect(inc.wood).toBeGreaterThan(0); // tile (1,0) = wood
    expect(inc.iron).toBeGreaterThan(0); // tile (2,0) = iron
  });

  it('returns zeroes when player has no capital', () => {
    const noCapState = minimalState({ ownership, capitals: {}, map });
    const inc = computeIncome(noCapState, 'p1');
    expect(inc).toEqual({ wood: 0, food: 0, iron: 0, gold: 0 });
  });
});

describe('computeIncome — connectivity', () => {
  const map = buildMap([
    { q: 0, economicValue: 5, resourceType: 'food' },
    { q: 1, economicValue: 3, resourceType: 'food' },
    // gap at q=2 — not owned
    { q: 3, economicValue: 4, resourceType: 'food' },
  ]);

  it('does not count income from disconnected tiles', () => {
    // p1 owns (0,0) and (1,0) and (3,0) — but (2,0) is not owned, disconnecting (3,0)
    const ownership = { '0,0': 'p1', '1,0': 'p1', '3,0': 'p1' };
    const capitals  = { p1: '0,0' };
    const state = minimalState({ ownership, capitals, map });
    const inc = computeIncome(state, 'p1');
    // Should only get income from connected tiles (0,0) and (1,0), not (3,0)
    // Gold: 5 + 3 = 8 (not 8+4=12)
    expect(inc.gold).toBe(8);
  });
});

describe('computeIncome — structure bonuses', () => {
  const map = buildMap([
    { q: 0, economicValue: 4, resourceType: 'food' }, // capital tile
    { q: 1, economicValue: 2, resourceType: 'food' }, // farm tile
    { q: 2, economicValue: 3, resourceType: 'iron' }, // city tile
  ]);
  const ownership = { '0,0': 'p1', '1,0': 'p1', '2,0': 'p1' };
  const capitals  = { p1: '0,0' };

  it('capital-base adds +1 gold flat', () => {
    const pieces = new Map([
      ['cap-p1', makeUnitFromRegistry(kingdomsPieces, { id: 'cap-p1', kind: 'capital-base', owner: 'p1', tileId: '0,0' })],
    ]);
    const state = minimalState({ ownership, capitals, map, pieces: pieces as any });
    const inc = computeIncome(state, 'p1');
    // (0,0): 4 + 1 flat = 5 gold; (1,0): 2; (2,0): 3; total = 10
    expect(inc.gold).toBe(10);
  });

  it('farm multiplies resource yield on its tile', () => {
    const pieces = new Map([
      ['farm-1', makeUnitFromRegistry(kingdomsPieces, { id: 'farm-1', kind: 'farm', owner: 'p1', tileId: '1,0' })],
    ]);
    const state = minimalState({ ownership, capitals, map, pieces: pieces as any });
    const incWithFarm    = computeIncome(state, 'p1');

    const stateNone = minimalState({ ownership, capitals, map });
    const incWithout = computeIncome(stateNone, 'p1');

    expect(incWithFarm.food).toBeGreaterThan(incWithout.food);
  });

  it('city doubles gold on its tile', () => {
    const pieces = new Map([
      ['city-1', makeUnitFromRegistry(kingdomsPieces, { id: 'city-1', kind: 'city', owner: 'p1', tileId: '2,0' })],
    ]);
    const state = minimalState({ ownership, capitals, map, pieces: pieces as any });
    const inc = computeIncome(state, 'p1');
    // (0,0): 4; (1,0): 2; (2,0): 3×2=6; total = 12
    expect(inc.gold).toBe(12);
  });
});

// ── computeFoodCost ───────────────────────────────────────────────────────────

describe('computeFoodCost', () => {
  function stateWithPieces(pieces: Map<string, { id: string; kind: string; owner: string; location: { kind: 'tile'; tileId: string } }>): GameState {
    return { pieces } as unknown as GameState;
  }

  it('returns 0 with no pieces', () => {
    const s = stateWithPieces(new Map());
    expect(computeFoodCost(s, 'p1')).toBe(0);
  });

  it('sums food cost for player units only', () => {
    const pieces = new Map([
      ['sp1', makeUnitFromRegistry(kingdomsPieces, { id: 'sp1', kind: 'spearman', owner: 'p1', tileId: '0,0' })],
      ['sp2', makeUnitFromRegistry(kingdomsPieces, { id: 'sp2', kind: 'spearman', owner: 'p2', tileId: '1,0' })], // enemy
      ['cn1', makeUnitFromRegistry(kingdomsPieces, { id: 'cn1', kind: 'cannoneer', owner: 'p1', tileId: '0,0' })],
    ]);
    const s = stateWithPieces(pieces as any);
    // p1: spearman(1) + cannoneer(2) = 3
    expect(computeFoodCost(s, 'p1')).toBe(3);
    expect(computeFoodCost(s, 'p2')).toBe(1); // just the enemy spearman
  });

  it('farm and castle structures do not consume food', () => {
    const pieces = new Map([
      ['farm-1', makeUnitFromRegistry(kingdomsPieces, { id: 'farm-1', kind: 'farm', owner: 'p1', tileId: '0,0' })],
      ['castle-1', makeUnitFromRegistry(kingdomsPieces, { id: 'castle-1', kind: 'castle', owner: 'p1', tileId: '1,0' })],
    ]);
    const s = stateWithPieces(pieces as any);
    expect(computeFoodCost(s, 'p1')).toBe(0);
  });

  it('each city consumes 2 food per round', () => {
    const pieces = new Map([
      ['city-1', makeUnitFromRegistry(kingdomsPieces, { id: 'city-1', kind: 'city', owner: 'p1', tileId: '0,0' })],
      ['city-2', makeUnitFromRegistry(kingdomsPieces, { id: 'city-2', kind: 'city', owner: 'p1', tileId: '1,0' })],
    ]);
    const s = stateWithPieces(pieces as any);
    expect(computeFoodCost(s, 'p1')).toBe(4); // 2 cities × 2 food
  });

  it('city food cost stacks with unit food cost', () => {
    const pieces = new Map([
      ['sp1', makeUnitFromRegistry(kingdomsPieces, { id: 'sp1', kind: 'spearman', owner: 'p1', tileId: '0,0' })],
      ['city-1', makeUnitFromRegistry(kingdomsPieces, { id: 'city-1', kind: 'city', owner: 'p1', tileId: '0,0' })],
    ]);
    const s = stateWithPieces(pieces as any);
    // spearman=1 + city=2 = 3
    expect(computeFoodCost(s, 'p1')).toBe(3);
  });

  it('enemy cities do not count toward player food cost', () => {
    const pieces = new Map([
      ['city-1', makeUnitFromRegistry(kingdomsPieces, { id: 'city-1', kind: 'city', owner: 'p2', tileId: '0,0' })],
    ]);
    const s = stateWithPieces(pieces as any);
    expect(computeFoodCost(s, 'p1')).toBe(0);
  });
});

// ── chooseAttritionVictims ────────────────────────────────────────────────────

describe('chooseAttritionVictims', () => {
  function stateWithUnits(units: Array<{ id: string; kind: string; owner: string }>): GameState {
    const pieces = new Map(
      units.map((u) => [u.id, makeUnitFromRegistry(kingdomsPieces, { ...u, tileId: '0,0' })]),
    );
    return { pieces } as unknown as GameState;
  }

  it('returns empty array when deficit is 0', () => {
    const s = stateWithUnits([{ id: 'sp1', kind: 'spearman', owner: 'p1' }]);
    expect(chooseAttritionVictims(s, 'p1', 0)).toHaveLength(0);
  });

  it('disbands spearmen before nobles and cannoneers', () => {
    const s = stateWithUnits([
      { id: 'cn1', kind: 'cannoneer', owner: 'p1' },
      { id: 'nb1', kind: 'noble', owner: 'p1' },
      { id: 'sp1', kind: 'spearman', owner: 'p1' },
    ]);
    const victims = chooseAttritionVictims(s, 'p1', 1);
    expect(victims).toContain('sp1');
    expect(victims).not.toContain('cn1');
  });

  it('disbands enough units to cover the full deficit', () => {
    const s = stateWithUnits([
      { id: 'sp1', kind: 'spearman', owner: 'p1' },
      { id: 'sp2', kind: 'spearman', owner: 'p1' },
      { id: 'sp3', kind: 'spearman', owner: 'p1' },
    ]);
    // Each spearman costs 1 food. Deficit of 2 → disband 2 spearmen.
    const victims = chooseAttritionVictims(s, 'p1', 2);
    expect(victims).toHaveLength(2);
  });

  it('only disbands current player units', () => {
    const s = stateWithUnits([
      { id: 'sp1', kind: 'spearman', owner: 'p1' },
      { id: 'sp2', kind: 'spearman', owner: 'p2' },
    ]);
    const victims = chooseAttritionVictims(s, 'p1', 1);
    expect(victims).toContain('sp1');
    expect(victims).not.toContain('sp2');
  });

  it('stops disbanding once deficit is covered', () => {
    const s = stateWithUnits([
      { id: 'sp1', kind: 'spearman', owner: 'p1' },
      { id: 'sp2', kind: 'spearman', owner: 'p1' },
      { id: 'sp3', kind: 'spearman', owner: 'p1' },
    ]);
    const victims = chooseAttritionVictims(s, 'p1', 1);
    expect(victims).toHaveLength(1);
  });
});

// ── computeIncome — develop tile bonus ────────────────────────────────────────

describe('computeIncome — develop tile bonus', () => {
  const map = buildMap([
    { q: 0, economicValue: 3, resourceType: 'food' }, // capital + will be developed
    { q: 1, economicValue: 2, resourceType: 'iron' },
  ]);
  const ownership = { '0,0': 'p1', '1,0': 'p1' };
  const capitals  = { p1: '0,0' };

  it('developed tile yields extra BASE_RESOURCE_YIELD of its resource', () => {
    // Without develop: tile 0,0 produces BASE_RESOURCE_YIELD food
    const stateNoDev = minimalState({ ownership, capitals, map });
    const incNoDev   = computeIncome(stateNoDev, 'p1');

    // With develop: tile 0,0 adds another BASE_RESOURCE_YIELD food
    const stateWithDev = {
      ...minimalState({ ownership, capitals, map }),
      extras: { 'k:ownership': ownership, 'k:capitals': capitals, 'k:developed': ['0,0'] },
    } as unknown as GameState;
    const incWithDev = computeIncome(stateWithDev, 'p1');

    // Developed tile should have exactly BASE_RESOURCE_YIELD more food
    expect(incWithDev.food - incNoDev.food).toBe(BASE_RESOURCE_YIELD);
  });

  it('develop bonus only applies to the developed tile, not all connected tiles', () => {
    // Both tiles owned; only develop tile 0,0 (food). Tile 1,0 is iron.
    const state = {
      ...minimalState({ ownership, capitals, map }),
      extras: { 'k:ownership': ownership, 'k:capitals': capitals, 'k:developed': ['0,0'] },
    } as unknown as GameState;
    const inc = computeIncome(state, 'p1');
    // Iron tile 1,0 is NOT developed — no extra iron bonus
    const stateNoDev = minimalState({ ownership, capitals, map });
    const incNoDev   = computeIncome(stateNoDev, 'p1');
    expect(inc.iron).toBe(incNoDev.iron);
  });

  it('non-developed tiles produce the same income as before', () => {
    const state = {
      ...minimalState({ ownership, capitals, map }),
      extras: { 'k:ownership': ownership, 'k:capitals': capitals, 'k:developed': [] },
    } as unknown as GameState;
    const incWithEmptyDev = computeIncome(state, 'p1');
    const incNoDev        = computeIncome(minimalState({ ownership, capitals, map }), 'p1');
    expect(incWithEmptyDev).toEqual(incNoDev);
  });
});
