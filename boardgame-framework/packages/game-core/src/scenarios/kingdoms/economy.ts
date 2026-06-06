/**
 * Pure income calculation functions for Kingdoms of Dominion.
 *
 * Every function takes plain data, never GameState. This means:
 *   - Each function can be unit-tested with a simple fixture
 *   - The frontend can import and call them for income previews without any
 *     server round-trip
 *   - income.ts (the state-integration layer) and economy-loop.ts (Step 7)
 *     both delegate here; neither duplicates the formula
 *
 * ── Balance knobs ─────────────────────────────────────────────────────────────
 * All tunable numbers live in this file. A weekly balance pass = edits here only.
 * Structure stats (costs, defense, food) live in structures.ts.
 *
 * ── Income model ──────────────────────────────────────────────────────────────
 * Every connected tile produces two things each round:
 *
 *   1. Gold  = floor(tile.economicValue × goldMultiplier) + goldFlat
 *              Gold is terrain-agnostic. High-value centre tiles produce more.
 *
 *   2. Resource = floor(BASE_RESOURCE_YIELD × resourceMultiplier), typed by
 *                 tile.resourceType (food/wood/iron). Null tiles produce nothing.
 *
 * Structures on a tile modify the multipliers and bonuses for that tile only.
 */

import { STRUCTURE_DEFS, type StructureIncomeEffect } from './structures.js';
import { UNIT_STATS } from './pieces.js';

// Re-export so callers that import from economy.ts still get the type
export type { StructureIncomeEffect };

// ── Balance constants ─────────────────────────────────────────────────────────

/** Gold produced per point of economicValue per round. Raise to accelerate the economy. */
export const GOLD_PER_ECONOMIC_VALUE = 1;

/**
 * Base resource units a tile produces per round (before structure multipliers).
 * Two because it makes farm's 1.5× multiplier round to 3 (floor(2 × 1.5) = 3),
 * giving a visible +1 bonus. At 1 base the farm produces no visible bonus.
 */
export const BASE_RESOURCE_YIELD = 2;

/** Gold required to purchase 1 unit of any resource on the open market. */
export const EXCHANGE_RATE = 3;

/**
 * Gold cost to develop one barren or undeveloped tile, permanently boosting
 * its resource output by BASE_RESOURCE_YIELD units per round.
 * See actions/develop.ts and income.ts for how this applies.
 */
export const DEVELOP_COST = 8;

/**
 * Attrition disbands units in this order when a player cannot feed their army.
 * Listed from first-to-disband to last.
 *
 * Current policy: spearmen first (most expendable), cannoneers last (hardest
 * to replace). Change this array to reprioritize without touching executor code.
 */
export const ATTRITION_PRIORITY: ReadonlyArray<string> = ['spearman', 'noble', 'cannoneer'];

// ── Structure income effects (derived from structures.ts) ─────────────────────

/**
 * Per-structure income modifiers, keyed by structure kind.
 *
 * Derived from STRUCTURE_DEFS — the single source of truth in structures.ts.
 * Changing a structure's economic impact = one edit in structures.ts.
 *
 * Kept as a standalone exported constant so economy.test.ts and frontend code
 * can inspect it without importing structures.ts.
 */
export const STRUCTURE_INCOME_EFFECTS: Readonly<Record<string, StructureIncomeEffect>> =
  Object.fromEntries(
    Object.entries(STRUCTURE_DEFS).map(([kind, def]) => [kind, def.incomeEffect]),
  );

// ── Pure calculation functions ─────────────────────────────────────────────────

export interface TileIncome {
  readonly gold: number;
  readonly resource: string | null;
  readonly resourceAmount: number;
}

/**
 * Income a single connected tile produces this round.
 *
 * @param tile            Any object that carries optional properties (Tile satisfies this)
 * @param structureKinds  List of structure kinds present on the tile (0 or 1 in practice)
 */
export function calculateTileIncome(
  tile: { readonly properties?: Readonly<Record<string, unknown>> },
  structureKinds: ReadonlyArray<string>,
): TileIncome {
  const economicValue  = (tile.properties?.['economicValue'] as number | undefined) ?? 1;
  const resourceType   = (tile.properties?.['resourceType']  as string | null | undefined) ?? null;

  let goldMultiplier      = 1.0;
  let goldFlat            = 0;
  let resourceMultiplier  = 1.0;

  for (const kind of structureKinds) {
    const fx = STRUCTURE_INCOME_EFFECTS[kind];
    if (!fx) continue;
    goldMultiplier     *= fx.goldMultiplier;
    goldFlat           += fx.goldFlat;
    // Take the highest resource multiplier if multiple structures ever stack
    resourceMultiplier  = Math.max(resourceMultiplier, fx.resourceMultiplier);
  }

  const gold           = Math.floor(economicValue * GOLD_PER_ECONOMIC_VALUE * goldMultiplier) + goldFlat;
  const resourceAmount = resourceType ? Math.floor(BASE_RESOURCE_YIELD * resourceMultiplier) : 0;

  return {
    gold,
    resource:       resourceAmount > 0 ? resourceType : null,
    resourceAmount,
  };
}

/**
 * Total food military units consume per round.
 *
 * @param unitKinds  All unit kinds currently fielded by the player
 */
export function calculateFoodConsumption(unitKinds: ReadonlyArray<string>): number {
  return unitKinds.reduce((total, kind) => total + (UNIT_STATS[kind]?.foodPerRound ?? 0), 0);
}

/**
 * Total food structures consume per round.
 *
 * Currently only City (2 food/round) has a non-zero value. This is separate
 * from unit food consumption so the two can be tracked and reported distinctly
 * in events (city-food-consumed vs food-consumed) and so attrition logic
 * (which only disbands units, not structures) can use each number separately.
 *
 * @param structureKinds  All structure kinds owned by the player
 */
export function calculateStructureFoodCost(structureKinds: ReadonlyArray<string>): number {
  return structureKinds.reduce(
    (total, kind) => total + (STRUCTURE_DEFS[kind as keyof typeof STRUCTURE_DEFS]?.foodCostPerRound ?? 0),
    0,
  );
}

/**
 * Aggregate gold income from all tiles a player holds and has connected to their capital.
 *
 * @param connectedTiles          Tiles reachable via BFS from the capital
 * @param structureKindsByTileId  Map of tileId → structure kinds on that tile
 */
export function calculateGoldIncome(
  connectedTiles: ReadonlyArray<{ readonly id: string; readonly properties?: Readonly<Record<string, unknown>> }>,
  structureKindsByTileId: ReadonlyMap<string, ReadonlyArray<string>>,
): number {
  return connectedTiles.reduce((total, tile) => {
    const kinds = structureKindsByTileId.get(tile.id) ?? [];
    return total + calculateTileIncome(tile, kinds).gold;
  }, 0);
}
