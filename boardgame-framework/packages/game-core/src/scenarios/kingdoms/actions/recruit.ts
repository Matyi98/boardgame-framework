import type { ActionValidator } from '../../../actions/action-validator.js';
import type { ActionExecutor } from '../../../actions/action-executor.js';
import type { GameState } from '../../../state/game-state.js';
import type { GameEvent } from '../../../events/game-event.js';
import { actionError } from '../../../actions/action.js';
import { makeUnitFromRegistry } from '../../../pieces/unit.js';
import { UNIT_KINDS, UNIT_STATS, kingdomsPieces } from '../pieces.js';
import {
  guardActivePlayer,
  getOwnership,
  connectedTiles,
  isConnected,
  countPlayerPiecesOfKind,
  structureOnTile,
  nextId,
} from './helpers.js';

interface RecruitPayload { tileId: string; unitKind: string }

/**
 * Structures that permit recruitment on their tile.
 * Changing which structures allow recruitment = edit this set only.
 */
const RECRUIT_STRUCTURES = new Set(['capital-base', 'city']);

/**
 * Noble cost scales exponentially with how many the player already owns.
 * count=1 → 8g (2nd noble), count=2 → 14g, count=3 → 23g, count=9 → 663g.
 * Iron and food costs stay flat.
 */
function nobleCost(currentNobleCount: number): Record<string, number> {
  return {
    gold: Math.ceil(8 * Math.pow(1.7, Math.max(0, currentNobleCount - 1))),
    iron: 1,
    food: 1,
  };
}

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
      return actionError('disconnected', 'Tile is not connected to your capital');

    // Recruitment requires a Capital Base or City — armies need a command structure
    if (!structureOnTile(state, tileId, RECRUIT_STRUCTURES))
      return actionError('no-structure', 'You can only recruit on tiles with a Capital Base or City');

    const def = kingdomsPieces.require(unitKind);
    const currentCount = countPlayerPiecesOfKind(state, action.playerId!, unitKind);
    if (def.limitPerPlayer !== undefined && currentCount >= def.limitPerPlayer)
      return actionError('unit-limit', `${unitKind} limit reached (${def.limitPerPlayer})`);

    const effectiveCost = unitKind === 'noble' ? nobleCost(currentCount) : (def.cost ?? {});
    const inv = state.inventories.get(action.playerId!);
    for (const [res, qty] of Object.entries(effectiveCost)) {
      if ((inv?.get(res) ?? 0) < qty)
        return actionError('insufficient-resources', `Not enough ${res}`);
    }

    // Food sustainability gate: a unit with ongoing food upkeep cannot be recruited
    // while the player has no food in stock. No starvation attrition exists any
    // more — this check (banked stock, not income projection) is the only guard
    // against fielding units you can't currently feed at all.
    const unitFoodCost = UNIT_STATS[unitKind]?.foodPerRound ?? 0;
    if (unitFoodCost > 0 && (inv?.get('food') ?? 0) <= 0)
      return actionError('insufficient-food-upkeep', 'Not enough food in stock to support another unit');
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
    const effectiveCost = unitKind === 'noble'
      ? nobleCost(countPlayerPiecesOfKind(state, playerId, 'noble'))
      : (def.cost ?? {});
    for (const [res, qty] of Object.entries(effectiveCost)) inv.remove(res, qty);
    const id = nextId(state);
    state.pieces.set(id, makeUnitFromRegistry(kingdomsPieces, { id, kind: unitKind, owner: playerId, tileId }));
    return [{ type: 'unit-recruited', playerId, payload: { pieceId: id, unitKind, tileId } }];
  },
};
