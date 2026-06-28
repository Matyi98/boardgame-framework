/**
 * Tests for attackTileValidator and attackTileExecutor.
 *
 * Test strategy: fixture-based minimal GameState. Each test builds only the
 * state fields the attack actions read, then asserts events + mutations.
 *
 * Map layout (linear strip, all plains):
 *   (0,0) — p1 capital
 *   (1,0) — p1 attacking tile  (adjacent to capital and target)
 *   (2,0) — p2 tile / target
 *   (3,0) — p2 capital (default, so T(2) captures are non-capital)
 *   (4,0) — isolated (not reachable from p1 capital when (2,0)–(3,0) are enemy)
 */

import { describe, it, expect } from 'vitest';
import { attackTileValidator, attackTileExecutor } from '../actions/attack.js';
import { COMBAT_UNIT_KINDS, UNIT_KINDS } from '../pieces.js';
import { MapBuilder } from '../../../map/map-builder.js';

// ── Event payload types (for type-safe test assertions) ───────────────────────
interface BattleResolvedPayload { attackerWins: boolean; fromTileId: string; toTileId: string; attackerCasualties: number; defenderCasualties: number; attackerStrength: number; defenderStrength: number }
interface PlayerEliminatedPayload { eliminatedPlayerId: string; byPlayerId: string }

function battlePayload(ev: { payload: unknown } | undefined): BattleResolvedPayload | undefined {
  return ev?.payload as BattleResolvedPayload | undefined;
}
function elimPayload(ev: { payload: unknown } | undefined): PlayerEliminatedPayload | undefined {
  return ev?.payload as PlayerEliminatedPayload | undefined;
}
import { makeUnitFromRegistry } from '../../../pieces/unit.js';
import { kingdomsPieces } from '../pieces.js';
import type { GameState } from '../../../state/game-state.js';
import type { Piece } from '../../../pieces/piece.js';

// ── Map ───────────────────────────────────────────────────────────────────────

function buildMap() {
  const builder = new MapBuilder();
  for (let q = 0; q <= 4; q++) builder.addTile({ q, r: 0 }, 'plains');
  return builder.build();
}

const MAP = buildMap();
const T = (q: number) => `${q},0`;

// ── State factory ─────────────────────────────────────────────────────────────

interface StateOpts {
  ownership?: Record<string, string>;
  capitals?: Record<string, string>;
  pieces?: Map<string, Piece>;
  activePlayer?: string;
  attackedFrom?: string[];
}

function makeState(opts: StateOpts = {}): GameState {
  // Closure-shared Set so eliminate() + isEliminated() see the same data
  const eliminated = new Set<string>();

  return {
    extras: {
      'k:ownership':     opts.ownership    ?? {},
      'k:capitals':      opts.capitals     ?? {},
      'k:movedThisTurn': [],
      'k:attackedFrom':  opts.attackedFrom ?? [],
      'k:nextPieceId':   100,
      'k:tileLoyalty':   {},
      'k:mortgagedCities': [],
    },
    map:    MAP,
    pieces: (opts.pieces ?? new Map()) as GameState['pieces'],
    inventories: new Map() as unknown as GameState['inventories'],
    // RNG always returns min index → deterministic: first element in shuffle dies
    rng: { intInRange: (_min: number, _max: number) => _min },
    rounds: {
      turn: () => ({ activePlayer: opts.activePlayer ?? 'p1' }),
    } as unknown as GameState['rounds'],
    players: {
      isEliminated: (id: string) => eliminated.has(id),
      eliminate:    (id: string) => { eliminated.add(id); },
      all:          () => [{ id: 'p1' }, { id: 'p2' }],
      active:       () => [{ id: 'p1' }, { id: 'p2' }].filter((p) => !eliminated.has(p.id)),
    } as unknown as GameState['players'],
  } as unknown as GameState;
}

function action(type: string, playerId: string, payload: Record<string, unknown> = {}) {
  return { type, playerId, payload } as any;
}

// ── Piece helpers ──────────────────────────────────────────────────────────────

function mkPiece(kind: string, id: string, owner: string, tileId: string): Piece {
  return makeUnitFromRegistry(kingdomsPieces, { id, kind, owner, tileId }) as unknown as Piece;
}

