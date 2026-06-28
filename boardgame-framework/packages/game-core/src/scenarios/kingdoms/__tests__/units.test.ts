import { describe, it, expect } from 'vitest';
import {
  UNIT_DEFS,
  UNIT_KINDS,
  type UnitKind,
} from '../units.js';
import { UNIT_STATS, kingdomsPieces } from '../pieces.js';
import { MapBuilder } from '../../../map/map-builder.js';
import { makeUnitFromRegistry } from '../../../pieces/unit.js';
import type { GameState } from '../../../state/game-state.js';
import { recruitUnitValidator } from '../actions/recruit.js';
import { moveUnitValidator } from '../actions/move.js';

// ── Shared test infrastructure ─────────────────────────────────────────────────

function buildMap(tiles: Array<{ q: number; r?: number }>) {
  const builder = new MapBuilder();
  for (const t of tiles) builder.addTile({ q: t.q, r: t.r ?? 0 }, 'plains');
  return builder.build();
}

type PieceEntry = { id: string; kind: string; owner: string; location: { kind: 'tile'; tileId: string } };

function makeState(overrides: {
  map: ReturnType<typeof buildMap>;
  ownership?: Record<string, string>;
  capitals?: Record<string, string>;
  pieces?: Map<string, PieceEntry>;
  activePlayer?: string;
  inventories?: Map<string, { get(r: string): number; add(r: string, n: number): void; remove(r: string, n: number): void; has(r: string, n: number): boolean }>;
}): GameState {
  const ownership = overrides.ownership ?? {};
  const capitals  = overrides.capitals  ?? {};

  const makeInventory = (resources: Record<string, number> = {}) => {
    const store = { ...resources };
    return {
      get:    (r: string) => store[r] ?? 0,
      add:    (r: string, n: number) => { store[r] = (store[r] ?? 0) + n; },
      remove: (r: string, n: number) => { store[r] = Math.max(0, (store[r] ?? 0) - n); },
      has:    (r: string, n: number) => (store[r] ?? 0) >= n,
    };
  };

  const inventoryMap = overrides.inventories ?? new Map([
    ['p1', makeInventory({ gold: 50, food: 10, iron: 10, wood: 10 })],
    ['p2', makeInventory({ gold: 50, food: 10, iron: 10, wood: 10 })],
  ]);

  return {
    extras: {
      'k:ownership':            ownership,
      'k:capitals':             capitals,
      'k:movedThisTurn':        [],
      'k:attackedFrom':         [],
      'k:nextPieceId':          100,
      'k:pendingOccupations':   {},
      'k:confirmedOccupations': {},
    },
    map:    overrides.map,
    pieces: (overrides.pieces ?? new Map()) as GameState['pieces'],
    inventories: inventoryMap as unknown as GameState['inventories'],
    rounds: {
      turn: () => ({ activePlayer: overrides.activePlayer ?? 'p1' }),
      endTurn: (_players: unknown[], _phase: string) => ({ newActivePlayer: 'p2', newRound: false }),
      round: () => 1,
    } as unknown as GameState['rounds'],
    players: {
      isEliminated: () => false,
      all: () => [{ id: 'p1' }, { id: 'p2' }],
      active: () => [{ id: 'p1' }, { id: 'p2' }],
    } as unknown as GameState['players'],
  } as unknown as GameState;
}

function action(type: string, playerId: string, payload: Record<string, unknown> = {}) {
  return { type, playerId, payload } as any;
}

// ── UNIT_DEFS completeness ─────────────────────────────────────────────────────

const EXPECTED_KINDS: UnitKind[] = ['spearman', 'cannoneer', 'noble'];

