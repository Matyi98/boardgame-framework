/**
 * Tests for processRoundEnd() — the per-round economic batch processor.
 *
 * Test strategy: fixture-based. Each test builds a minimal GameState with
 * exactly the fields processRoundEnd() reads, then asserts:
 *   - the correct events are emitted (type + payload)
 *   - inventory mutations match expected resource changes
 *   - extras keys are updated correctly (k:mortgagedCities etc.)
 *
 * Test groups mirror the processing steps in order.
 */

import { describe, it, expect } from 'vitest';
import { processRoundEnd } from '../economy-loop.js';
import { MapBuilder } from '../../../map/map-builder.js';
import { makeUnitFromRegistry } from '../../../pieces/unit.js';
import { kingdomsPieces } from '../pieces.js';
import type { GameState } from '../../../state/game-state.js';

// ── Shared fixtures ───────────────────────────────────────────────────────────

function buildMap(tiles: Array<{ q: number; r?: number; ev?: number; res?: string | null }>) {
  const builder = new MapBuilder();
  for (const t of tiles) {
    builder.addTile({ q: t.q, r: t.r ?? 0 }, 'plains');
    if (t.ev !== undefined || t.res !== undefined) {
      builder.setTileProperties(
        { q: t.q, r: t.r ?? 0 },
        { economicValue: t.ev ?? 1, resourceType: t.res ?? null },
      );
    }
  }
  return builder.build();
}

type SimpleInventory = {
  _data: Record<string, number>;
  get(r: string): number;
  add(r: string, n: number): void;
  remove(r: string, n: number): void;
  has(r: string, n: number): boolean;
};

function makeInventory(init: Record<string, number> = {}): SimpleInventory {
  const data = { ...init };
  return {
    _data: data,
    get:    (r) => data[r] ?? 0,
    add:    (r, n) => { data[r] = (data[r] ?? 0) + n; },
    remove: (r, n) => { data[r] = Math.max(0, (data[r] ?? 0) - n); },
    has:    (r, n) => (data[r] ?? 0) >= n,
  };
}

interface StateOverrides {
  map: ReturnType<typeof buildMap>;
  ownership?: Record<string, string>;
  capitals?: Record<string, string>;
  pieces?: Map<string, any>;
  players?: Array<{ id: string }>;
  inventories?: Map<string, SimpleInventory>;
  round?: number;
}

function makeState(overrides: StateOverrides): GameState {
  const players = overrides.players ?? [{ id: 'p1' }, { id: 'p2' }];
  const invMap  = overrides.inventories ?? new Map(
    players.map((p) => [p.id, makeInventory({ gold: 20, food: 10, wood: 5, iron: 5 })]),
  );
  return {
    extras: {
      'k:ownership':            overrides.ownership ?? {},
      'k:capitals':             overrides.capitals  ?? {},
      'k:movedThisTurn':        [],
      'k:attackedFrom':         [],
      'k:pendingOccupations':   {},
      'k:confirmedOccupations': {},
      'k:mortgagedCities':      [],
      'k:nextPieceId':          100,
    },
    map:    overrides.map,
    pieces: (overrides.pieces ?? new Map()) as GameState['pieces'],
    inventories: invMap as unknown as GameState['inventories'],
    rounds: {
      round: () => overrides.round ?? 1,
    } as unknown as GameState['rounds'],
    players: {
      active: () => players,
      all:    () => players,
      isEliminated: () => false,
    } as unknown as GameState['players'],
  } as unknown as GameState;
}

// ── Step 1: Income ────────────────────────────────────────────────────────────

