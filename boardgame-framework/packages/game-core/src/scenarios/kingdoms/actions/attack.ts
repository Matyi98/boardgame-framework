import type { ActionValidator } from '../../../actions/action-validator.js';
import type { ActionExecutor } from '../../../actions/action-executor.js';
import type { GameState } from '../../../state/game-state.js';
import type { GameEvent } from '../../../events/game-event.js';
import type { Piece } from '../../../pieces/piece.js';
import { actionError } from '../../../actions/action.js';
import { resolveAttack, pieceAsCombatant, type StructureEffect, type TileProperties } from '../../../rules/combat.js';
import { UNIT_STATS, UNIT_KINDS, COMBAT_UNIT_KINDS, STRUCTURE_KINDS, STRUCTURE_STATS } from '../pieces.js';
import { terrainDefenseBonus } from '../terrain.js';
import {
  guardActivePlayer,
  getOwnership,
  getCapitals,
  getAttackedFrom,
  getPendingOccupations,
  getConfirmedOccupations,
  connectedTiles,
  isConnected,
  unitsOnTile,
  structureOnTile,
  isAdjacent,
} from './helpers.js';

interface AttackPayload { fromTileId: string; toTileId: string }

export const attackTileValidator: ActionValidator<AttackPayload> = {
  type: 'attack-tile',
  validate(state: GameState, action) {
    const guard = guardActivePlayer(state, action.playerId);
    if (guard) return guard;
    const { fromTileId, toTileId } = action.payload;
    const ownership = getOwnership(state);

    if (ownership[fromTileId] !== action.playerId)
      return actionError('not-owned', 'You do not own the attacking tile');
    if (!isConnected(fromTileId, connectedTiles(state, action.playerId!)))
      return actionError('disconnected', 'You can only attack from tiles connected to your capital');
    if (ownership[toTileId] === action.playerId)
      return actionError('own-tile', 'Cannot attack your own tile');
    if (!isAdjacent(state.map, fromTileId, toTileId))
      return actionError('not-adjacent', 'Tiles are not adjacent');
    if (unitsOnTile(state, fromTileId, action.playerId!, UNIT_KINDS).length === 0)
      return actionError('no-units', 'No units on attacking tile');
    if (unitsOnTile(state, fromTileId, action.playerId!, COMBAT_UNIT_KINDS).length === 0)
      return actionError('no-combat-units', 'You need at least one non-Noble unit to attack');
    if (getAttackedFrom(state).includes(fromTileId))
      return actionError('already-attacked', 'This tile has already attacked this turn');
    return null;
  },
};

export const attackTileExecutor: ActionExecutor<AttackPayload> = {
  type: 'attack-tile',
  execute(state: GameState, action): ReadonlyArray<GameEvent> {
    const { fromTileId, toTileId } = action.payload;
    const playerId = action.playerId!;
    const events: GameEvent[] = [];

    // Collect attackers (all unit kinds; Nobles count in the battle even if they
    // can't initiate attacks — validator already ensured ≥1 combat unit is present)
    const attackerIds = unitsOnTile(state, fromTileId, playerId, UNIT_KINDS);
    const defenderIds = unitsOnTile(state, toTileId, undefined, UNIT_KINDS);
    const defenderOwner = getOwnership(state)[toTileId] ?? null;

    const attackers = attackerIds.map((id) => {
      const piece = state.pieces.get(id)!;
      return pieceAsCombatant(piece) ?? { id, kind: piece.kind, attack: UNIT_STATS[piece.kind]?.attack ?? 1 };
    });
    const defenders = defenderIds.map((id) => {
      const piece = state.pieces.get(id)!;
      return pieceAsCombatant(piece) ?? { id, kind: piece.kind, attack: UNIT_STATS[piece.kind]?.attack ?? 1 };
    });

    const defTile = state.map.tileById(toTileId);
    const tileProps: TileProperties = { defenseBonus: defTile ? terrainDefenseBonus(defTile.terrain) : 1.0 };
    const defStructure = structureOnTile(state, toTileId, STRUCTURE_KINDS);
    const structureEffects: StructureEffect[] = defStructure
      ? [{ defenseMultiplier: STRUCTURE_STATS[defStructure.kind]?.defenseMultiplier ?? 1.0 }]
      : [];

    const result = resolveAttack(attackers, defenders, tileProps, structureEffects, state.rng);

    // Safe deletion: collect IDs first, then delete outside the iterator
    const toRemove = [...result.defenderLosses, ...result.attackerLosses];
    for (const id of toRemove) state.pieces.delete(id);

    events.push({
      type: 'battle-resolved',
      playerId,
      payload: {
        fromTileId,
        toTileId,
        attackerWins: result.attackerWins,
        attackerStrength: result.attackerStrength,
        defenderStrength: result.defenderStrength,
        attackerCasualties: result.attackerLosses.length,
        defenderCasualties: result.defenderLosses.length,
      },
    });

    if (result.tileConquered) {
      const ownership = { ...getOwnership(state), [toTileId]: playerId };
      state.extras['k:ownership'] = ownership;

      // Clear any pending/confirmed occupation for the conquered tile — the "still
      // unowned" guard in end-turn would handle it, but explicit cleanup prevents stale entries
      const pending   = { ...getPendingOccupations(state) };
      const confirmed = { ...getConfirmedOccupations(state) };
      delete pending[toTileId];
      delete confirmed[toTileId];
      state.extras['k:pendingOccupations']   = pending;
      state.extras['k:confirmedOccupations'] = confirmed;

      events.push({ type: 'tile-captured', playerId, payload: { tileId: toTileId, previousOwner: defenderOwner } });

      if (defenderOwner) {
        const capitals = getCapitals(state);
        if (capitals[defenderOwner] === toTileId) {
          // Capital captured → eliminate the player: remove all their pieces and tiles
          state.players.eliminate(defenderOwner);

          const eliminatedPieceIds = [...state.pieces.entries()]
            .filter(([, piece]) => piece.owner === defenderOwner)
            .map(([id]) => id);
          for (const id of eliminatedPieceIds) state.pieces.delete(id);

          const neutralised = { ...getOwnership(state) };
          for (const [tid, owner] of Object.entries(neutralised)) {
            if (owner === defenderOwner) delete neutralised[tid];
          }
          state.extras['k:ownership'] = neutralised;

          events.push({ type: 'player-eliminated', payload: { eliminatedPlayerId: defenderOwner, byPlayerId: playerId } });
        } else {
          // Non-capital capture: transfer structure ownership to the attacker
          if (defStructure) {
            const oldPiece = state.pieces.get(defStructure.id);
            if (oldPiece) {
              state.pieces.set(defStructure.id, { ...oldPiece, owner: playerId } as Piece);
            }
          }
        }
      }
    }

    state.extras['k:attackedFrom'] = [...getAttackedFrom(state), fromTileId];
    return events;
  },
};