describe('UNIT_DEFS — completeness', () => {
  for (const kind of EXPECTED_KINDS) {
    it(`has a definition for ${kind}`, () => {
      expect(UNIT_DEFS[kind]).toBeDefined();
      expect(UNIT_DEFS[kind]!.kind).toBe(kind);
    });
  }

  it('every def has all required fields', () => {
    for (const def of Object.values(UNIT_DEFS)) {
      expect(typeof def.displayName).toBe('string');
      expect(typeof def.hp).toBe('number');
      expect(def.hp).toBeGreaterThan(0);
      expect(typeof def.attack).toBe('number');
      expect(def.attack).toBeGreaterThanOrEqual(0);
      expect(typeof def.defense).toBe('number');
      expect(def.defense).toBeGreaterThanOrEqual(0);
      expect(typeof def.movement).toBe('number');
      expect(def.movement).toBeGreaterThanOrEqual(1);
      expect(typeof def.foodPerRound).toBe('number');
      expect(def.foodPerRound).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('UNIT_KINDS', () => {
  it('includes all three kinds', () => {
    for (const kind of EXPECTED_KINDS) {
      expect(UNIT_KINDS.has(kind)).toBe(true);
    }
  });
});

describe('GAMEPLAN balance values', () => {
  it('Spearman has correct stats', () => {
    const d = UNIT_DEFS['spearman'];
    expect(d.hp).toBe(10);
    expect(d.attack).toBe(3);
    expect(d.defense).toBe(5);
    expect(d.movement).toBe(1);
    expect(d.foodPerRound).toBe(1);
    expect(d.buildCost).toEqual({ gold: 10, food: 1 });
    expect(d.limitPerPlayer).toBe(20);
  });

  it('Cannoneer has correct stats', () => {
    const d = UNIT_DEFS['cannoneer'];
    expect(d.hp).toBe(6);
    expect(d.attack).toBe(8);
    expect(d.defense).toBe(2);
    expect(d.movement).toBe(1);
    expect(d.foodPerRound).toBe(2);
    expect(d.buildCost).toEqual({ gold: 20, iron: 2 });
    expect(d.limitPerPlayer).toBe(8);
  });

  it('Noble has correct stats', () => {
    const d = UNIT_DEFS['noble'];
    expect(d.hp).toBe(8);
    expect(d.attack).toBe(1);
    expect(d.defense).toBe(3);
    expect(d.movement).toBe(2);
    expect(d.foodPerRound).toBe(1);
    expect(d.buildCost).toEqual({ gold: 8, iron: 1, food: 1 });
    expect(d.limitPerPlayer).toBe(10);
  });
});

describe('UNIT_STATS derived from UNIT_DEFS', () => {
  it('UNIT_STATS matches UNIT_DEFS for all units', () => {
    for (const [kind, def] of Object.entries(UNIT_DEFS)) {
      const stats = UNIT_STATS[kind];
      expect(stats).toBeDefined();
      expect(stats!.attack).toBe(def.attack);
      expect(stats!.defense).toBe(def.defense);
      expect(stats!.movement).toBe(def.movement);
      expect(stats!.foodPerRound).toBe(def.foodPerRound);
      expect(stats!.hp).toBe(def.hp);
    }
  });
});

describe('PieceRegistry — unit entries', () => {
  it('movement stat is stored on the piece via makeUnitFromRegistry', () => {
    const noble = makeUnitFromRegistry(kingdomsPieces, { id: 'n1', kind: 'noble', owner: 'p1', tileId: '0,0' });
    expect((noble.stats as Record<string, number>)['movement']).toBe(2);
  });

  it('defense stat is stored on the piece', () => {
    const sp = makeUnitFromRegistry(kingdomsPieces, { id: 'sp1', kind: 'spearman', owner: 'p1', tileId: '0,0' });
    expect((sp.stats as Record<string, number>)['defense']).toBe(5);
  });
});

// ── recruit-unit — structure prerequisite ─────────────────────────────────────

describe('recruitUnitValidator — structure prerequisite', () => {
  const map = buildMap([{ q: 0 }, { q: 1 }]);
  const ownership = { '0,0': 'p1', '1,0': 'p1' };
  const capitals  = { p1: '0,0' };

  it('rejects when tile has no structure', () => {
    const state = makeState({ map, ownership, capitals });
    const result = recruitUnitValidator.validate(state, action('recruit-unit', 'p1', { tileId: '0,0', unitKind: 'spearman' }));
    expect(result?.code).toBe('no-structure');
  });

  it('allows recruitment on a tile with capital-base', () => {
    const pieces = new Map([
      ['cap-p1', makeUnitFromRegistry(kingdomsPieces, { id: 'cap-p1', kind: 'capital-base', owner: 'p1', tileId: '0,0' })],
    ]);
    const state = makeState({ map, ownership, capitals, pieces: pieces as any });
    const result = recruitUnitValidator.validate(state, action('recruit-unit', 'p1', { tileId: '0,0', unitKind: 'spearman' }));
    expect(result).toBeNull();
  });

  it('allows recruitment on a tile with a city', () => {
    const pieces = new Map([
      ['city-1', makeUnitFromRegistry(kingdomsPieces, { id: 'city-1', kind: 'city', owner: 'p1', tileId: '1,0' })],
    ]);
    const state = makeState({ map, ownership, capitals, pieces: pieces as any });
    const result = recruitUnitValidator.validate(state, action('recruit-unit', 'p1', { tileId: '1,0', unitKind: 'spearman' }));
    expect(result).toBeNull();
  });

  it('rejects on unowned tile', () => {
    const pieces = new Map([
      ['cap-p1', makeUnitFromRegistry(kingdomsPieces, { id: 'cap-p1', kind: 'capital-base', owner: 'p1', tileId: '0,0' })],
    ]);
    const state = makeState({ map, ownership: { '0,0': 'p1' }, capitals, pieces: pieces as any });
    const result = recruitUnitValidator.validate(state, action('recruit-unit', 'p1', { tileId: '1,0', unitKind: 'spearman' }));
    expect(result?.code).toBe('not-owned');
  });
});

// ── move-unit — uniform movement rules ────────────────────────────────────────
//
// Movement is identical for every unit kind, including Noble: free movement
// to any connected own tile, regardless of distance. Claiming an unowned tile
// is done by attacking it (see attack.test.ts) — moving never grants ownership.

describe('moveUnitValidator — uniform movement (Spearman and Noble alike)', () => {
  // Linear map: 0,0(p1 capital) — 1,0(p1) — 2,0(unowned) — 3,0(p2)
  const map = buildMap([{ q: 0 }, { q: 1 }, { q: 2 }, { q: 3 }]);
  const ownership = { '0,0': 'p1', '1,0': 'p1', '3,0': 'p2' };
  const capitals  = { p1: '0,0', p2: '3,0' };

  function unitAt(kind: 'spearman' | 'noble', tileId: string) {
    return new Map([['u1', makeUnitFromRegistry(kingdomsPieces, { id: 'u1', kind, owner: 'p1', tileId })]]);
  }

  for (const kind of ['spearman', 'noble'] as const) {
    it(`${kind}: allows move to adjacent owned tile`, () => {
      const state = makeState({ map, ownership, capitals, pieces: unitAt(kind, '0,0') as any });
      const result = moveUnitValidator.validate(state, action('move-unit', 'p1', { pieceId: 'u1', targetTileId: '1,0' }));
      expect(result).toBeNull();
    });

    it(`${kind}: allows move to a distant owned tile (no movement-range limit)`, () => {
      const state = makeState({
        map,
        ownership: { ...ownership, '2,0': 'p1' },
        capitals,
        pieces: unitAt(kind, '0,0') as any,
      });
      const result = moveUnitValidator.validate(state, action('move-unit', 'p1', { pieceId: 'u1', targetTileId: '2,0' }));
      expect(result).toBeNull();
    });

    it(`${kind}: rejects move to an unowned tile`, () => {
      const state = makeState({ map, ownership, capitals, pieces: unitAt(kind, '1,0') as any });
      const result = moveUnitValidator.validate(state, action('move-unit', 'p1', { pieceId: 'u1', targetTileId: '2,0' }));
      expect(result?.code).toBe('not-owned');
    });

    it(`${kind}: rejects move to an enemy-owned tile`, () => {
      const state = makeState({
        map,
        ownership: { ...ownership, '2,0': 'p1' },
        capitals,
        pieces: unitAt(kind, '2,0') as any,
      });
      const result = moveUnitValidator.validate(state, action('move-unit', 'p1', { pieceId: 'u1', targetTileId: '3,0' }));
      expect(result?.code).toBe('not-owned');
    });

    it(`${kind}: rejects move to the same tile`, () => {
      const state = makeState({ map, ownership, capitals, pieces: unitAt(kind, '0,0') as any });
      const result = moveUnitValidator.validate(state, action('move-unit', 'p1', { pieceId: 'u1', targetTileId: '0,0' }));
      expect(result?.code).toBe('same-tile');
    });

    it(`${kind}: rejects when the unit already moved this turn`, () => {
      const state = makeState({ map, ownership, capitals, pieces: unitAt(kind, '0,0') as any });
      state.extras['k:movedThisTurn'] = ['u1'];
      const result = moveUnitValidator.validate(state, action('move-unit', 'p1', { pieceId: 'u1', targetTileId: '1,0' }));
      expect(result?.code).toBe('already-moved');
    });
  }

  it('rejects move to an owned-but-disconnected tile', () => {
    // p1 owns 0,0 (capital) and 1,0; 2,0 is an unowned gap; 3,0 would need to be
    // owned-but-disconnected to trigger this — reuse a 5-tile map for the gap.
    const gapMap = buildMap([{ q: 0 }, { q: 1 }, { q: 2 }, { q: 3 }, { q: 4 }]);
    const state = makeState({
      map: gapMap,
      ownership: { '0,0': 'p1', '4,0': 'p1' }, // 4,0 owned but not connected (gap at 1,0-3,0)
      capitals:  { p1: '0,0' },
      pieces: unitAt('spearman', '0,0') as any,
    });
    const result = moveUnitValidator.validate(state, action('move-unit', 'p1', { pieceId: 'u1', targetTileId: '4,0' }));
    expect(result?.code).toBe('disconnected');
  });
});