const spearman  = (id: string, owner: string, tileId: string) => mkPiece('spearman',  id, owner, tileId);
const cannoneer = (id: string, owner: string, tileId: string) => mkPiece('cannoneer', id, owner, tileId);
const noble     = (id: string, owner: string, tileId: string) => mkPiece('noble',     id, owner, tileId);
const city      = (id: string, owner: string, tileId: string) => mkPiece('city',      id, owner, tileId);

// ── Standard scenario helpers ─────────────────────────────────────────────────
//
// Attacker: 2 cannoneers on T(1) → strength = 16 × √2 ≈ 22.6
// Defender: 1 spearman  on T(2) → strength = 3  × √1  = 3
// Attacker always wins decisively with 0 attacker casualties.

function makeStrongAttackState(extraPieces: Array<[string, Piece]> = [], opts: Partial<StateOpts> = {}) {
  const pieces = new Map<string, Piece>([
    ['cn1', cannoneer('cn1', 'p1', T(1))],
    ['cn2', cannoneer('cn2', 'p1', T(1))],
    ['sp2', spearman('sp2',  'p2', T(2))],
    ...extraPieces,
  ]);
  return makeState({
    ownership:   { [T(0)]: 'p1', [T(1)]: 'p1', [T(2)]: 'p2' },
    capitals:    { p1: T(0), p2: T(3) },
    pieces,
    activePlayer: 'p1',
    ...opts,
  });
}

// ── Validator tests ────────────────────────────────────────────────────────────

describe('attackTileValidator', () => {
  it('passes for a valid attack on an enemy tile', () => {
    const state = makeStrongAttackState();
    const res = attackTileValidator.validate(
      state, action('attack-tile', 'p1', { fromTileId: T(1), toTileId: T(2) }),
    );
    expect(res).toBeNull();
  });

  it('passes for a valid attack on a neutral tile', () => {
    const pieces = new Map<string, Piece>([['cn1', cannoneer('cn1', 'p1', T(1))]]);
    const state = makeState({
      ownership:   { [T(0)]: 'p1', [T(1)]: 'p1' }, // T(2) is neutral
      capitals:    { p1: T(0) },
      pieces,
      activePlayer: 'p1',
    });
    const res = attackTileValidator.validate(
      state, action('attack-tile', 'p1', { fromTileId: T(1), toTileId: T(2) }),
    );
    expect(res).toBeNull();
  });

  it('rejects when it is not your turn', () => {
    const state = makeStrongAttackState();
    const res = attackTileValidator.validate(
      state, action('attack-tile', 'p2', { fromTileId: T(2), toTileId: T(1) }),
    );
    expect(res?.code).toBe('not-your-turn');
  });

  it('rejects when attacker does not own the from-tile', () => {
    const state = makeStrongAttackState();
    const res = attackTileValidator.validate(
      state, action('attack-tile', 'p1', { fromTileId: T(2), toTileId: T(1) }),
    );
    expect(res?.code).toBe('not-owned');
  });

  it('rejects when the from-tile is not connected to the capital', () => {
    // p1 owns T(0) (capital) and T(4), but the path T(1)–T(3) is neutral
    const pieces = new Map<string, Piece>([['cn1', cannoneer('cn1', 'p1', T(4))]]);
    const state = makeState({
      ownership:   { [T(0)]: 'p1', [T(4)]: 'p1' },
      capitals:    { p1: T(0) },
      pieces,
      activePlayer: 'p1',
    });
    const res = attackTileValidator.validate(
      state, action('attack-tile', 'p1', { fromTileId: T(4), toTileId: T(3) }),
    );
    expect(res?.code).toBe('disconnected');
  });

  it('rejects attacking your own tile', () => {
    const state = makeStrongAttackState();
    const res = attackTileValidator.validate(
      state, action('attack-tile', 'p1', { fromTileId: T(1), toTileId: T(0) }),
    );
    expect(res?.code).toBe('own-tile');
  });

  it('rejects when tiles are not adjacent', () => {
    const state = makeStrongAttackState();
    const res = attackTileValidator.validate(
      state, action('attack-tile', 'p1', { fromTileId: T(0), toTileId: T(2) }),
    );
    expect(res?.code).toBe('not-adjacent');
  });

  it('rejects when there are no units at all on the from-tile', () => {
    const pieces = new Map<string, Piece>(); // T(1) is empty
    const state = makeState({
      ownership:   { [T(0)]: 'p1', [T(1)]: 'p1', [T(2)]: 'p2' },
      capitals:    { p1: T(0) },
      pieces,
      activePlayer: 'p1',
    });
    const res = attackTileValidator.validate(
      state, action('attack-tile', 'p1', { fromTileId: T(1), toTileId: T(2) }),
    );
    expect(res?.code).toBe('no-units');
  });

  it('rejects when only Nobles occupy the from-tile', () => {
    const pieces = new Map<string, Piece>([['n1', noble('n1', 'p1', T(1))]]);
    const state = makeState({
      ownership:   { [T(0)]: 'p1', [T(1)]: 'p1', [T(2)]: 'p2' },
      capitals:    { p1: T(0) },
      pieces,
      activePlayer: 'p1',
    });
    const res = attackTileValidator.validate(
      state, action('attack-tile', 'p1', { fromTileId: T(1), toTileId: T(2) }),
    );
    expect(res?.code).toBe('no-combat-units');
  });

  it('passes when a Noble is present alongside combat units', () => {
    const pieces = new Map<string, Piece>([
      ['cn1', cannoneer('cn1', 'p1', T(1))],
      ['n1',  noble('n1',     'p1', T(1))],
    ]);
    const state = makeState({
      ownership:   { [T(0)]: 'p1', [T(1)]: 'p1', [T(2)]: 'p2' },
      capitals:    { p1: T(0) },
      pieces,
      activePlayer: 'p1',
    });
    const res = attackTileValidator.validate(
      state, action('attack-tile', 'p1', { fromTileId: T(1), toTileId: T(2) }),
    );
    expect(res).toBeNull();
  });

  it('rejects when the from-tile has already attacked this turn', () => {
    const state = makeStrongAttackState([], { attackedFrom: [T(1)] });
    const res = attackTileValidator.validate(
      state, action('attack-tile', 'p1', { fromTileId: T(1), toTileId: T(2) }),
    );
    expect(res?.code).toBe('already-attacked');
  });
});

