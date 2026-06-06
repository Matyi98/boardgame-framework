import { PieceRegistry } from '../../pieces/piece-registry.js';

/**
 * Balance knobs: all costs, attack values, HP, food costs, and defense
 * multipliers are defined here. Changing a unit's stats = one-line edit,
 * zero changes to validators or executors.
 *
 * defaultStats are merged into Piece.stats at creation time by makeUnit()
 * (or makeUnitFromRegistry()). resolveAttack() reads Piece.stats['attack']
 * directly, so the value flows from this constant through to combat with no
 * manual threading.
 */

// ── Unit stats (numeric, used in combat and economy formulas) ─────────────────

export interface UnitStats {
  attack: number;
  foodPerRound: number;
  hp: number;
}

export interface StructureStats {
  hp: number;
  /** Defense multiplier applied to all defenders on this tile (StructureEffect). */
  defenseMultiplier: number;
}

/** Authoritative balance constants. Referenced by income.ts and combat helpers. */
export const UNIT_STATS: Readonly<Record<string, UnitStats>> = {
  'spearman':  { attack: 2, foodPerRound: 1, hp: 1 },
  'cannoneer': { attack: 5, foodPerRound: 2, hp: 2 },
  'noble':     { attack: 3, foodPerRound: 1, hp: 1 },
};

export const STRUCTURE_STATS: Readonly<Record<string, StructureStats>> = {
  'capital-base': { hp: 5, defenseMultiplier: 1.0 },
  'farm':         { hp: 3, defenseMultiplier: 1.0 },
  'city':         { hp: 3, defenseMultiplier: 1.0 },
  'castle':       { hp: 4, defenseMultiplier: 2.0 },
  'gate':         { hp: 2, defenseMultiplier: 1.0 },
};

export const UNIT_KINDS      = new Set(Object.keys(UNIT_STATS));
export const STRUCTURE_KINDS = new Set(Object.keys(STRUCTURE_STATS));
export const BUILDABLE_STRUCTURES = new Set(['farm', 'city', 'castle', 'gate']);

// ── Registry ──────────────────────────────────────────────────────────────────

/**
 * PieceRegistry for kingdoms-v1. Each piece definition carries:
 *   cost        — resource cost to build/recruit
 *   limitPerPlayer — max instances per player
 *   defaultStats — numeric stats merged into Piece.stats at creation
 *   meta        — non-numeric display/category data
 *
 * defaultStats enables resolveAttack() to read Piece.stats['attack'] without
 * any scenario-specific accessor — the value is on the piece itself.
 */
export const kingdomsPieces = new PieceRegistry()
  .register({
    kind: 'capital-base',
    category: 'building',
    displayName: 'Capital Base',
    limitPerPlayer: 1,
    defaultStats: { hp: STRUCTURE_STATS['capital-base']!.hp, defenseMultiplier: STRUCTURE_STATS['capital-base']!.defenseMultiplier },
  })
  .register({
    kind: 'farm',
    category: 'building',
    displayName: 'Farm',
    cost: { wood: 2 },
    limitPerPlayer: 5,
    defaultStats: { hp: STRUCTURE_STATS['farm']!.hp, defenseMultiplier: STRUCTURE_STATS['farm']!.defenseMultiplier },
  })
  .register({
    kind: 'city',
    category: 'building',
    displayName: 'City',
    cost: { wood: 3, iron: 2 },
    limitPerPlayer: 3,
    defaultStats: { hp: STRUCTURE_STATS['city']!.hp, defenseMultiplier: STRUCTURE_STATS['city']!.defenseMultiplier },
  })
  .register({
    kind: 'castle',
    category: 'building',
    displayName: 'Castle',
    cost: { wood: 4, iron: 3 },
    limitPerPlayer: 3,
    defaultStats: { hp: STRUCTURE_STATS['castle']!.hp, defenseMultiplier: STRUCTURE_STATS['castle']!.defenseMultiplier },
  })
  .register({
    kind: 'gate',
    category: 'building',
    displayName: 'Gate',
    cost: { wood: 2, iron: 1 },
    defaultStats: { hp: STRUCTURE_STATS['gate']!.hp, defenseMultiplier: STRUCTURE_STATS['gate']!.defenseMultiplier },
  })
  .register({
    kind: 'spearman',
    category: 'unit',
    displayName: 'Spearman',
    cost: { iron: 1, food: 1 },
    limitPerPlayer: 20,
    defaultStats: {
      attack:       UNIT_STATS['spearman']!.attack,
      foodPerRound: UNIT_STATS['spearman']!.foodPerRound,
      hp:           UNIT_STATS['spearman']!.hp,
    },
  })
  .register({
    kind: 'cannoneer',
    category: 'unit',
    displayName: 'Cannoneer',
    cost: { iron: 3, food: 2 },
    limitPerPlayer: 8,
    defaultStats: {
      attack:       UNIT_STATS['cannoneer']!.attack,
      foodPerRound: UNIT_STATS['cannoneer']!.foodPerRound,
      hp:           UNIT_STATS['cannoneer']!.hp,
    },
  })
  .register({
    kind: 'noble',
    category: 'unit',
    displayName: 'Noble',
    cost: { gold: 5 },
    limitPerPlayer: 2,
    defaultStats: {
      attack:       UNIT_STATS['noble']!.attack,
      foodPerRound: UNIT_STATS['noble']!.foodPerRound,
      hp:           UNIT_STATS['noble']!.hp,
    },
  });
