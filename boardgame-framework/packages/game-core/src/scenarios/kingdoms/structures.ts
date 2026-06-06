/**
 * Canonical structure definitions for Kingdoms of Dominion.
 *
 * ═══════════════════════════════════════════════════════
 *  SINGLE SOURCE OF TRUTH FOR ALL STRUCTURE DATA
 * ═══════════════════════════════════════════════════════
 *
 * Adding a new structure = add ONE entry to STRUCTURE_DEFS.
 * pieces.ts and economy.ts derive their constants from this file;
 * no other file needs to change for a simple structure addition.
 *
 * Weekly balance changes (costs, defense, income): edit STRUCTURE_DEFS only.
 *
 * ── Structure summary ─────────────────────────────────────────────────────────
 *
 *  Kind          | Cost           | Def  | Income effect        | Food/round
 *  --------------|----------------|------|----------------------|------------
 *  capital-base  | (starting)     | 2.0× | +1 gold flat         | 0
 *  farm          | 2 Wood         | 1.0× | +50% resource yield  | 0
 *  city          | 3 Wood + 2 Iron| 1.0× | ×2 gold on tile      | 2
 *  castle        | 4 Wood + 3 Iron| 2.0× | none                 | 0
 *  gate          | 2 Wood + 1 Iron| 1.0× | none (re-connects)   | 0
 *
 * See structures/README.md for full design rationale.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type StructureKind = 'capital-base' | 'farm' | 'city' | 'castle' | 'gate';

export interface StructureIncomeEffect {
  /** Flat gold added AFTER the multiplier (not multiplied). e.g. capital-base +1. */
  readonly goldFlat: number;
  /** Applied to tile's economicValue-based gold. 2.0 = double gold. */
  readonly goldMultiplier: number;
  /** Applied to tile's base resource yield. 1.5 = +50% resources. */
  readonly resourceMultiplier: number;
}

export interface StructureDef {
  readonly kind: StructureKind;
  readonly displayName: string;
  /**
   * Resource cost to place this structure. Empty record for capital-base
   * which is placed by game setup, not by the build action.
   */
  readonly buildCost: Readonly<Record<string, number>>;
  /** Max instances per player. undefined = no limit. */
  readonly limitPerPlayer: number | undefined;
  /** Hit points. Tracked in Piece.state['hp'] at runtime. */
  readonly hp: number;
  /**
   * Defense multiplier applied to all defenders on this tile during combat.
   * Stacks multiplicatively with terrain defense bonus.
   * 1.0 = no bonus, 2.0 = defenders at double effective strength.
   */
  readonly defenseMultiplier: number;
  /** Per-tile income modifiers applied each round to gold and resource output. */
  readonly incomeEffect: StructureIncomeEffect;
  /**
   * Food this structure consumes per round (beyond military units).
   * Currently only City consumes food; all others are 0.
   * Tracked in computeFoodCost() via calculateStructureFoodCost().
   */
  readonly foodCostPerRound: number;
  /** false for capital-base — placed by setup, not by the build action. */
  readonly canBeBuilt: boolean;
}

// ── Canonical table ───────────────────────────────────────────────────────────

export const STRUCTURE_DEFS: Readonly<Record<StructureKind, StructureDef>> = {
  'capital-base': {
    kind:            'capital-base',
    displayName:     'Capital Base',
    buildCost:       {},
    limitPerPlayer:  1,
    hp:              5,
    defenseMultiplier: 2.0,
    incomeEffect:    { goldFlat: 1, goldMultiplier: 1.0, resourceMultiplier: 1.0 },
    foodCostPerRound: 0,
    canBeBuilt:      false,
  },

  farm: {
    kind:            'farm',
    displayName:     'Farm',
    buildCost:       { wood: 2 },
    limitPerPlayer:  5,
    hp:              3,
    defenseMultiplier: 1.0,
    incomeEffect:    { goldFlat: 0, goldMultiplier: 1.0, resourceMultiplier: 1.5 },
    foodCostPerRound: 0,
    canBeBuilt:      true,
  },

  city: {
    kind:            'city',
    displayName:     'City',
    buildCost:       { wood: 3, iron: 2 },
    limitPerPlayer:  3,
    hp:              3,
    defenseMultiplier: 1.0,
    incomeEffect:    { goldFlat: 0, goldMultiplier: 2.0, resourceMultiplier: 1.0 },
    foodCostPerRound: 2,
    canBeBuilt:      true,
  },

  castle: {
    kind:            'castle',
    displayName:     'Castle',
    buildCost:       { wood: 4, iron: 3 },
    limitPerPlayer:  3,
    hp:              4,
    defenseMultiplier: 2.0,
    incomeEffect:    { goldFlat: 0, goldMultiplier: 1.0, resourceMultiplier: 1.0 },
    foodCostPerRound: 0,
    canBeBuilt:      true,
  },

  gate: {
    kind:            'gate',
    displayName:     'Gate',
    buildCost:       { wood: 2, iron: 1 },
    limitPerPlayer:  undefined,
    hp:              2,
    defenseMultiplier: 1.0,
    incomeEffect:    { goldFlat: 0, goldMultiplier: 1.0, resourceMultiplier: 1.0 },
    foodCostPerRound: 0,
    canBeBuilt:      true,
  },
} as const;

// ── Derived sets (re-exported for callers) ────────────────────────────────────

/** All structure kinds (including capital-base). */
export const STRUCTURE_KINDS = new Set<string>(Object.keys(STRUCTURE_DEFS));

/** Structure kinds that a player can place via the build-structure action. */
export const BUILDABLE_STRUCTURES = new Set<string>(
  Object.values(STRUCTURE_DEFS)
    .filter((d) => d.canBeBuilt)
    .map((d) => d.kind),
);
