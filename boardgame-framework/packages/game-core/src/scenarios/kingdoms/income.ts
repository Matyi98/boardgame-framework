/**
 * State-integration layer for Kingdoms income.
 *
 * This module reads GameState and delegates all math to economy.ts pure functions.
 * It is the only place in the kingdoms scenario that couples the income model to
 * GameState — everything else either calls economy.ts directly or calls these helpers.
 *
 * Separation of concerns:
 *   economy.ts   — pure functions, testable in isolation, importable by frontend
 *   income.ts    — state queries + economy.ts calls; used by endTurnExecutor
 *   economy-loop.ts (Step 7) — full per-round batch processing using both layers
 *
 * ── Develop tile override ──────────────────────────────────────────────────────
 * When a player spends gold to develop a tile (develop-tile action), the tile ID
 * is added to state.extras['k:developed']. For each developed tile, computeIncome
 * adds BASE_RESOURCE_YIELD units of the tile's effective resource type on top of
 * the normal tile income. Tiles with null resourceType get the terrain's natural
 * resource (plains→food, etc.) via TERRAIN_DEVELOPS_INTO (actions/develop.ts).
 *
 * Tile.properties is immutable, so the override is stored in extras and applied
 * here at the integration layer, keeping calculateTileIncome() fully pure.
 */

import type { GameState } from '../../state/game-state.js';
import type { PlayerId } from '../../players/player.js';
import {
  calculateTileIncome,
  calculateFoodConsumption,
  calculateStructureFoodCost,
  BASE_RESOURCE_YIELD,
  ATTRITION_PRIORITY,
} from './economy.js';
import { STRUCTURE_KINDS, UNIT_STATS } from './pieces.js';
import { playerConnectedTiles } from './connectivity.js';
import { TERRAIN_DEVELOPS_INTO } from './actions/develop.js';

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Extract a tileId → [structureKind, ...] map from all pieces in state. */
function buildStructureMap(state: GameState): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const [, piece] of state.pieces) {
    if (!STRUCTURE_KINDS.has(piece.kind)) continue;
    if (piece.location.kind !== 'tile') continue;
    const tid = (piece.location as { kind: 'tile'; tileId: string }).tileId;
    const list = result.get(tid);
    if (list) list.push(piece.kind);
    else result.set(tid, [piece.kind]);
  }
  return result;
}

/** Set of tile IDs that have been developed (via develop-tile action). */
function getDeveloped(state: GameState): Set<string> {
  const raw = state.extras['k:developed'] as string[] | undefined;
  return raw ? new Set(raw) : new Set<string>();
}

// ── Public API ─────────────────────────────────────────────────────────────────

export interface IncomeResult {
  readonly wood: number;
  readonly food: number;
  readonly iron: number;
  readonly gold: number;
}

/**
 * Compute resources a player earns at end-of-turn from their connected territory.
 *
 * Every connected tile contributes:
 *   - gold  = floor(economicValue × structureMultiplier) + structureBonus
 *   - resource = floor(BASE_RESOURCE_YIELD × structureMultiplier) of the tile's resourceType
 *
 * Developed tiles receive an additional +BASE_RESOURCE_YIELD of their resource.
 * Tiles not reachable via BFS from the capital produce nothing.
 */
export function computeIncome(state: GameState, playerId: PlayerId): IncomeResult {
  const result = { wood: 0, food: 0, iron: 0, gold: 0 };

  const capitals = (state.extras['k:capitals'] as Record<string, string>) ?? {};
  if (!capitals[playerId]) return result;

  // Gate bridge tiles are included automatically via playerConnectedTiles().
  const connected  = playerConnectedTiles(state.map, state, playerId);
  const structures = buildStructureMap(state);
  const developed  = getDeveloped(state);

  for (const tileId of connected) {
    const tile = state.map.tileById(tileId);
    if (!tile) continue;

    const kinds  = structures.get(tileId) ?? [];
    const income = calculateTileIncome(tile, kinds);

    result.gold += income.gold;

    // Add one branch here whenever a new non-gold resource type is added to the game.
    if (income.resource && income.resourceAmount > 0) {
      addResource(result, income.resource, income.resourceAmount);
    }

    // Develop bonus: +BASE_RESOURCE_YIELD of the effective resource type.
    // Barren tiles (null resourceType) get the terrain's natural resource instead.
    if (developed.has(tileId)) {
      const effectiveResource =
        (tile.properties?.['resourceType'] as string | null | undefined) ??
        TERRAIN_DEVELOPS_INTO[tile.terrain] ??
        null;
      if (effectiveResource) addResource(result, effectiveResource, BASE_RESOURCE_YIELD);
    }
  }

  return result;
}

/** Mutates `result` by adding `amount` to the correct resource bucket. */
function addResource(result: { wood: number; food: number; iron: number }, resource: string, amount: number): void {
  switch (resource) {
    case 'wood': result.wood += amount; break;
    case 'food': result.food += amount; break;
    case 'iron': result.iron += amount; break;
  }
}

/**
 * Total food a player's army (units + structures) needs per round.
 *
 * Units: spearman=1, cannoneer=2, noble=1
 * Structures: city=2 (the only structure that consumes food currently)
 *
 * These are tracked separately here so that attrition (chooseAttritionVictims)
 * only disbands UNITS — never structures. The total deficit drives gold exchange
 * and attrition together, but the distinction matters for Step 7's city-mortgaging.
 */
export function computeFoodCost(state: GameState, playerId: PlayerId): number {
  const unitKinds: string[]      = [];
  const structureKinds: string[] = [];

  for (const [, piece] of state.pieces) {
    if (piece.owner !== playerId) continue;
    if (UNIT_STATS[piece.kind] !== undefined) {
      unitKinds.push(piece.kind);
    } else if (STRUCTURE_KINDS.has(piece.kind)) {
      structureKinds.push(piece.kind);
    }
  }

  return calculateFoodConsumption(unitKinds) + calculateStructureFoodCost(structureKinds);
}

/**
 * Choose which units to disband when a player cannot feed their army.
 *
 * Structures are never included in the victim list; only units are disbanded.
 * City deactivation on sustained deficit is handled in Step 7 (economy-loop.ts).
 */
export function chooseAttritionVictims(
  state: GameState,
  playerId: PlayerId,
  foodDeficit: number,
): string[] {
  const victims: string[] = [];
  let deficit = foodDeficit;

  for (const kind of ATTRITION_PRIORITY) {
    if (deficit <= 0) break;
    for (const [id, piece] of state.pieces) {
      if (deficit <= 0) break;
      if (piece.owner !== playerId || piece.kind !== kind) continue;
      victims.push(id);
      deficit -= UNIT_STATS[kind]?.foodPerRound ?? 1;
    }
  }

  return victims;
}