// ── Executor — attacker wins, no Noble in the force ───────────────────────────
//
// Raw combat victory alone never transfers ownership any more — only a
// surviving Noble eroding loyalty to 0 does (see the next describe block).

describe('attackTileExecutor — attacker wins, no Noble in force', () => {
  it('removes all defender pieces but does not transfer ownership', () => {
    const state = makeStrongAttackState();
    attackTileExecutor.execute(
      state, action('attack-tile', 'p1', { fromTileId: T(1), toTileId: T(2) }),
    );
    expect(state.pieces.has('sp2')).toBe(false);
    expect((state.extras['k:ownership'] as Record<string, string>)[T(2)]).toBe('p2');
  });

  it('emits battle-resolved but no tile-captured event', () => {
    const state = makeStrongAttackState();
    const events = attackTileExecutor.execute(
      state, action('attack-tile', 'p1', { fromTileId: T(1), toTileId: T(2) }),
    );
    const battleEv = events.find((e) => e.type === 'battle-resolved');
    expect(battlePayload(battleEv)?.attackerWins).toBe(true);
    expect(battlePayload(battleEv)?.fromTileId).toBe(T(1));
    expect(battlePayload(battleEv)?.toTileId).toBe(T(2));
    expect(events.some((e) => e.type === 'tile-captured')).toBe(false);
  });

  it('does not transfer structure ownership without a Noble', () => {
    const c1 = city('c1', 'p2', T(2));
    const state = makeStrongAttackState([['c1', c1]]);
    attackTileExecutor.execute(
      state, action('attack-tile', 'p1', { fromTileId: T(1), toTileId: T(2) }),
    );
    expect(state.pieces.get('c1')?.owner).toBe('p2');
  });

  it('appends from-tile to k:attackedFrom', () => {
    const state = makeStrongAttackState();
    attackTileExecutor.execute(
      state, action('attack-tile', 'p1', { fromTileId: T(1), toTileId: T(2) }),
    );
    expect((state.extras['k:attackedFrom'] as string[])).toContain(T(1));
  });

  it('does not capture an undefended unowned tile without a Noble', () => {
    const pieces = new Map<string, Piece>([['cn1', cannoneer('cn1', 'p1', T(1))]]);
    const state = makeState({
      ownership:   { [T(0)]: 'p1', [T(1)]: 'p1' }, // T(2) is neutral
      capitals:    { p1: T(0) },
      pieces,
      activePlayer: 'p1',
    });
    const events = attackTileExecutor.execute(
      state, action('attack-tile', 'p1', { fromTileId: T(1), toTileId: T(2) }),
    );
    const ev = events.find((e) => e.type === 'battle-resolved')!;
    expect(battlePayload(ev)?.attackerWins).toBe(true);
    expect(battlePayload(ev)?.attackerCasualties).toBe(0);
    expect(state.pieces.has('cn1')).toBe(true);
    expect((state.extras['k:ownership'] as Record<string, string>)[T(2)]).toBeUndefined();
    expect(events.some((e) => e.type === 'tile-captured')).toBe(false);
  });
});

