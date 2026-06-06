import type { ActionValidator } from '../../../actions/action-validator.js';
import type { ActionExecutor } from '../../../actions/action-executor.js';
import type { GameState } from '../../../state/game-state.js';
import type { GameEvent } from '../../../events/game-event.js';
import { actionError } from '../../../actions/action.js';
import { UNIT_KINDS } from '../pieces.js';
import {
  guardActivePlayer,
  getOwnership,
  getMovedThisTurn,
  isAdjacent,
} from './helpers.js';

interface MovePayload { pieceId: string; targetTileId: string }

export const moveUnitValidator: ActionValidator<MovePayload> = {
  type: 'move-unit',
  validate(state: GameState, action) {
    const guard = guardActivePlayer(state, action.playerId);
    if (guard) return guard;
    const { pieceId, targetTileId } = action.payload;

    const piece = state.pieces.get(pieceId);
    if (!piece || piece.owner !== action.playerId)
      return actionError('not-your-piece', 'Piece not found or not yours');
    if (!UNIT_KINDS.has(piece.kind))
      return actionError('not-a-unit', 'Can only move military units');
    if (getMovedThisTurn(state).includes(pieceId))
      return actionError('already-moved', 'This unit already moved this turn');

    const fromTileId = (piece.location as { kind: 'tile'; tileId: string }).tileId;
    if (!isAdjacent(state.map, fromTileId, targetTileId))
      return actionError('not-adjacent', 'Target tile is not adjacent');
    if (getOwnership(state)[targetTileId] !== action.playerId)
      return actionError('not-owned', 'You can only move units to tiles you own');
    return null;
  },
};

export const moveUnitExecutor: ActionExecutor<MovePayload> = {
  type: 'move-unit',
  execute(state: GameState, action): ReadonlyArray<GameEvent> {
    const { pieceId, targetTileId } = action.payload;
    const piece = state.pieces.get(pieceId)!;
    const fromTileId = (piece.location as { kind: 'tile'; tileId: string }).tileId;
    state.pieces.set(pieceId, { ...piece, location: { kind: 'tile', tileId: targetTileId } });
    state.extras['k:movedThisTurn'] = [...getMovedThisTurn(state), pieceId];
    return [{ type: 'unit-moved', playerId: action.playerId, payload: { pieceId, fromTileId, toTileId: targetTileId } }];
  },
};
