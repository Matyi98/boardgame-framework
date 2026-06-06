/**
 * PieceRegistry and balance constants for Kingdoms of Dominion.
 *
 * Structure constants (costs, defense, income effects, food) come from
 * structures.ts — the single source of truth. This file only adds:
 *   - UNIT_STATS: military unit combat and food constants
 *   - kingdomsPieces: the PieceRegistry that feeds makeUnitFromRegistry()
 *
 * Adding a new unit = add to UNIT_STATS + one registry.register() call.
 * Adding a new structure = edit structures.ts only (no change needed here).
 */

import { PieceRegistry } from '../../pieces/piece-registry.js';
import {
  STRUCTURE_DEFS,
  STRUCTURE_KINDS,
  BUILDABLE_STRUCTURES,
  type StructureKind,
  type StructureDef,
} from './structures.js';

// Re-export structure constants so callers can still import from pieces.ts
// without knowing about structures.ts.
export { STRUCTURE_KINDS, BUILDABLE_STRUCTURES };
export type { StructureKind, StructureDef };

// ── Unit stats ─────────────────────────────────────────────────────────────────

export interface UnitStats {
  attack: number;
  foodPerRound: number;
  hp: number;
}

/** Authoritative balance constants for military units. */
export const UNIT_STATS: Readonly<Record<string, UnitStats>> = {
  'spearman':  { attack: 2, foodPerRound: 1, hp: 1 },
  'cannoneer': { attack: 5, foodPerRound: 2, hp: 2 },
  'noble':     { attack: 3, foodPerRound: 1, hp: 1 },
};

// ── Structure stats (derived from STRUCTURE_DEFS) ─────────────────────────────

export interface StructureStats {
  hp: number;
  defenseMultiplier: number;
}

/**
 * Derived from STRUCTURE_DEFS in structures.ts.
 *
 * Used by scenario.ts (initial HP) and actions/attack.ts (defense multiplier
 * during combat). Kept as a named export so callers don't need to import
 * structures.ts directly.
 */
export const STRUCTURE_STATS: Readonly<Record<string, StructureStats>> = Object.fromEntries(
  Object.entries(STRUCTURE_DEFS).map(([kind, def]) => [
    kind,
    { hp: def.hp, defenseMultiplier: def.defenseMultiplier },
  ]),
);

export const UNIT_KINDS = new Set(Object.keys(UNIT_STATS));

// ── Registry ──────────────────────────────────────────────────────────────────

/**
 * PieceRegistry for kingdoms-v1.
 *
 * Structure entries are built programmatically from STRUCTURE_DEFS, so a new
 * structure in structures.ts automatically appears in the registry.
 *
 * Unit entries remain explicit — unit meta (category, cost, limits) isn't
 * captured by UNIT_STATS and doesn't have a parallel canonical table yet.
 */

function buildRegistry(): PieceRegistry {
  const registry = new PieceRegistry();

  // Register all structures from STRUCTURE_DEFS
  for (const def of Object.values(STRUCTURE_DEFS)) {
    registry.register({
      kind:         def.kind,
      category:     'building',
      displayName:  def.displayName,
      ...(Object.keys(def.buildCost).length > 0 ? { cost: def.buildCost } : {}),
      ...(def.limitPerPlayer !== undefined ? { limitPerPlayer: def.limitPerPlayer } : {}),
      defaultStats: { hp: def.hp, defenseMultiplier: def.defenseMultiplier },
    });
  }

  // Register military units
  registry.register({
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
  });

  registry.register({
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
  });

  registry.register({
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

  return registry;
}

export const kingdomsPieces = buildRegistry();