// ── Executor — force strength must count every attacking unit kind ───────────
//
// Ticket #49: the frontend's strength preview was filtering attackers to
// spearman/cannoneer only, silently dropping any Noble from both Σatk and
// the unit count under √ — "a Noble can't attack" (§5) means it can't
// *initiate* a solo attack on an enemy tile (attackTileValidator's job),
// not that its ATK is excluded once a battle happens. This test pins the
// engine's actual behavior — pieceAsCombatant() + computeStrength() apply no
// kind filtering at all — so a future regression here fails loudly instead
// of silently, the same way it did in the frontend preview.

describe('attackTileExecutor — force strength includes every attacking unit kind (ticket #49)', () => {
  it('counts Nobles\' ATK and adds them to the unit count under √ (§8 worked example)', () => {
    const pieces = new Map<string, Piece>([
      ['sp1', spearman('sp1', 'p1', T(1))],
      ['sp2', spearman('sp2', 'p1', T(1))],
      ['sp3', spearman('sp3', 'p1', T(1))],
      ['nb1', noble('nb1', 'p1', T(1))],
      ['nb2', noble('nb2', 'p1', T(1))],
      ['def1', spearman('def1', 'p2', T(2))],
    ]);
    const state = makeState({
      ownership:    { [T(0)]: 'p1', [T(1)]: 'p1', [T(2)]: 'p2' },
      capitals:     { p1: T(0), p2: T(3) },
      pieces,
      activePlayer: 'p1',
    });
    const events = attackTileExecutor.execute(
      state,
      action('attack-tile', 'p1', {
        fromTileId: T(1),
        toTileId: T(2),
        unitIds: ['sp1', 'sp2', 'sp3', 'nb1', 'nb2'],
      }),
    );
    const ev = events.find((e) => e.type === 'battle-resolved');
    // 3 spearmen (ATK 3 each) + 2 Nobles (ATK 1 each): Σatk = 11, count = 5
    expect(battlePayload(ev)?.attackerStrength).toBeCloseTo(11 * Math.sqrt(5));
  });
});

// ── Executor — occupation via a surviving Noble (loyalty) ────────────────────

