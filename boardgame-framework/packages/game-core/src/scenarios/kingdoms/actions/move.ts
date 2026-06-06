import type { ActionValidator } from '../../../actions/action-validator.js';
import type { ActionExecutor } from '../../../actions/action-executor.js';
import type { GameState } from '../../../state/game-state.js';
import type { GameEvent } from '../../../events/game-event.js';
import type { GameMap } from '../../../map/game-map.js';
import { actionError } from '../../../actions/action.js';
import { UNIT_KINDS, OCCUPYING_UNIT_KINDS } from '../pieces.js';
import {
  guardActivePlayer,
  getOwnership,
  getMovedThisTurn,
  cancelOccupationByNoble,
  getPendingOccupations,
} from './helpers.js';

interface MovePayload { pieceId: string; targetTileId: string }

/**
 * BFS from `fromTileId`, up to `maxSteps` hops.
 *
 * canTraverse(tileId) → whether the unit may pass through or land on that tile.
 * Returns the full set of reachable tile IDs (including unreachable start tile
 * for convenience; callers should exclude the start when checking landing).
 */
function reachableFrom(
  map: GameMap,
  fromTileId: string,
  maxSteps: number,
  canTraverse: (tileId: string) => boolean,
): Set<string> {
  const visited = new Set<string>([fromTileId]);
  let frontier = [fromTileId];

  for (let step = 0; step < maxSteps; step++) {
    const next: string[] = [];
    for (const current of frontier) {
      const tile = map.tileById(current);
      if (!tile) continue;
      for (const neighbour of map.neighboursOf(tile.coord)) {
        if (!visited.has(neighbour.id) && canTraverse(neighbour.id)) {
          visited.add(neighbour.id);
          next.push(neighbour.id);
        }
      }
    }
    frontier = next;
  }

  return visited;
}

export const moveUnitValidator: ActionValidator<MovePayload> = {
  type: 'move-unit',
  validate(state: GameState, action) {
    const guard = guardActivePlayer(state, action.playerId);
    if (guard) return guard;
    const { pieceId, targetTileId } = action.payload;
    const playerId = action.playerId!;

    const piece = state.pieces.get(pieceId);
    if (!piece || piece.owner !== playerId)
      return actionError('not-your-piece', 'Piece not found or not yours');
    if (!UNIT_KINDS.has(piece.kind))
      return actionError('not-a-unit', 'Can only move military units');
    if (getMovedThisTurn(state).includes(pieceId))
      return actionError('already-moved', 'This unit already moved this turn');

    const fromTileId = (piece.location as { kind: 'tile'; tileId: string }).tileId;
    if (fromTileId === targetTileId)
      return actionError('same-tile', 'Unit is already on that tile');

    const ownership        = getOwnership(state);
    const canOccupy        = OCCUPYING_UNIT_KINDS.has(piece.kind);
    const movement: number = (piece.stats as Record<string, number>)['movement'] ?? 1;

    // Pre-check the target tile for a specific, actionable error message before
    // running BFS (which would otherwise give a generic 'out-of-range' for
    // any unreachable or forbidden tile).
    const targetOwner = ownership[targetTileId];
    if (targetOwner !== undefined && targetOwner !== playerId)
      return actionError('enemy-tile', 'Cannot move to an enemy tile — use attack-tile instead');
    if (targetOwner === undefined && !canOccupy)
      return actionError('not-owned', 'This unit type can only move to tiles you own');

    // A tile is traversable during pathfinding if the unit may pass through it:
    //   - always: own tiles
    //   - occupying units only: unowned tiles (not enemy-owned)
    //   - never: enemy-owned tiles (must use attack-tile)
    const canTraverse = (tid: string): boolean => {
      const owner = ownership[tid];
      if (owner === playerId) return true;
      if (owner === undefined && canOccupy) return true;
      return false;
    };

    const reachable = reachableFrom(state.map, fromTileId, movement, canTraverse);
    if (!reachable.has(targetTileId))
      return actionError('out-of-range', `Target tile is not reachable within ${movement} step(s)`);

    return null;
  },
};

export const moveUnitExecutor: ActionExecutor<MovePayload> = {
  type: 'move-unit',
  execute(state: GameState, action): ReadonlyArray<GameEvent> {
    const { pieceId, targetTileId } = action.payload;
    const playerId = action.playerId!;
    const piece    = state.pieces.get(pieceId)!;
    const fromTileId = (piece.location as { kind: 'tile'; tileId: string }).tileId;

    // If this Noble was holding a previous occupation, moving away cancels it
    if (OCCUPYING_UNIT_KINDS.has(piece.kind)) {
      cancelOccupationByNoble(state, pieceId);
    }

    // Move the piece
    state.pieces.set(pieceId, { ...piece, location: { kind: 'tile', tileId: targetTileId } });
    state.extras['k:movedThisTurn'] = [...getMovedThisTurn(state), pieceId];

    const events: GameEvent[] = [
      { type: 'unit-moved', playerId, payload: { pieceId, fromTileId, toTileId: targetTileId } },
    ];

    // Noble landed on an unowned tile → start occupation (two-turn pipeline)
    const ownership = getOwnership(state);
    if (OCCUPYING_UNIT_KINDS.has(piece.kind) && ownership[targetTileId] === undefined) {
      const pending = { ...getPendingOccupations(state) };
      pending[targetTileId] = { nobleId: pieceId, playerId };
      state.extras['k:pendingOccupations'] = pending;
      events.push({ type: 'noble-occupying', playerId, payload: { pieceId, tileId: targetTileId } });
    }

    return events;
  },
};