describe('processRoundEnd — Step 1: income collection', () => {
  it('emits income-collected for each player', () => {
    const map   = buildMap([{ q: 0, ev: 3, res: 'food' }]);
    const state = makeState({
      map,
      ownership: { '0,0': 'p1' },
      capitals:  { p1: '0,0' },
      players:   [{ id: 'p1' }],
    });
    const events = processRoundEnd(state);
    const incomeEvent = events.find((e) => e.type === 'income-collected' && e.playerId === 'p1');
    expect(incomeEvent).toBeDefined();
    expect((incomeEvent!.payload as any).gold).toBe(3);
  });

  it('adds gold and resources to player inventory', () => {
    const map  = buildMap([{ q: 0, ev: 4, res: 'wood' }]);
    const inv  = makeInventory({ gold: 0, wood: 0, food: 5, iron: 0 });
    const state = makeState({
      map,
      ownership: { '0,0': 'p1' },
      capitals:  { p1: '0,0' },
      players:   [{ id: 'p1' }],
      inventories: new Map([['p1', inv]]),
    });
    processRoundEnd(state);
    expect(inv.get('gold')).toBe(4); // 4 × GOLD_PER_ECONOMIC_VALUE = 4
    expect(inv.get('wood')).toBeGreaterThan(0);
  });

  it('disconnected owned tile produces no income', () => {
    // p1 owns tile at 0,0 (capital) and 3,0 (disconnected, gap at 1,0 and 2,0)
    const map = buildMap([
      { q: 0, ev: 3, res: 'food' },
      { q: 1, ev: 3, res: 'food' }, // not owned — creates a gap
      { q: 2, ev: 3, res: 'food' }, // not owned
      { q: 3, ev: 5, res: 'food' }, // owned but disconnected
    ]);
    const inv  = makeInventory({ gold: 0, food: 0 });
    const state = makeState({
      map,
      ownership: { '0,0': 'p1', '3,0': 'p1' },
      capitals:  { p1: '0,0' },
      players:   [{ id: 'p1' }],
      inventories: new Map([['p1', inv]]),
    });
    processRoundEnd(state);
    // Only tile 0,0 (gold=3) should count; 3,0 is disconnected
    expect(inv.get('gold')).toBe(3);
  });

  it('player with no capital gets zero income', () => {
    const map  = buildMap([{ q: 0, ev: 5, res: 'food' }]);
    const inv  = makeInventory({ gold: 0 });
    const state = makeState({
      map,
      ownership:  { '0,0': 'p1' },
      capitals:   {}, // no capital registered
      players:    [{ id: 'p1' }],
      inventories: new Map([['p1', inv]]),
    });
    processRoundEnd(state);
    expect(inv.get('gold')).toBe(0);
  });

  it('city on connected tile doubles gold income', () => {
    const map   = buildMap([{ q: 0, ev: 3, res: 'iron' }]);
    const inv   = makeInventory({ gold: 0, food: 10 });
    const city  = makeUnitFromRegistry(kingdomsPieces, { id: 'kp-101', kind: 'city', owner: 'p1', tileId: '0,0' });
    const pieces = new Map([['kp-101', city]]);
    const state = makeState({
      map,
      ownership:   { '0,0': 'p1' },
      capitals:    { p1: '0,0' },
      players:     [{ id: 'p1' }],
      pieces,
      inventories: new Map([['p1', inv]]),
    });
    processRoundEnd(state);
    // city doubles: 3 × 2 = 6 gold; minus city food cost (2 food consumed)
    expect(inv.get('gold')).toBe(6);
  });
});

// ── Step 2: Food consumption ──────────────────────────────────────────────────

describe('processRoundEnd — Step 2: food consumption', () => {
  it('emits food-consumed when food cost > 0', () => {
    const map   = buildMap([{ q: 0 }]);
    const inv   = makeInventory({ gold: 5, food: 5 });
    const sp    = makeUnitFromRegistry(kingdomsPieces, { id: 'kp-101', kind: 'spearman', owner: 'p1', tileId: '0,0' });
    const state = makeState({
      map,
      players:     [{ id: 'p1' }],
      pieces:      new Map([['kp-101', sp]]),
      inventories: new Map([['p1', inv]]),
    });
    const events = processRoundEnd(state);
    expect(events.some((e) => e.type === 'food-consumed' && e.playerId === 'p1')).toBe(true);
    // 1 spearman = 1 food consumed (had 5 food)
    expect(inv.get('food')).toBe(4);
  });

  it('city consumes 2 food per round', () => {
    const map   = buildMap([{ q: 0 }]);
    const inv   = makeInventory({ gold: 5, food: 10 });
    const city  = makeUnitFromRegistry(kingdomsPieces, { id: 'kp-101', kind: 'city', owner: 'p1', tileId: '0,0' });
    const state = makeState({
      map,
      players:     [{ id: 'p1' }],
      pieces:      new Map([['kp-101', city]]),
      inventories: new Map([['p1', inv]]),
    });
    processRoundEnd(state);
    expect(inv.get('food')).toBe(8); // 10 − 2 = 8
  });

  it('mortgaged city pays no food cost', () => {
    const map   = buildMap([{ q: 0 }]);
    const inv   = makeInventory({ food: 5 });
    const city  = makeUnitFromRegistry(kingdomsPieces, { id: 'kp-101', kind: 'city', owner: 'p1', tileId: '0,0' });
    const state = makeState({
      map,
      players:     [{ id: 'p1' }],
      pieces:      new Map([['kp-101', city]]),
      inventories: new Map([['p1', inv]]),
    });
    state.extras['k:mortgagedCities'] = ['kp-101']; // city is mortgaged
    processRoundEnd(state);
    expect(inv.get('food')).toBe(5); // no food consumed
  });

  it('does not emit food-consumed when player has no units or cities', () => {
    const map    = buildMap([{ q: 0 }]);
    const inv    = makeInventory({ food: 5 });
    const state  = makeState({
      map,
      players:     [{ id: 'p1' }],
      inventories: new Map([['p1', inv]]),
    });
    const events = processRoundEnd(state);
    expect(events.some((e) => e.type === 'food-consumed')).toBe(false);
  });
});