describe('attackTileExecutor — occupation via surviving Noble', () => {
  function makeStrongAttackStateWithNoble(extraPieces: Array<[string, Piece]> = [], opts: Partial<StateOpts> = {}) {
    const pieces = new Map<string, Piece>([
      ['cn1', cannoneer('cn1', 'p1', T(1))],
      ['cn2', cannoneer('cn2', 'p1', T(1))],
      ['n1',  noble('n1',      'p1', T(1))],
      ['sp2', spearman('sp2',  'p2', T(2))],
      ...extraPieces,
    ]);
    return makeState({
      ownership:   { [T(0)]: 'p1', [T(1)]: 'p1', [T(2)]: 'p2' },
      capitals:    { p1: T(0), p2: T(3) },
      pieces,
      activePlayer: 'p1',
      ...opts,
    });
  }

  it('reduces loyalty by 45 on the first successful attack, no capture yet', () => {
    const state = makeStrongAttackStateWithNoble();
    const events = attackTileExecutor.execute(
      state, action('attack-tile', 'p1', { fromTileId: T(1), toTileId: T(2) }),
    );
    expect(events.some((e) => e.type === 'tile-captured')).toBe(false);
    const loyaltyEv = events.find((e) => e.type === 'tile-loyalty-reduced');
    expect(loyaltyEv).toBeDefined();
    expect((loyaltyEv!.payload as { loyalty: number }).loyalty).toBe(55);
    expect((state.extras['k:ownership'] as Record<string, string>)[T(2)]).toBe('p2');
  });

  it('captures a non-capital tile on the third successful attack and transfers structures', () => {
    const c1 = city('c1', 'p2', T(2));
    const state = makeStrongAttackStateWithNoble([['c1', c1]]);
    attackTileExecutor.execute(state, action('attack-tile', 'p1', { fromTileId: T(1), toTileId: T(2) })); // 100 -> 55
    state.extras['k:attackedFrom'] = []; // simulate ending/starting a turn between attacks
    attackTileExecutor.execute(state, action('attack-tile', 'p1', { fromTileId: T(1), toTileId: T(2) })); // 55 -> 10
    state.extras['k:attackedFrom'] = [];
    const events = attackTileExecutor.execute(state, action('attack-tile', 'p1', { fromTileId: T(1), toTileId: T(2) })); // 10 -> captured

    expect(events.some((e) => e.type === 'tile-captured')).toBe(true);
    expect((state.extras['k:ownership'] as Record<string, string>)[T(2)]).toBe('p1');
    expect(state.pieces.get('c1')?.owner).toBe('p1');
    expect(events.some((e) => e.type === 'player-eliminated')).toBe(false);
  });

  it('captures an unowned tile on the third successful attack', () => {
    const pieces = new Map<string, Piece>([
      ['cn1', cannoneer('cn1', 'p1', T(1))],
      ['n1',  noble('n1',      'p1', T(1))],
    ]);
    const state = makeState({
      ownership:   { [T(0)]: 'p1', [T(1)]: 'p1' }, // T(2) is neutral
      capitals:    { p1: T(0) },
      pieces,
      activePlayer: 'p1',
    });
    attackTileExecutor.execute(state, action('attack-tile', 'p1', { fromTileId: T(1), toTileId: T(2) }));
    state.extras['k:attackedFrom'] = [];
    attackTileExecutor.execute(state, action('attack-tile', 'p1', { fromTileId: T(1), toTileId: T(2) }));
    state.extras['k:attackedFrom'] = [];
    const events = attackTileExecutor.execute(state, action('attack-tile', 'p1', { fromTileId: T(1), toTileId: T(2) }));

    expect(events.some((e) => e.type === 'tile-captured')).toBe(true);
    expect((state.extras['k:ownership'] as Record<string, string>)[T(2)]).toBe('p1');
  });

  it('does not reduce loyalty if the Noble dies in combat', () => {
    // Attacker (spearman + noble) is overwhelmed by 3 cannoneers → attacker loses, all attacker units die
    const pieces = new Map<string, Piece>([
      ['sp1', spearman('sp1', 'p1', T(1))],
      ['n1',  noble('n1',     'p1', T(1))],
      ['cn_a', cannoneer('cn_a', 'p2', T(2))],
      ['cn_b', cannoneer('cn_b', 'p2', T(2))],
      ['cn_c', cannoneer('cn_c', 'p2', T(2))],
    ]);
    const state = makeState({
      ownership:   { [T(0)]: 'p1', [T(1)]: 'p1', [T(2)]: 'p2' },
      capitals:    { p1: T(0), p2: T(3) },
      pieces,
      activePlayer: 'p1',
    });
    const events = attackTileExecutor.execute(
      state, action('attack-tile', 'p1', { fromTileId: T(1), toTileId: T(2) }),
    );
    expect(state.pieces.has('n1')).toBe(false); // Noble died
    expect(events.some((e) => e.type === 'tile-loyalty-reduced')).toBe(false);
    expect(events.some((e) => e.type === 'tile-captured')).toBe(false);
  });
});

// ── Executor — defender wins ───────────────────────────────────────────────────

