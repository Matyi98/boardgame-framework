/**
 * develop-tile action — permanently boost an owned tile's resource production.
 *
 * ── Mechanic ──────────────────────────────────────────────────────────────────
 * Spending DEVELOP_COST gold on a connected, owned tile "develops" it:
 *
 *   - Tiles with a resource type (food/wood/iron) get +BASE_RESOURCE_YIELD
 *     added to their yield permanently (on top of any structure multipliers).
 *
 *   - Tiles with NO resource type (barren, resource=null) unlock their terrain's
 *     natural resource: plains → food, forest → wood, hills/mountain → iron.
 *     The unlocked resource is set at BASE_RESOURCE_YIELD units per round.
 *
 * A tile can only be developed once. Further investment is a future upgrade
 * (Step 11 balance pass — the infrastructure is already in place via k:developed).
 *
 * ── Storage ───────────────────────────────────────────────────────────────────
 * state.extras['k:developed'] is a string[] (array of developed tile IDs).
 * income.ts reads it and applies the bonus during computeIncome().
 *
 * ── Why not mutate tile.properties? ──────────────────────────────────────────
 * GameMap tiles are immutable after build(). Storing overrides in extras keeps
 * the map pure and makes state serializable / replayable without re-running
 * map generation.
 */

import type { ActionValidator } from '../../../actions/action-validator.js';
import type { ActionExecutor } from '../../../actions/action-executor.js';
import type { GameState } from '../../../state/game-state.js';
import type { GameEvent } from '../../../events/game-event.js';
import { actionError } from '../../../actions/action.js';
import { DEVELOP_COST } from '../economy.js';
import {
  guardActivePlayer,
  getOwnership,
  connectedTiles,
  isConnected,
  getDeveloped,
} from './helpers.js';

/** Default resource type unlocked when developing a barren tile, by terrain. */
export const TERRAIN_DEVELOPS_INTO: Readonly<Record<string, string>> = {
  plains:   'food',
  forest:   'wood',
  hills:    'iron',
  mountain: 'iron',
};

interface DevelopPayload { tileId: string }

export const developTileValidator: ActionValidator<DevelopPayload> = {
  type: 'develop-tile',
  validate(state: GameState, action) {
    const guard = guardActivePlayer(state, action.playerId);
    if (guard) return guard;
    const { tileId } = action.payload;

    if (getOwnership(state)[tileId] !== action.playerId)
      return actionError('not-owned', 'You do not own this tile');
    if (!isConnected(tileId, connectedTiles(state, action.playerId!)))
      return actionError('disconnected', 'Tile is not connected to your capital');
    if (getDeveloped(state).has(tileId))
      return actionError('already-developed', 'This tile has already been developed');

    // Must be an owned tile — structures are fine, the development applies to the land itself
    const tile = state.map.tileById(tileId);
    if (!tile)
      return actionError('tile-not-found', 'Tile not found on map');

    // Barren tile check: if resourceType is null, verify this terrain can be developed
    const resourceType = tile.properties?.['resourceType'] as string | null | undefined;
    if (resourceType === null || resourceType === undefined) {
      if (!TERRAIN_DEVELOPS_INTO[tile.terrain])
        return actionError('cannot-develop', 'This terrain type cannot be developed');
    }

    const inv = state.inventories.get(action.playerId!);
    if ((inv?.get('gold') ?? 0) < DEVELOP_COST)
      return actionError('insufficient-resources', `Developing a tile costs ${DEVELOP_COST} gold`);

    return null;
  },
};

export const developTileExecutor: ActionExecutor<DevelopPayload> = {
  type: 'develop-tile',
  execute(state: GameState, action): ReadonlyArray<GameEvent> {
    const { tileId } = action.payload;
    const playerId = action.playerId!;
    const inv = state.inventories.get(playerId)!;
    inv.remove('gold', DEVELOP_COST);

    // Mark the tile as developed
    const developed = [...getDeveloped(state), tileId];
    state.extras['k:developed'] = developed;

    // Determine what resource was unlocked/boosted for the event payload
    const tile = state.map.tileById(tileId)!;
    const existing = tile.properties?.['resourceType'] as string | null | undefined;
    const resourceUnlocked = existing ?? TERRAIN_DEVELOPS_INTO[tile.terrain] ?? null;

    return [{
      type: 'tile-developed',
      playerId,
      payload: { tileId, goldSpent: DEVELOP_COST, resourceUnlocked },
    }];
  },
};
