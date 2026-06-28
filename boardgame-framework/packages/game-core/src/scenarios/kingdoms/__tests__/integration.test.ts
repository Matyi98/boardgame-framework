/**
 * Integration tests for Kingdoms of Dominion.
 *
 * These tests exercise multiple components working together through a real
 * RoundManager and PlayerManager — unlike unit tests that mock those objects.
 * Each test scenario covers a complete multi-step game flow.
 *
 * Scenarios:
 *   1. Capital capture → player eliminated → last-player-standing victory
 *   2. Multi-round food deficit → units survive, no attrition
 *   3. Noble capture: full two-turn occupation pipeline
 */

import { describe, it, expect } from 'vitest';
import { MapBuilder } from '../../../map/map-builder.js';
import { RoundManager } from '../../../rounds/round-manager.js';
import { PlayerManager } from '../../../players/player-manager.js';
import { ClockwiseTurnOrder } from '../../../rounds/turn-order.js';
import { makeUnitFromRegistry } from '../../../pieces/unit.js';
import { kingdomsPieces } from '../pieces.js';
import { attackTileExecutor } from '../actions/attack.js';
import { moveUnitValidator } from '../actions/move.js';
import { endTurnExecutor } from '../actions/end-turn.js';
import { lastPlayerStanding } from '../victory.js';
import type { GameState } from '../../../state/game-state.js';
import type { Player } from '../../../players/player.js';

// ── Shared fixtures ───────────────────────────────────────────────────────────

const PHASE = { id: 'command', displayName: 'Command', nextPhases: ['command'] };