describe('attackTileExecutor — defender wins', () => {
  // 1 spearman (str ≈ 3) attacks 3 cannoneers (str ≈ 24√3 ≈ 41.6) → defenders win
  it('removes all attacker pieces', () => {
    const pieces = new Map<string, Piece>([
      ['sp1',  spearman('sp1',   'p1', T(1))],
      ['cn_a', cannoneer('cn_a', 'p2', T(2))],
      ['cn_b', cannoneer('cn_b', 'p2', T(2))],
      ['cn_c', cannoneer('cn_c', 'p2', T(2))],
    ]);
    const state = makeState({
      ownership:   { [T(0)]: 'p1', [T(1)]: 'p1', [T(2)]: 'p2' },
      capitals:    { p1: T(0), p2: T(3) },
      pieces,
      activePlayer: 'p1',
    });
    const events = attackTileExecutor.execute(
      state, action('attack-tile', 'p1', { fromTileId: T(1), toTileId: T(2) }),
    );
    expect(state.pieces.has('sp1')).toBe(false);
    expect(events.some((e) => e.type === 'tile-captured')).toBe(false);
    expect((state.extras['k:ownership'] as Record<string, string>)[T(2)]).toBe('p2');
    expect(battlePayload(events.find((e) => e.type === 'battle-resolved'))?.attackerWins).toBe(false);
  });
});

// ── Executor — capital capture / player elimination ───────────────────────────

describe('attackTileExecutor — capital capture', () => {
  it('does not eliminate the defender on the first or second attack, only the third', () => {
    const pieces = new Map<string, Piece>([
      ['cn1', cannoneer('cn1', 'p1', T(1))],
      ['cn2', cannoneer('cn2', 'p1', T(1))],
      ['n1',  noble('n1',      'p1', T(1))],
      ['sp2', spearman('sp2',  'p2', T(2))], // on capital tile
      ['sp3', spearman('sp3',  'p2', T(3))], // on another p2 tile
    ]);
    const state = makeState({
      ownership:   { [T(0)]: 'p1', [T(1)]: 'p1', [T(2)]: 'p2', [T(3)]: 'p2' },
      capitals:    { p1: T(0), p2: T(2) }, // T(2) is p2's capital
      pieces,
      activePlayer: 'p1',
    });

    const events1 = attackTileExecutor.execute(state, action('attack-tile', 'p1', { fromTileId: T(1), toTileId: T(2) }));
    expect(events1.some((e) => e.type === 'player-eliminated')).toBe(false);
    expect(state.players.isEliminated('p2')).toBe(false);
    state.extras['k:attackedFrom'] = [];

    const events2 = attackTileExecutor.execute(state, action('attack-tile', 'p1', { fromTileId: T(1), toTileId: T(2) }));
    expect(events2.some((e) => e.type === 'player-eliminated')).toBe(false);
    state.extras['k:attackedFrom'] = [];

    const events3 = attackTileExecutor.execute(state, action('attack-tile', 'p1', { fromTileId: T(1), toTileId: T(2) }));
    expect(state.players.isEliminated('p2')).toBe(true);
    // All p2 pieces removed
    expect(state.pieces.has('sp2')).toBe(false);
    expect(state.pieces.has('sp3')).toBe(false);
    // Captured tile given to attacker; other p2 tile neutralised
    const ownership = state.extras['k:ownership'] as Record<string, string>;
    expect(ownership[T(2)]).toBe('p1');
    expect(ownership[T(3)]).toBeUndefined();
    // Events
    expect(events3.some((e) => e.type === 'player-eliminated')).toBe(true);
    const elimEv = events3.find((e) => e.type === 'player-eliminated')!;
    expect(elimPayload(elimEv)?.eliminatedPlayerId).toBe('p2');
    expect(elimPayload(elimEv)?.byPlayerId).toBe('p1');
  });

  it('does not transfer structure when capital is captured (elimination removes all p2 pieces)', () => {
    const pieces = new Map<string, Piece>([
      ['cn1', cannoneer('cn1', 'p1', T(1))],
      ['cn2', cannoneer('cn2', 'p1', T(1))],
      ['n1',  noble('n1',      'p1', T(1))],
      ['sp2', spearman('sp2',  'p2', T(2))],
      ['c1',  city('c1',       'p2', T(2))],
    ]);
    const state = makeState({
      ownership:   { [T(0)]: 'p1', [T(1)]: 'p1', [T(2)]: 'p2' },
      capitals:    { p1: T(0), p2: T(2) }, // T(2) is p2's capital
      pieces,
      activePlayer: 'p1',
    });
    attackTileExecutor.execute(state, action('attack-tile', 'p1', { fromTileId: T(1), toTileId: T(2) }));
    state.extras['k:attackedFrom'] = [];
    attackTileExecutor.execute(state, action('attack-tile', 'p1', { fromTileId: T(1), toTileId: T(2) }));
    state.extras['k:attackedFrom'] = [];
    attackTileExecutor.execute(state, action('attack-tile', 'p1', { fromTileId: T(1), toTileId: T(2) }));
    // City deleted with all other p2 pieces during elimination
    expect(state.pieces.has('c1')).toBe(false);
    expect(state.players.isEliminated('p2')).toBe(true);
  });
});

