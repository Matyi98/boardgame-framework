/**
 * State-integration layer for Kingdoms income.
 *
 * This module reads GameState and delegates all math to economy.ts pure functions.
 * It is the only place in the kingdoms scenario that couples the income model to
 * GameState — everything else either calls economy.ts directly or calls these helpers.
 *
 * Separation of concerns:
 *   economy.ts       — pure functions, testable in isolation, importable by frontend
 *   income.ts        — state queries + economy.ts calls; used by economy-loop.ts
 *   economy-loop.ts  — full per-round batch processing using both layers
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
 *
 * ── Mortgaged cities ──────────────────────────────────────────────────────────
 * A city that has been mortgaged (k:mortgagedCities in extras) is excluded from
 * both income calculation and food cost. buildStructureMap() and computeFoodCost()
 * both skip piece IDs in the mortgaged set. See economy-loop.ts for when mortgage
 * is triggered.
 */

import type { GameState } from '../../state/game-state.js';
import type { PlayerId } from '../../players/player.js';
import {
  calculateTileIncome,
  calculateFoodConsumption,
  calculateStructureFoodCost,
  BASE_RESOURCE_YIELD,
} from './economy.js';
import { STRUCTURE_KINDS, UNIT_STATS } from './pieces.js';
import { playerConnectedTiles } from './connectivity.js';
import { TERRAIN_DEVELOPS_INTO } from './actions/develop.js';
import { getMortgagedCityIds } from './actions/helpers.js';

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Build a tileId → [structureKind, ...] map, excluding mortgaged city pieces.
 * Mortgaged cities contribute neither income nor food cost.
 */
function buildStructureMap(state: GameState, mortgagedIds: Set<string>): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const [id, piece] of state.pieces) {
    if (mortgagedIds.has(id)) continue;
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
 * Compute resources a player earns this round from their connected territory.
 *
 * Only tiles reachable via BFS from the player's capital contribute.
 * Mortgaged cities are excluded from structure bonuses.
 * Developed tiles receive an additional +BASE_RESOURCE_YIELD of their resource.
 */
export function computeIncome(state: GameState, playerId: PlayerId): IncomeResult {
  const result = { wood: 0, food: 0, iron: 0, gold: 0 };

  const capitals = (state.extras['k:capitals'] as Record<string, string>) ?? {};
  if (!capitals[playerId]) return result;

  const connected  = playerConnectedTiles(state.map, state, playerId);
  const mortgaged  = getMortgagedCityIds(state);
  const structures = buildStructureMap(state, mortgaged);
  const developed  = getDeveloped(state);

  for (const tileId of connected) {
    const tile = state.map.tileById(tileId);
    if (!tile) continue;

    const kinds  = structures.get(tileId) ?? [];
    const income = calculateTileIncome(tile, kinds);

    result.gold += income.gold;

    if (income.resource && income.resourceAmount > 0) {
      addResource(result, income.resource, income.resourceAmount);
    }

    // Develop bonus: +BASE_RESOURCE_YIELD of the effective resource type.
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
 * Total food a player's army (units + structures) needs this round.
 *
 * Mortgaged cities are excluded — a deactivated city pays no food upkeep.
 * This separation matters because attrition only disbands units, not structures.
 */
export function computeFoodCost(state: GameState, playerId: PlayerId): number {
  const mortgaged     = getMortgagedCityIds(state);
  const unitKinds: string[]      = [];
  const structureKinds: string[] = [];

  for (const [id, piece] of state.pieces) {
    if (piece.owner !== playerId) continue;
    if (mortgaged.has(id)) continue;
    if (UNIT_STATS[piece.kind] !== undefined) {
      unitKinds.push(piece.kind);
    } else if (STRUCTURE_KINDS.has(piece.kind)) {
      structureKinds.push(piece.kind);
    }
  }

  return calculateFoodConsumption(unitKinds) + calculateStructureFoodCost(structureKinds);
}
