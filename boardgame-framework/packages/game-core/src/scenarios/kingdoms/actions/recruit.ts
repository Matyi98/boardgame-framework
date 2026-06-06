import type { ActionValidator } from '../../../actions/action-validator.js';
import type { ActionExecutor } from '../../../actions/action-executor.js';
import type { GameState } from '../../../state/game-state.js';
import type { GameEvent } from '../../../events/game-event.js';
import { actionError } from '../../../actions/action.js';
import { makeUnitFromRegistry } from '../../../pieces/unit.js';
import { UNIT_KINDS, kingdomsPieces } from '../pieces.js';
import {
  guardActivePlayer,
  getOwnership,
  connectedTiles,
  isConnected,
  countPlayerPiecesOfKind,
  nextId,
} from './helpers.js';

interface RecruitPayload { tileId: string; unitKind: string }

export const recruitUnitValidator: ActionValidator<RecruitPayload> = {
  type: 'recruit-unit',
  validate(state: GameState, action) {
    const guard = guardActivePlayer(state, action.playerId);
    if (guard) return guard;
    const { tileId, unitKind } = action.payload;

    if (!UNIT_KINDS.has(unitKind))
      return actionError('invalid-kind', `Unknown unit kind: ${unitKind}`);
    if (getOwnership(state)[tileId] !== action.playerId)
      return actionError('not-owned', 'You do not own this tile');
    if (!isConnected(tileId, connectedTiles(state, action.playerId!)))
      return actionError('disconnected', 'You can only recruit on tiles connected to your capital');

    const def = kingdomsPieces.require(unitKind);
    if (def.limitPerPlayer !== undefined && countPlayerPiecesOfKind(state, action.playerId!, unitKind) >= def.limitPerPlayer)
      return actionError('unit-limit', `${unitKind} limit reached (${def.limitPerPlayer})`);

    const inv = state.inventories.get(action.playerId!);
    for (const [res, qty] of Object.entries(def.cost ?? {})) {
      if ((inv?.get(res) ?? 0) < qty)
        return actionError('insufficient-resources', `Not enough ${res}`);
    }
    return null;
  },
};

export const recruitUnitExecutor: ActionExecutor<RecruitPayload> = {
  type: 'recruit-unit',
  execute(state: GameState, action): ReadonlyArray<GameEvent> {
    const { tileId, unitKind } = action.payload;
    const playerId = action.playerId!;
    const def = kingdomsPieces.require(unitKind);
    const inv = state.inventories.get(playerId)!;
    for (const [res, qty] of Object.entries(def.cost ?? {})) inv.remove(res, qty);
    const id = nextId(state);
    state.pieces.set(id, makeUnitFromRegistry(kingdomsPieces, { id, kind: unitKind, owner: playerId, tileId }));
    return [{ type: 'unit-recruited', playerId, payload: { pieceId: id, unitKind, tileId } }];
  },
};
