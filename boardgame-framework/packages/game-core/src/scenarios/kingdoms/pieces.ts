/**
 * PieceRegistry and derived stat constants for Kingdoms of Dominion.
 *
 * Both unit and structure data have their own Single Source of Truth files:
 *   units.ts      → combat stats, movement, food, occupation flag, recruit cost
 *   structures.ts → hp, defense, income effects, food cost, build cost
 *
 * This file only wires those definitions into the PieceRegistry so the rest of
 * the framework (makeUnitFromRegistry, cost lookup, limit enforcement) can work
 * without knowing about either source file.
 *
 * Adding a new unit     → edit units.ts only (registry entry built here automatically)
 * Adding a new structure → edit structures.ts only (registry entry built here automatically)
 */

import { PieceRegistry } from '../../pieces/piece-registry.js';
import {
  UNIT_DEFS,
  UNIT_KINDS,
  COMBAT_UNIT_KINDS,
  type UnitKind,
  type UnitDef,
} from './units.js';
import {
  STRUCTURE_DEFS,
  STRUCTURE_KINDS,
  BUILDABLE_STRUCTURES,
  type StructureKind,
  type StructureDef,
} from './structures.js';

// Re-export so callers that import from pieces.ts don't need to know where things live
export { UNIT_KINDS, COMBAT_UNIT_KINDS, STRUCTURE_KINDS, BUILDABLE_STRUCTURES };
export type { UnitKind, UnitDef, StructureKind, StructureDef };

// ── Derived stat shapes ───────────────────────────────────────────────────────

/**
 * Runtime-accessible unit combat and logistics stats, keyed by unit kind.
 * Derived from UNIT_DEFS — the single source of truth in units.ts.
 *
 * economy.ts reads foodPerRound from here.
 * Validators may read movement / attack as needed.
 * These are also stored on Piece.stats via makeUnitFromRegistry().
 */
export interface UnitStats {
  readonly attack: number;
  readonly defense: number;
  readonly movement: number;
  readonly foodPerRound: number;
  readonly hp: number;
}

export const UNIT_STATS: Readonly<Record<string, UnitStats>> = Object.fromEntries(
  Object.entries(UNIT_DEFS).map(([kind, def]) => [
    kind,
    {
      attack:       def.attack,
      defense:      def.defense,
      movement:     def.movement,
      foodPerRound: def.foodPerRound,
      hp:           def.hp,
    },
  ]),
);

/**
 * Structure combat and income stats, keyed by structure kind.
 * Derived from STRUCTURE_DEFS — the single source of truth in structures.ts.
 *
 * Used by scenario.ts (initial HP) and actions/attack.ts (defenseMultiplier).
 */
export interface StructureStats {
  readonly hp: number;
  readonly defenseMultiplier: number;
}

export const STRUCTURE_STATS: Readonly<Record<string, StructureStats>> = Object.fromEntries(
  Object.entries(STRUCTURE_DEFS).map(([kind, def]) => [
    kind,
    { hp: def.hp, defenseMultiplier: def.defenseMultiplier },
  ]),
);

// ── Registry ──────────────────────────────────────────────────────────────────

/**
 * PieceRegistry for kingdoms-v1.
 *
 * Both structures and units are now built programmatically from their definition
 * tables, so adding a new piece type to either source file automatically creates
 * the registry entry here — no manual wiring needed.
 */
function buildRegistry(): PieceRegistry {
  const registry = new PieceRegistry();

  // ── Structures (from STRUCTURE_DEFS) ──────────────────────────────────────
  for (const def of Object.values(STRUCTURE_DEFS)) {
    registry.register({
      kind:        def.kind,
      category:    'building',
      displayName: def.displayName,
      ...(Object.keys(def.buildCost).length > 0 ? { cost: def.buildCost } : {}),
      ...(def.limitPerPlayer !== undefined ? { limitPerPlayer: def.limitPerPlayer } : {}),
      defaultStats: { hp: def.hp, defenseMultiplier: def.defenseMultiplier },
    });
  }

  // ── Units (from UNIT_DEFS) ────────────────────────────────────────────────
  for (const def of Object.values(UNIT_DEFS)) {
    registry.register({
      kind:        def.kind,
      category:    'unit',
      displayName: def.displayName,
      cost:        def.buildCost,
      ...(def.limitPerPlayer !== undefined ? { limitPerPlayer: def.limitPerPlayer } : {}),
      defaultStats: {
        attack:       def.attack,
        defense:      def.defense,
        movement:     def.movement,
        foodPerRound: def.foodPerRound,
        hp:           def.hp,
      },
    });
  }

  return registry;
}

export const kingdomsPieces = buildRegistry();
