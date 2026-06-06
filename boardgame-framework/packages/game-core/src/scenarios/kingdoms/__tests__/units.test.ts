import { describe, it, expect } from 'vitest';
import {
  UNIT_DEFS,
  UNIT_KINDS,
  OCCUPYING_UNIT_KINDS,
  type UnitKind,
} from '../units.js';
import { UNIT_STATS, STRUCTURE_KINDS, kingdomsPieces } from '../pieces.js';
import { MapBuilder } from '../../../map/map-builder.js';
import { makeUnitFromRegistry } from '../../../pieces/unit.js';
import type { GameState } from '../../../state/game-state.js';
import { recruitUnitValidator, recruitUnitExecutor } from '../actions/recruit.js';
import { moveUnitValidator, moveUnitExecutor } from '../actions/move.js';
import { endTurnExecutor } from '../actions/end-turn.js';

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
      expect(typeof def.canOccupyUnowned).toBe('boolean');
    }
  });
});

describe('UNIT_KINDS / OCCUPYING_UNIT_KINDS', () => {
  it('UNIT_KINDS includes all three kinds', () => {
    for (const kind of EXPECTED_KINDS) {
      expect(UNIT_KINDS.has(kind)).toBe(true);
    }
  });

  it('only Noble can occupy unowned tiles', () => {
    expect(OCCUPYING_UNIT_KINDS.has('noble')).toBe(true);
    expect(OCCUPYING_UNIT_KINDS.has('spearman')).toBe(false);
    expect(OCCUPYING_UNIT_KINDS.has('cannoneer')).toBe(false);
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
    expect(d.buildCost).toEqual({ gold: 30, iron: 1, food: 1 });
    expect(d.limitPerPlayer).toBe(2);
    expect(d.canOccupyUnowned).toBe(true);
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

// ── move-unit — multi-step movement ───────────────────────────────────────────

describe('moveUnitValidator — single-step units (Spearman)', () => {
  // Linear map: 0,0 — 1,0 — 2,0  all owned by p1
  const map = buildMap([{ q: 0 }, { q: 1 }, { q: 2 }]);
  const ownership = { '0,0': 'p1', '1,0': 'p1', '2,0': 'p1' };
  const capitals  = { p1: '0,0' };

  function spearmanAt(tileId: string) {
    return new Map([['sp1', makeUnitFromRegistry(kingdomsPieces, { id: 'sp1', kind: 'spearman', owner: 'p1', tileId })]]);
  }

  it('allows move to adjacent owned tile', () => {
    const state = makeState({ map, ownership, capitals, pieces: spearmanAt('0,0') as any });
    const result = moveUnitValidator.validate(state, action('move-unit', 'p1', { pieceId: 'sp1', targetTileId: '1,0' }));
    expect(result).toBeNull();
  });

  it('rejects move 2 steps away (movement=1)', () => {
    const state = makeState({ map, ownership, capitals, pieces: spearmanAt('0,0') as any });
    const result = moveUnitValidator.validate(state, action('move-unit', 'p1', { pieceId: 'sp1', targetTileId: '2,0' }));
    expect(result?.code).toBe('out-of-range');
  });

  it('rejects move to unowned tile', () => {
    const state = makeState({ map, ownership: { '0,0': 'p1' }, capitals, pieces: spearmanAt('0,0') as any });
    const result = moveUnitValidator.validate(state, action('move-unit', 'p1', { pieceId: 'sp1', targetTileId: '1,0' }));
    expect(result?.code).toBe('not-owned');
  });

  it('rejects when unit already moved', () => {
    const state = makeState({ map, ownership, capitals, pieces: spearmanAt('0,0') as any });
    state.extras['k:movedThisTurn'] = ['sp1'];
    const result = moveUnitValidator.validate(state, action('move-unit', 'p1', { pieceId: 'sp1', targetTileId: '1,0' }));
    expect(result?.code).toBe('already-moved');
  });
});

describe('moveUnitValidator — Noble (movement=2, canOccupyUnowned=true)', () => {
  // Linear map: 0,0(p1) — 1,0(p1) — 2,0(unowned) — 3,0(p2)
  const map = buildMap([{ q: 0 }, { q: 1 }, { q: 2 }, { q: 3 }]);
  const ownership = { '0,0': 'p1', '1,0': 'p1', '3,0': 'p2' };
  const capitals  = { p1: '0,0', p2: '3,0' };

  function nobleAt(tileId: string) {
    return new Map([['n1', makeUnitFromRegistry(kingdomsPieces, { id: 'n1', kind: 'noble', owner: 'p1', tileId })]]);
  }

  it('allows Noble to reach 2 hops away on owned tiles', () => {
    const state = makeState({ map, ownership, capitals, pieces: nobleAt('0,0') as any });
    const result = moveUnitValidator.validate(state, action('move-unit', 'p1', { pieceId: 'n1', targetTileId: '1,0' }));
    expect(result).toBeNull();
  });

  it('allows Noble to move to adjacent unowned tile', () => {
    const state = makeState({ map, ownership, capitals, pieces: nobleAt('1,0') as any });
    const result = moveUnitValidator.validate(state, action('move-unit', 'p1', { pieceId: 'n1', targetTileId: '2,0' }));
    expect(result).toBeNull();
  });

  it('allows Noble to reach unowned tile 2 hops away via own tiles', () => {
    // Noble starts at 0,0. Can go 0→1→2 (2 steps). 2,0 is unowned.
    const state = makeState({ map, ownership, capitals, pieces: nobleAt('0,0') as any });
    const result = moveUnitValidator.validate(state, action('move-unit', 'p1', { pieceId: 'n1', targetTileId: '2,0' }));
    expect(result).toBeNull();
  });

  it('rejects Noble moving to enemy-owned tile', () => {
    const state = makeState({ map, ownership, capitals, pieces: nobleAt('2,0') as any });
    const result = moveUnitValidator.validate(state, action('move-unit', 'p1', { pieceId: 'n1', targetTileId: '3,0' }));
    expect(result?.code).toBe('enemy-tile');
  });

  it('rejects Noble moving to same tile', () => {
    const state = makeState({ map, ownership, capitals, pieces: nobleAt('0,0') as any });
    const result = moveUnitValidator.validate(state, action('move-unit', 'p1', { pieceId: 'n1', targetTileId: '0,0' }));
    expect(result?.code).toBe('same-tile');
  });
});

// ── move-unit executor — occupation events ────────────────────────────────────

describe('moveUnitExecutor — Noble occupation', () => {
  const map = buildMap([{ q: 0 }, { q: 1 }, { q: 2 }]);
  const ownership = { '0,0': 'p1', '1,0': 'p1' };
  const capitals  = { p1: '0,0' };

  it('emits noble-occupying when Noble lands on unowned tile', () => {
    const pieces = new Map([['n1', makeUnitFromRegistry(kingdomsPieces, { id: 'n1', kind: 'noble', owner: 'p1', tileId: '1,0' })]]);
    const state  = makeState({ map, ownership, capitals, pieces: pieces as any });
    const events = moveUnitExecutor.execute(state, action('move-unit', 'p1', { pieceId: 'n1', targetTileId: '2,0' }));
    expect(events.some((e) => e.type === 'noble-occupying')).toBe(true);
    expect((state.extras['k:pendingOccupations'] as any)['2,0']).toEqual({ nobleId: 'n1', playerId: 'p1' });
  });

  it('does NOT emit noble-occupying when Noble moves to own tile', () => {
    const pieces = new Map([['n1', makeUnitFromRegistry(kingdomsPieces, { id: 'n1', kind: 'noble', owner: 'p1', tileId: '0,0' })]]);
    const state  = makeState({ map, ownership, capitals, pieces: pieces as any });
    const events = moveUnitExecutor.execute(state, action('move-unit', 'p1', { pieceId: 'n1', targetTileId: '1,0' }));
    expect(events.some((e) => e.type === 'noble-occupying')).toBe(false);
    expect(Object.keys(state.extras['k:pendingOccupations'] as object)).toHaveLength(0);
  });

  it('cancels previous occupation when Noble moves away', () => {
    const pieces = new Map([['n1', makeUnitFromRegistry(kingdomsPieces, { id: 'n1', kind: 'noble', owner: 'p1', tileId: '2,0' })]]);
    const state  = makeState({ map, ownership, capitals, pieces: pieces as any });
    // Noble was occupying 2,0 from before
    state.extras['k:pendingOccupations'] = { '2,0': { nobleId: 'n1', playerId: 'p1' } };
    // Noble moves back to an owned tile
    moveUnitExecutor.execute(state, action('move-unit', 'p1', { pieceId: 'n1', targetTileId: '1,0' }));
    // Occupation should be cancelled
    expect((state.extras['k:pendingOccupations'] as any)['2,0']).toBeUndefined();
  });
});

// ── Noble capture — end-turn pipeline ─────────────────────────────────────────

describe('endTurnExecutor — Noble capture pipeline', () => {
  const map = buildMap([{ q: 0 }, { q: 1 }, { q: 2 }]);
  const ownership = { '0,0': 'p1', '1,0': 'p1' };
  const capitals  = { p1: '0,0' };

  function stateWithNoble(extraState: Partial<{ pending: object; confirmed: object }> = {}) {
    const noble  = makeUnitFromRegistry(kingdomsPieces, { id: 'n1', kind: 'noble', owner: 'p1', tileId: '2,0' });
    const capBase = makeUnitFromRegistry(kingdomsPieces, { id: 'cap1', kind: 'capital-base', owner: 'p1', tileId: '0,0' });
    const pieces = new Map([['n1', noble], ['cap1', capBase]]);
    const state  = makeState({ map, ownership: { ...ownership }, capitals, pieces: pieces as any });
    state.extras['k:pendingOccupations']   = extraState.pending   ?? {};
    state.extras['k:confirmedOccupations'] = extraState.confirmed ?? {};
    return state;
  }

  it('promotes pending occupation to confirmed at end-of-turn', () => {
    const state = stateWithNoble({ pending: { '2,0': { nobleId: 'n1', playerId: 'p1' } } });
    endTurnExecutor.execute(state, action('end-turn', 'p1'));
    expect((state.extras['k:confirmedOccupations'] as any)['2,0']).toBeDefined();
    expect((state.extras['k:pendingOccupations'] as any)['2,0']).toBeUndefined();
  });

  it('captures tile at second end-of-turn when Noble still on tile', () => {
    const state  = stateWithNoble({ confirmed: { '2,0': { nobleId: 'n1', playerId: 'p1' } } });
    const events = endTurnExecutor.execute(state, action('end-turn', 'p1'));
    expect(events.some((e) => e.type === 'tile-captured')).toBe(true);
    expect((state.extras['k:ownership'] as Record<string, string>)['2,0']).toBe('p1');
  });

  it('does NOT capture when Noble is gone', () => {
    const state  = stateWithNoble({ confirmed: { '2,0': { nobleId: 'n1', playerId: 'p1' } } });
    state.pieces.delete('n1'); // Noble was killed
    const events = endTurnExecutor.execute(state, action('end-turn', 'p1'));
    expect(events.some((e) => e.type === 'tile-captured')).toBe(false);
    expect((state.extras['k:ownership'] as Record<string, string>)['2,0']).toBeUndefined();
  });

  it('does NOT capture when tile was claimed by enemy in the meantime', () => {
    const state  = stateWithNoble({ confirmed: { '2,0': { nobleId: 'n1', playerId: 'p1' } } });
    // Enemy captured the tile during their turn
    (state.extras['k:ownership'] as Record<string, string>)['2,0'] = 'p2';
    const events = endTurnExecutor.execute(state, action('end-turn', 'p1'));
    expect(events.some((e) => e.type === 'tile-captured')).toBe(false);
    // Ownership still belongs to p2
    expect((state.extras['k:ownership'] as Record<string, string>)['2,0']).toBe('p2');
  });

  it('does not affect other players pending occupations', () => {
    const state = stateWithNoble({ pending: { '2,0': { nobleId: 'n2', playerId: 'p2' } } });
    endTurnExecutor.execute(state, action('end-turn', 'p1'));
    // p2's pending should be untouched
    expect((state.extras['k:pendingOccupations'] as any)['2,0']).toEqual({ nobleId: 'n2', playerId: 'p2' });
  });
});
