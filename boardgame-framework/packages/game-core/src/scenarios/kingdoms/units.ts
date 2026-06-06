/**
 * Single Source of Truth for all military unit definitions in Kingdoms of Dominion.
 *
 * Adding a new unit type = add ONE entry to UNIT_DEFS.
 * pieces.ts derives UNIT_STATS, UNIT_KINDS, and the PieceRegistry entries from here,
 * so no other file needs to change for a new unit.
 *
 * Balance knobs: edit the values in UNIT_DEFS.
 * Structural knobs (new fields): extend UnitDef, then update pieces.ts defaultStats.
 *
 * ── Occupation mechanic ───────────────────────────────────────────────────────
 * Units with canOccupyUnowned=true (currently: Noble) may move to unowned tiles.
 * The tile is not immediately claimed; instead, a two-turn occupation resolves:
 *
 *   Turn N:   Noble moves to unowned tile X → noble-occupying event;
 *             entry added to k:pendingOccupations.
 *   EndTurn N: k:pendingOccupations → k:confirmedOccupations (promoted).
 *   Turn N+1:  Player does other things.
 *   EndTurn N+1: k:confirmedOccupations resolved → if Noble still on X (and X
 *               still unowned) → tile-captured event, X granted to player.
 *
 * See actions/move.ts, actions/end-turn.ts, and units/README.md for implementation.
 */

export type UnitKind = 'spearman' | 'cannoneer' | 'noble';

export interface UnitDef {
  /** Unique identifier, matches PieceRegistry kind. */
  readonly kind: UnitKind;
  readonly displayName: string;
  /**
   * Resources spent to recruit this unit.
   * Drawn from the player's inventory by recruitUnitExecutor.
   */
  readonly buildCost: Readonly<Record<string, number>>;
  /** Maximum number of this unit type a single player may field simultaneously. */
  readonly limitPerPlayer: number | undefined;

  // ── Combat stats ─────────────────────────────────────────────────────────────
  /** Starting (and max) hit points. Stored in Piece.state['hp'] at runtime. */
  readonly hp: number;
  /** Raw attack power — fed into resolveAttack(). */
  readonly attack: number;
  /** Defensive resilience — available for resolveAttack() extensions. */
  readonly defense: number;

  // ── Logistics stats ──────────────────────────────────────────────────────────
  /** Maximum tile hops the unit can make per turn. */
  readonly movement: number;
  /** Food units consumed per round. Triggers attrition if unmet. */
  readonly foodPerRound: number;
  /**
   * Whether this unit type may move onto (and occupy) unowned tiles.
   * false → unit is restricted to player-owned tiles when moving.
   * true  → unit may traverse and settle on unowned tiles (Noble mechanic).
   */
  readonly canOccupyUnowned: boolean;
}

export const UNIT_DEFS: Readonly<Record<UnitKind, UnitDef>> = {
  'spearman': {
    kind:             'spearman',
    displayName:      'Spearman',
    buildCost:        { gold: 10, food: 1 },
    limitPerPlayer:   20,
    hp:               10,
    attack:           3,
    defense:          5,
    movement:         1,
    foodPerRound:     1,
    canOccupyUnowned: false,
  },
  'cannoneer': {
    kind:             'cannoneer',
    displayName:      'Cannoneer',
    buildCost:        { gold: 20, iron: 2 },
    limitPerPlayer:   8,
    hp:               6,
    attack:           8,
    defense:          2,
    movement:         1,
    foodPerRound:     2,
    canOccupyUnowned: false,
  },
  'noble': {
    kind:             'noble',
    displayName:      'Noble',
    buildCost:        { gold: 30, iron: 1, food: 1 },
    limitPerPlayer:   2,
    hp:               8,
    attack:           1,
    defense:          3,
    movement:         2,
    foodPerRound:     1,
    canOccupyUnowned: true,
  },
};

/** All unit kinds as a Set — for quick membership checks. */
export const UNIT_KINDS = new Set<string>(Object.keys(UNIT_DEFS));

/** Unit kinds that may move onto and occupy unowned tiles. */
export const OCCUPYING_UNIT_KINDS = new Set<string>(
  Object.values(UNIT_DEFS).filter((d) => d.canOccupyUnowned).map((d) => d.kind),
);