// ── Step 2a: Gold exchange ────────────────────────────────────────────────────

describe('processRoundEnd — Step 2a: gold exchange', () => {
  it('spends gold to cover food deficit before attrition', () => {
    const map  = buildMap([{ q: 0 }]);
    // 1 spearman needs 1 food; player has 0 food but 20 gold → exchange 3 gold for 1 food
    const inv  = makeInventory({ gold: 20, food: 0 });
    const sp   = makeUnitFromRegistry(kingdomsPieces, { id: 'kp-101', kind: 'spearman', owner: 'p1', tileId: '0,0' });
    const state = makeState({
      map,
      players:     [{ id: 'p1' }],
      pieces:      new Map([['kp-101', sp]]),
      inventories: new Map([['p1', inv]]),
    });
    const events = processRoundEnd(state);
    expect(events.some((e) => e.type === 'food-purchased')).toBe(true);
    // Spearman still alive (no attrition needed)
    expect(state.pieces.has('kp-101')).toBe(true);
    expect(inv.get('gold')).toBe(17); // 20 − 3 (EXCHANGE_RATE=3 per food unit)
  });

  it('does not emit food-purchased if food is sufficient', () => {
    const map  = buildMap([{ q: 0 }]);
    const inv  = makeInventory({ gold: 20, food: 5 });
    const sp   = makeUnitFromRegistry(kingdomsPieces, { id: 'kp-101', kind: 'spearman', owner: 'p1', tileId: '0,0' });
    const state = makeState({
      map,
      players:     [{ id: 'p1' }],
      pieces:      new Map([['kp-101', sp]]),
      inventories: new Map([['p1', inv]]),
    });
    const events = processRoundEnd(state);
    expect(events.some((e) => e.type === 'food-purchased')).toBe(false);
  });

  it('food deficit beyond what gold can buy is simply unmet (no attrition)', () => {
    const map = buildMap([{ q: 0 }]);
    // 3 spearmen → 3 food; player has 0 food, 3 gold (can buy 1 food) → deficit 2 after exchange
    const inv = makeInventory({ gold: 3, food: 0 });
    const pieces = new Map(
      ['kp-101', 'kp-102', 'kp-103'].map((id) => [
        id, makeUnitFromRegistry(kingdomsPieces, { id, kind: 'spearman', owner: 'p1', tileId: '0,0' }),
      ]),
    );
    const state = makeState({
      map,
      players:     [{ id: 'p1' }],
      pieces,
      inventories: new Map([['p1', inv]]),
    });
    const events = processRoundEnd(state);
    expect(events.some((e) => e.type === 'food-purchased')).toBe(true);
    // No units are disbanded — the remaining deficit is simply unmet.
    expect(state.pieces.size).toBe(3);
    expect(inv.get('gold')).toBe(0);
  });
});

// ── Step 5: Connectivity check ────────────────────────────────────────────────

