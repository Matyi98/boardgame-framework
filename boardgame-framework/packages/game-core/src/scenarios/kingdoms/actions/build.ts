import type { ActionValidator } from '../../../actions/action-validator.js';
import type { ActionExecutor } from '../../../actions/action-executor.js';
import type { GameState } from '../../../state/game-state.js';
import type { GameEvent } from '../../../events/game-event.js';
import { actionError } from '../../../actions/action.js';
import { makeUnitFromRegistry } from '../../../pieces/unit.js';
import { BUILDABLE_STRUCTURES, STRUCTURE_KINDS, kingdomsPieces } from '../pieces.js';
import {
  guardActivePlayer,
  getOwnership,
  connectedTiles,
  isConnected,
  structureOnTile,
  countPlayerPiecesOfKind,
  nextId,
} from './helpers.js';

// ── build-structure ───────────────────────────────────────────────────────────

interface BuildPayload { tileId: string; structureKind: string }

export const buildStructureValidator: ActionValidator<BuildPayload> = {
  type: 'build-structure',
  validate(state: GameState, action) {
    const guard = guardActivePlayer(state, action.playerId);
    if (guard) return guard;
    const { tileId, structureKind } = action.payload;

    if (!BUILDABLE_STRUCTURES.has(structureKind))
      return actionError('invalid-kind', `${structureKind} cannot be built manually`);
    if (getOwnership(state)[tileId] !== action.playerId)
      return actionError('not-owned', 'You do not own this tile');
    if (!isConnected(tileId, connectedTiles(state, action.playerId!)))
      return actionError('disconnected', 'You can only build on tiles connected to your capital');
    if (structureOnTile(state, tileId, STRUCTURE_KINDS) !== null)
      return actionError('tile-occupied', 'A structure already exists on this tile');

    const def = kingdomsPieces.require(structureKind);
    if (def.limitPerPlayer !== undefined && countPlayerPiecesOfKind(state, action.playerId!, structureKind) >= def.limitPerPlayer)
      return actionError('structure-limit', `${structureKind} limit reached`);

    const inv = state.inventories.get(action.playerId!);
    for (const [res, qty] of Object.entries(def.cost ?? {})) {
      if ((inv?.get(res) ?? 0) < qty)
        return actionError('insufficient-resources', `Not enough ${res}`);
    }
    return null;
  },
};

export const buildStructureExecutor: ActionExecutor<BuildPayload> = {
  type: 'build-structure',
  execute(state: GameState, action): ReadonlyArray<GameEvent> {
    const { tileId, structureKind } = action.payload;
    const playerId = action.playerId!;
    const def = kingdomsPieces.require(structureKind);
    const inv = state.inventories.get(playerId)!;
    for (const [res, qty] of Object.entries(def.cost ?? {})) inv.remove(res, qty);
    const id = nextId(state);
    state.pieces.set(id, makeUnitFromRegistry(kingdomsPieces, { id, kind: structureKind, owner: playerId, tileId }));
    return [{ type: 'structure-built', playerId, payload: { pieceId: id, structureKind, tileId } }];
  },
};

// ── demolish-structure ────────────────────────────────────────────────────────

interface DemolishPayload { tileId: string }

export const demolishStructureValidator: ActionValidator<DemolishPayload> = {
  type: 'demolish-structure',
  validate(state: GameState, action) {
    const guard = guardActivePlayer(state, action.playerId);
    if (guard) return guard;
    const { tileId } = action.payload;

    if (getOwnership(state)[tileId] !== action.playerId)
      return actionError('not-owned', 'You do not own this tile');

    const structure = structureOnTile(state, tileId, STRUCTURE_KINDS);
    if (!structure)
      return actionError('no-structure', 'No structure on this tile');
    if (structure.kind === 'capital-base')
      return actionError('cannot-demolish', 'Cannot demolish your Capital Base');
    if (structure.owner !== action.playerId)
      return actionError('not-yours', 'Structure belongs to another player');
    return null;
  },
};

export const demolishStructureExecutor: ActionExecutor<DemolishPayload> = {
  type: 'demolish-structure',
  execute(state: GameState, action): ReadonlyArray<GameEvent> {
    const { tileId } = action.payload;
    const playerId = action.playerId!;
    const structure = structureOnTile(state, tileId, STRUCTURE_KINDS)!;
    state.pieces.delete(structure.id);

    const def = kingdomsPieces.get(structure.kind);
    const inv = state.inventories.get(playerId)!;
    const refund: Record<string, number> = {};
    for (const [res, qty] of Object.entries(def?.cost ?? {})) {
      const back = Math.floor(qty / 2);
      if (back > 0) { inv.add(res, back); refund[res] = back; }
    }
    return [{ type: 'structure-demolished', playerId, payload: { structureKind: structure.kind, tileId, refund } }];
  },
};