function makePlayers(): [Player, Player] {
  return [
    { id: 'p1', displayName: 'Alice', color: 'red',  seat: 0 },
    { id: 'p2', displayName: 'Bob',   color: 'blue', seat: 1 },
  ];
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

function action(type: string, playerId: string, payload: Record<string, unknown> = {}) {
  return { type, playerId, payload } as any;
}

/**
 * Builds a linear 5-tile map and a fully wired GameState.
 * Tile IDs: "0,0" through "4,0" (all plains).
 */
function buildState(opts: {
  ownership?: Record<string, string>;
  capitals?: Record<string, string>;
  pieces?: Map<string, any>;
  inventories?: { p1?: Record<string, number>; p2?: Record<string, number> };
  rng?: { intInRange(min: number, max: number): number };
}): GameState {
  const [p1, p2] = makePlayers();
  const players = [p1, p2];

  const builder = new MapBuilder();
  for (let q = 0; q <= 4; q++) builder.addTile({ q, r: 0 }, 'plains');
  const map = builder.build();

  const playerManager = new PlayerManager(players);
  const rounds = new RoundManager(players, new ClockwiseTurnOrder(), [PHASE], 'command');

  const invMap = new Map<string, SimpleInventory>([
    ['p1', makeInventory(opts.inventories?.p1 ?? { gold: 10, food: 10, wood: 5, iron: 5 })],
    ['p2', makeInventory(opts.inventories?.p2 ?? { gold: 10, food: 10, wood: 5, iron: 5 })],
  ]);

  return {
    extras: {
      'k:ownership':       opts.ownership ?? {},
      'k:capitals':        opts.capitals  ?? {},
      'k:movedThisTurn':   [],
      'k:attackedFrom':    [],
      'k:nextPieceId':     100,
      'k:tileLoyalty':     {},
      'k:mortgagedCities': [],
    },
    map,
    pieces: opts.pieces ?? new Map(),
    inventories: invMap as unknown as GameState['inventories'],
    rounds,
    players: playerManager,
    rng: opts.rng ?? { intInRange: (min: number) => min },
  } as unknown as GameState;
}

const T = (q: number) => `${q},0`;

function mkUnit(kind: string, id: string, owner: string, tileId: string) {
  return makeUnitFromRegistry(kingdomsPieces, { id, kind, owner, tileId });
}

// ── Scenario 1: Capital capture → elimination → victory ───────────────────────

describe('Integration: capital capture → player elimination → game won', () => {
  // Capturing any tile — including a capital — now requires a surviving Noble
  // to erode loyalty across 3 successful attacks (100 → 55 → 10 → captured).
  // Raw combat victory alone never transfers ownership.
  function attackThreeTimes(state: GameState, fromTileId: string, toTileId: string) {
    let events = attackTileExecutor.execute(state, action('attack-tile', 'p1', { fromTileId, toTileId }));
    state.extras['k:attackedFrom'] = [];
    events = attackTileExecutor.execute(state, action('attack-tile', 'p1', { fromTileId, toTileId }));
    state.extras['k:attackedFrom'] = [];
    events = attackTileExecutor.execute(state, action('attack-tile', 'p1', { fromTileId, toTileId }));
    return events;
  }

  it('eliminates p2 when their capital is captured and p1 is declared winner', () => {
    // Map: T0(p1 capital) — T1(p1) — T2(p2 capital)
    const pieces = new Map<string, any>([
      ['cn1', mkUnit('cannoneer', 'cn1', 'p1', T(1))],
      ['cn2', mkUnit('cannoneer', 'cn2', 'p1', T(1))],
      ['n1',  mkUnit('noble',     'n1',  'p1', T(1))],
      ['sp2', mkUnit('spearman',  'sp2', 'p2', T(2))],
    ]);
    const state = buildState({
      ownership: { [T(0)]: 'p1', [T(1)]: 'p1', [T(2)]: 'p2' },
      capitals:  { p1: T(0), p2: T(2) }, // T(2) is p2's capital
      pieces,
    });

    const events = attackThreeTimes(state, T(1), T(2));

    // Battle resolved and tile captured (on the third attack)
    expect(events.some((e) => e.type === 'battle-resolved')).toBe(true);
    expect(events.some((e) => e.type === 'tile-captured')).toBe(true);

    // p2 eliminated
    expect(events.some((e) => e.type === 'player-eliminated')).toBe(true);
    expect(state.players.isEliminated('p2')).toBe(true);
    expect(state.players.active()).toHaveLength(1);
    expect(state.players.active()[0]!.id).toBe('p1');

    // Victory condition fires
    const victory = lastPlayerStanding.evaluate(state);
    expect(victory).not.toBeNull();
    expect(victory!.winner).toBe('p1');
  });

  it('all p2 pieces are removed when eliminated', () => {
    const pieces = new Map<string, any>([
      ['cn1', mkUnit('cannoneer', 'cn1', 'p1', T(1))],
      ['cn2', mkUnit('cannoneer', 'cn2', 'p1', T(1))],
      ['n1',  mkUnit('noble',     'n1',  'p1', T(1))],
      ['sp2', mkUnit('spearman',  'sp2', 'p2', T(2))], // on capital
      ['sp3', mkUnit('spearman',  'sp3', 'p2', T(3))], // on a different p2 tile
    ]);
    const state = buildState({
      ownership: { [T(0)]: 'p1', [T(1)]: 'p1', [T(2)]: 'p2', [T(3)]: 'p2' },
      capitals:  { p1: T(0), p2: T(2) },
      pieces,
    });

    attackThreeTimes(state, T(1), T(2));

    // All p2 pieces removed (including units on non-capital tiles)
    expect(state.pieces.has('sp2')).toBe(false);
    expect(state.pieces.has('sp3')).toBe(false);

    // p2's remote tile was neutralised
    const ownership = state.extras['k:ownership'] as Record<string, string>;
    expect(ownership[T(3)]).toBeUndefined();

    // p1's units survive and capital tile captured
    expect(state.pieces.has('cn1')).toBe(true);
    expect(state.pieces.has('cn2')).toBe(true);
    expect(ownership[T(2)]).toBe('p1');
  });

  it('game does NOT end when a non-capital tile is captured', () => {
    const pieces = new Map<string, any>([
      ['cn1', mkUnit('cannoneer', 'cn1', 'p1', T(1))],
      ['cn2', mkUnit('cannoneer', 'cn2', 'p1', T(1))],
      ['n1',  mkUnit('noble',     'n1',  'p1', T(1))],
      ['sp2', mkUnit('spearman',  'sp2', 'p2', T(2))],
    ]);
    const state = buildState({
      ownership: { [T(0)]: 'p1', [T(1)]: 'p1', [T(2)]: 'p2' },
      capitals:  { p1: T(0), p2: T(4) }, // p2 capital is at T(4) — NOT attacked
      pieces,
    });

    attackThreeTimes(state, T(1), T(2));

    expect(state.players.isEliminated('p2')).toBe(false);
    expect(lastPlayerStanding.evaluate(state)).toBeNull();
  });

  it('a single attack without a Noble never captures the capital', () => {
    const pieces = new Map<string, any>([
      ['cn1', mkUnit('cannoneer', 'cn1', 'p1', T(1))],
      ['cn2', mkUnit('cannoneer', 'cn2', 'p1', T(1))],
      ['sp2', mkUnit('spearman',  'sp2', 'p2', T(2))],
    ]);
    const state = buildState({
      ownership: { [T(0)]: 'p1', [T(1)]: 'p1', [T(2)]: 'p2' },
      capitals:  { p1: T(0), p2: T(2) },
      pieces,
    });

    const events = attackTileExecutor.execute(
      state,
      action('attack-tile', 'p1', { fromTileId: T(1), toTileId: T(2) }),
    );

    expect(events.some((e) => e.type === 'tile-captured')).toBe(false);
    expect(events.some((e) => e.type === 'player-eliminated')).toBe(false);
    expect(state.players.isEliminated('p2')).toBe(false);
    expect((state.extras['k:ownership'] as Record<string, string>)[T(2)]).toBe('p2');
  });
});

// ── Scenario 2: Multi-round food deficit (no starvation attrition) ───────────

describe('Integration: a food deficit never disbands units', () => {
  it('processRoundEnd is triggered by endTurn when both players pass', () => {
    // p1 has 2 spearmen, 0 food, 0 gold — deficit goes unmet, units survive
    const pieces = new Map<string, any>([
      ['sp1', mkUnit('spearman', 'sp1', 'p1', T(0))],
      ['sp2', mkUnit('spearman', 'sp2', 'p1', T(0))],
    ]);
    const state = buildState({
      ownership:   { [T(0)]: 'p1', [T(4)]: 'p2' },
      capitals:    { p1: T(0), p2: T(4) },
      pieces,
      inventories: { p1: { gold: 0, food: 0 }, p2: { gold: 0, food: 0 } },
    });

    // p1 ends turn: no round yet (seat 0 → seat 1, no wrap)
    const p1Events = endTurnExecutor.execute(state, action('end-turn', 'p1'));
    expect(p1Events.some((e) => e.type === 'round-ended')).toBe(false);
    expect(state.pieces.has('sp1')).toBe(true); // still alive before round end

    // p2 ends turn: round advances (seat 1 → seat 0 = wrap → newRound=true)
    const p2Events = endTurnExecutor.execute(state, action('end-turn', 'p2'));
    expect(p2Events.some((e) => e.type === 'round-ended')).toBe(true);

    // p1's spearmen survive the deficit — no attrition mechanic exists
    expect(state.pieces.has('sp1')).toBe(true);
    expect(state.pieces.has('sp2')).toBe(true);

    // p2 is unaffected
    expect(state.players.isEliminated('p2')).toBe(false);
  });

  it('gold exchange covers a food deficit when affordable', () => {
    // p1 has 1 spearman (needs 1 food/round), 0 food, but 3 gold → can exchange
    const pieces = new Map<string, any>([
      ['sp1', mkUnit('spearman', 'sp1', 'p1', T(0))],
    ]);
    const state = buildState({
      ownership:   { [T(0)]: 'p1', [T(4)]: 'p2' },
      capitals:    { p1: T(0), p2: T(4) },
      pieces,
      inventories: { p1: { gold: 3, food: 0 }, p2: { gold: 0, food: 0 } },
    });

    endTurnExecutor.execute(state, action('end-turn', 'p1'));
    const p2Events = endTurnExecutor.execute(state, action('end-turn', 'p2'));

    // Food was purchased with gold
    expect(p2Events.some((e) => e.type === 'food-purchased' && e.playerId === 'p1')).toBe(true);
    expect(state.pieces.has('sp1')).toBe(true);
  });

  it('player with adequate food loses no units', () => {
    const pieces = new Map<string, any>([
      ['sp1', mkUnit('spearman', 'sp1', 'p1', T(0))],
      ['sp2', mkUnit('spearman', 'sp2', 'p1', T(0))],
    ]);
    const state = buildState({
      ownership:   { [T(0)]: 'p1', [T(4)]: 'p2' },
      capitals:    { p1: T(0), p2: T(4) },
      pieces,
      inventories: { p1: { gold: 0, food: 10 }, p2: { gold: 0, food: 5 } },
    });

    endTurnExecutor.execute(state, action('end-turn', 'p1'));
    endTurnExecutor.execute(state, action('end-turn', 'p2'));

    expect(state.pieces.has('sp1')).toBe(true);
    expect(state.pieces.has('sp2')).toBe(true);
    // Food consumed normally
    const inv = (state.inventories as unknown as Map<string, SimpleInventory>).get('p1')!;
    expect(inv.get('food')).toBe(8); // 10 - 2 spearmen
  });
});

// ── Scenario 3: Noble occupation via loyalty (attack-driven) ─────────────────

describe('Integration: Noble occupation — loyalty erodes via attack, not movement', () => {
  it('captures an unowned tile after three attacks across separate turns', () => {
    // Layout: T0 (p1 capital) — T1 (p1, adjacent to neutral T2) — T2 (neutral)
    const nobleId = 'noble1';
    const pieces = new Map<string, any>([
      ['cn1',  mkUnit('cannoneer', 'cn1',  'p1', T(1))],
      [nobleId, mkUnit('noble',    nobleId, 'p1', T(1))],
    ]);
    const state = buildState({
      ownership:   { [T(0)]: 'p1', [T(1)]: 'p1' }, // T(2) is neutral
      capitals:    { p1: T(0), p2: T(4) },
      pieces,
      inventories: { p1: { gold: 0, food: 10 }, p2: { gold: 0, food: 10 } },
    });

    // Attack 1: loyalty 100 -> 55, no capture
    let events = attackTileExecutor.execute(state, action('attack-tile', 'p1', { fromTileId: T(1), toTileId: T(2) }));
    expect(events.some((e) => e.type === 'tile-loyalty-reduced')).toBe(true);
    expect(events.some((e) => e.type === 'tile-captured')).toBe(false);
    expect((state.extras['k:ownership'] as Record<string, string>)[T(2)]).toBeUndefined();

    // Simulate ending the turn (resets k:attackedFrom; round doesn't need to advance)
    endTurnExecutor.execute(state, action('end-turn', 'p1'));

    // Attack 2: loyalty 55 -> 10, no capture
    events = attackTileExecutor.execute(state, action('attack-tile', 'p1', { fromTileId: T(1), toTileId: T(2) }));
    expect(events.some((e) => e.type === 'tile-captured')).toBe(false);

    endTurnExecutor.execute(state, action('end-turn', 'p1'));

    // Attack 3: loyalty 10 -> captured
    events = attackTileExecutor.execute(state, action('attack-tile', 'p1', { fromTileId: T(1), toTileId: T(2) }));
    expect(events.some((e) => e.type === 'tile-captured')).toBe(true);
    expect((state.extras['k:ownership'] as Record<string, string>)[T(2)]).toBe('p1');
  });

  it('moving a Noble onto an unowned tile is rejected — only attacking it works', () => {
    const nobleId = 'noble1';
    const pieces = new Map<string, any>([
      [nobleId, mkUnit('noble', nobleId, 'p1', T(0))],
    ]);
    const state = buildState({
      ownership: { [T(0)]: 'p1' }, // T(1) is neutral
      capitals:  { p1: T(0) },
      pieces,
    });

    const result = moveUnitValidator.validate(
      state,
      action('move-unit', 'p1', { pieceId: nobleId, targetTileId: T(1) }),
    );
    expect(result?.code).toBe('not-owned');
  });

  it('loyalty recovers +10 at round-end if no further attack lands', () => {
    // p1 attacks once (loyalty 100 -> 55), then both players end their turn,
    // completing a full round without a second attack → loyalty recovers to 65.
    const nobleId = 'noble1';
    const pieces = new Map<string, any>([
      ['cn1',  mkUnit('cannoneer', 'cn1',  'p1', T(1))],
      [nobleId, mkUnit('noble',    nobleId, 'p1', T(1))],
    ]);
    const state = buildState({
      ownership:   { [T(0)]: 'p1', [T(1)]: 'p1', [T(4)]: 'p2' },
      capitals:    { p1: T(0), p2: T(4) },
      pieces,
      inventories: { p1: { gold: 0, food: 10 }, p2: { gold: 0, food: 10 } },
    });

    attackTileExecutor.execute(state, action('attack-tile', 'p1', { fromTileId: T(1), toTileId: T(2) }));
    let loyalty = state.extras['k:tileLoyalty'] as Record<string, { loyalty: number }>;
    expect(loyalty[T(2)]!.loyalty).toBe(55);

    // p1 ends turn (no round yet), p2 ends turn (round completes)
    endTurnExecutor.execute(state, action('end-turn', 'p1'));
    const p2Events = endTurnExecutor.execute(state, action('end-turn', 'p2'));
    expect(p2Events.some((e) => e.type === 'round-ended')).toBe(true);

    loyalty = state.extras['k:tileLoyalty'] as Record<string, { loyalty: number }>;
    expect(loyalty[T(2)]!.loyalty).toBe(65);
  });

  it('a Noble that dies in combat does not erode loyalty, leaving the tile unowned', () => {
    // p1's noble + spearman attack an unowned tile DEFENDED by a strong enemy
    // garrison that happens to be sitting there (e.g. retreated units) — the
    // attacker loses outright, so the Noble dies and loyalty is untouched.
    const nobleId = 'noble1';
    const pieces = new Map<string, any>([
      ['sp1', mkUnit('spearman', 'sp1', 'p1', T(1))],
      [nobleId, mkUnit('noble', nobleId, 'p1', T(1))],
      ['cn_a', mkUnit('cannoneer', 'cn_a', 'p2', T(2))],
      ['cn_b', mkUnit('cannoneer', 'cn_b', 'p2', T(2))],
      ['cn_c', mkUnit('cannoneer', 'cn_c', 'p2', T(2))],
    ]);
    const state = buildState({
      ownership: { [T(0)]: 'p1', [T(1)]: 'p1' }, // T(2)'s owner left undefined intentionally
      capitals:  { p1: T(0) },
      pieces,
    });

    const events = attackTileExecutor.execute(
      state,
      action('attack-tile', 'p1', { fromTileId: T(1), toTileId: T(2) }),
    );

    expect(state.pieces.has(nobleId)).toBe(false); // Noble died
    expect(events.some((e) => e.type === 'tile-loyalty-reduced')).toBe(false);
    expect(events.some((e) => e.type === 'tile-captured')).toBe(false);
    expect((state.extras['k:ownership'] as Record<string, string>)[T(2)]).toBeUndefined();
  });
});