describe('processRoundEnd — Step 5: connectivity check', () => {
  it('emits territory-disconnected for owned tiles not reachable from capital', () => {
    // p1: owns 0,0 (capital), 1,0, and 3,0 (disconnected — gap at 2,0)
    const map = buildMap([
      { q: 0 }, { q: 1 }, { q: 2 }, { q: 3 },
    ]);
    const inv = makeInventory({ food: 10 });
    const state = makeState({
      map,
      ownership:   { '0,0': 'p1', '1,0': 'p1', '3,0': 'p1' },
      capitals:    { p1: '0,0' },
      players:     [{ id: 'p1' }],
      inventories: new Map([['p1', inv]]),
    });
    const events = processRoundEnd(state);
    const discEvent = events.find((e) => e.type === 'territory-disconnected' && e.playerId === 'p1');
    expect(discEvent).toBeDefined();
    expect((discEvent!.payload as any).tileIds).toContain('3,0');
    expect((discEvent!.payload as any).tileIds).not.toContain('0,0');
    expect((discEvent!.payload as any).tileIds).not.toContain('1,0');
  });

  it('does NOT emit territory-disconnected when all tiles are connected', () => {
    const map = buildMap([{ q: 0 }, { q: 1 }, { q: 2 }]);
    const inv = makeInventory({ food: 10 });
    const state = makeState({
      map,
      ownership:   { '0,0': 'p1', '1,0': 'p1', '2,0': 'p1' },
      capitals:    { p1: '0,0' },
      players:     [{ id: 'p1' }],
      inventories: new Map([['p1', inv]]),
    });
    const events = processRoundEnd(state);
    expect(events.some((e) => e.type === 'territory-disconnected')).toBe(false);
  });
});

// ── Step 6: round-ended event ─────────────────────────────────────────────────

describe('processRoundEnd — round-ended event', () => {
  it('always emits round-ended as the last event', () => {
    const map    = buildMap([{ q: 0 }]);
    const state  = makeState({ map, players: [{ id: 'p1' }] });
    const events = processRoundEnd(state);
    const last   = events[events.length - 1];
    expect(last?.type).toBe('round-ended');
  });

  it('round-ended payload contains the correct round number', () => {
    const map    = buildMap([{ q: 0 }]);
    const state  = makeState({ map, players: [{ id: 'p1' }], round: 5 });
    const events = processRoundEnd(state);
    const last   = events[events.length - 1];
    expect((last?.payload as any)?.round).toBe(5);
  });
});

// ── Multi-player round ────────────────────────────────────────────────────────

describe('processRoundEnd — multiple players', () => {
  it('processes income for all active players', () => {
    const map = buildMap([
      { q: 0, ev: 3, res: 'food' },
      { q: 5, ev: 2, res: 'iron' },
    ]);
    const invP1 = makeInventory({ gold: 0, food: 0 });
    const invP2 = makeInventory({ gold: 0, food: 0 });
    const state = makeState({
      map,
      ownership:   { '0,0': 'p1', '5,0': 'p2' },
      capitals:    { p1: '0,0', p2: '5,0' },
      players:     [{ id: 'p1' }, { id: 'p2' }],
      inventories: new Map([['p1', invP1], ['p2', invP2]]),
    });
    processRoundEnd(state);
    expect(invP1.get('gold')).toBe(3);
    expect(invP2.get('gold')).toBe(2);
  });

  it('a food deficit for one player does not affect another', () => {
    const map = buildMap([{ q: 0 }, { q: 5 }]);
    // p1 has 0 food and 1 spearman → deficit, but unit survives (no attrition)
    // p2 has 5 food and 1 spearman → no deficit
    const invP1 = makeInventory({ gold: 0, food: 0 });
    const invP2 = makeInventory({ gold: 0, food: 5 });
    const pieces = new Map([
      ['kp-101', makeUnitFromRegistry(kingdomsPieces, { id: 'kp-101', kind: 'spearman', owner: 'p1', tileId: '0,0' })],
      ['kp-102', makeUnitFromRegistry(kingdomsPieces, { id: 'kp-102', kind: 'spearman', owner: 'p2', tileId: '5,0' })],
    ]);
    const state = makeState({
      map,
      players:     [{ id: 'p1' }, { id: 'p2' }],
      pieces,
      inventories: new Map([['p1', invP1], ['p2', invP2]]),
    });
    processRoundEnd(state);
    expect(state.pieces.has('kp-101')).toBe(true); // p1's unit survives despite deficit
    expect(state.pieces.has('kp-102')).toBe(true); // p2's unit intact
  });
});