// ── Executor — RNG casualty selection ─────────────────────────────────────────

describe('attackTileExecutor — RNG casualty selection', () => {
  it('uses rng to determine which attacker unit dies (not always the first)', () => {
    // 4 cannoneers vs 3 cannoneers on plains:
    //   attacker strength = 32 × √4 = 64
    //   defender strength = 24 × √3 ≈ 41.6
    //   ratio ≈ 0.65 → casualtyCount = floor(4 × 0.65 × 0.5) = 1
    const pieces = new Map<string, Piece>([
      ['a1', cannoneer('a1', 'p1', T(1))],
      ['a2', cannoneer('a2', 'p1', T(1))],
      ['a3', cannoneer('a3', 'p1', T(1))],
      ['a4', cannoneer('a4', 'p1', T(1))],
      ['d1', cannoneer('d1', 'p2', T(2))],
      ['d2', cannoneer('d2', 'p2', T(2))],
      ['d3', cannoneer('d3', 'p2', T(2))],
    ]);
    const state = makeState({
      ownership:   { [T(0)]: 'p1', [T(1)]: 'p1', [T(2)]: 'p2' },
      capitals:    { p1: T(0), p2: T(3) },
      pieces,
      activePlayer: 'p1',
    });

    // RNG always returns max index → Fisher-Yates places last element in first slot
    // pickRandom([a1,a2,a3,a4], 1, rng): swap i=0 with j=3 → ['a4','a2','a3','a1'] → picks a4
    (state as any).rng = { intInRange: (_: number, max: number) => max };

    const events = attackTileExecutor.execute(
      state, action('attack-tile', 'p1', { fromTileId: T(1), toTileId: T(2) }),
    );
    const ev = events.find((e) => e.type === 'battle-resolved')!;
    expect(battlePayload(ev)?.attackerWins).toBe(true);
    expect(battlePayload(ev)?.attackerCasualties).toBe(1);
    expect(state.pieces.has('a4')).toBe(false); // last one selected by rng
    expect(state.pieces.has('a1')).toBe(true);
    expect(state.pieces.has('a2')).toBe(true);
    expect(state.pieces.has('a3')).toBe(true);
  });

  it('with rng always returning min, first attacker unit dies', () => {
    const pieces = new Map<string, Piece>([
      ['a1', cannoneer('a1', 'p1', T(1))],
      ['a2', cannoneer('a2', 'p1', T(1))],
      ['a3', cannoneer('a3', 'p1', T(1))],
      ['a4', cannoneer('a4', 'p1', T(1))],
      ['d1', cannoneer('d1', 'p2', T(2))],
      ['d2', cannoneer('d2', 'p2', T(2))],
      ['d3', cannoneer('d3', 'p2', T(2))],
    ]);
    const state = makeState({
      ownership:   { [T(0)]: 'p1', [T(1)]: 'p1', [T(2)]: 'p2' },
      capitals:    { p1: T(0), p2: T(3) },
      pieces,
      activePlayer: 'p1',
    });
    // Default rng (returns min) → swap i=0 with j=0 = no-op → a1 dies

    attackTileExecutor.execute(
      state, action('attack-tile', 'p1', { fromTileId: T(1), toTileId: T(2) }),
    );
    expect(state.pieces.has('a1')).toBe(false);
    expect(state.pieces.has('a2')).toBe(true);
  });
});

// ── COMBAT_UNIT_KINDS membership ──────────────────────────────────────────────

describe('COMBAT_UNIT_KINDS', () => {
  it('includes spearman and cannoneer but not noble', () => {
    expect(COMBAT_UNIT_KINDS.has('spearman')).toBe(true);
    expect(COMBAT_UNIT_KINDS.has('cannoneer')).toBe(true);
    expect(COMBAT_UNIT_KINDS.has('noble')).toBe(false);
  });

  it('is a subset of UNIT_KINDS', () => {
    for (const kind of COMBAT_UNIT_KINDS) {
      expect(UNIT_KINDS.has(kind)).toBe(true);
    }
  });
});
