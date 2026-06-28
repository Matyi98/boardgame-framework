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
  getTileLoyalty,
  connectedTiles,
  isConnected,
  unitsOnTile,
  structureOnTile,
  isAdjacent,
} from './helpers.js';

interface AttackPayload { fromTileId: string; toTileId: string; unitIds?: string[] }

/** Loyalty lost per surviving-Noble attack on an unowned tile. Reaching 0 captures it. */
const LOYALTY_DAMAGE_PER_ATTACK = 45;
const MAX_LOYALTY = 100;

export const attackTileValidator: ActionValidator<AttackPayload> = {
  type: 'attack-tile',
  validate(state: GameState, action) {
    const guard = guardActivePlayer(state, action.playerId);
    if (guard) return guard;
    const { fromTileId, toTileId, unitIds } = action.payload;
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
    if (getAttackedFrom(state).length > 0)
      return actionError('already-attacked', 'You can only attack once per turn');

    // Attacking an unowned tile is the occupation mechanic — a Noble alone is
    // enough (it erodes loyalty). Attacking an enemy-owned tile still requires
    // at least one real combat unit; Nobles cannot solo a military assault.
    const isUnownedTarget = ownership[toTileId] === undefined;
    const eligibleKinds = isUnownedTarget ? UNIT_KINDS : COMBAT_UNIT_KINDS;
    const noCombatUnitsMessage = isUnownedTarget
      ? 'No units on attacking tile'
      : 'You need at least one non-Noble unit to attack an enemy tile';

    if (unitIds !== undefined) {
      if (unitIds.length === 0)
        return actionError('no-units-selected', 'Select at least one unit to attack with');
      const ownUnitsOnTile = new Set(unitsOnTile(state, fromTileId, action.playerId!, UNIT_KINDS));
      for (const id of unitIds) {
        if (!ownUnitsOnTile.has(id))
          return actionError('invalid-unit', 'Selected unit is not on the attacking tile');
      }
      if (!unitIds.some((id) => eligibleKinds.has(state.pieces.get(id)!.kind)))
        return actionError('no-combat-units', noCombatUnitsMessage);
    } else if (unitsOnTile(state, fromTileId, action.playerId!, eligibleKinds).length === 0) {
      return actionError('no-combat-units', noCombatUnitsMessage);
    }
    return null;
  },
};

export const attackTileExecutor: ActionExecutor<AttackPayload> = {
  type: 'attack-tile',
  execute(state: GameState, action): ReadonlyArray<GameEvent> {
    const { fromTileId, toTileId, unitIds } = action.payload;
    const playerId = action.playerId!;
    const events: GameEvent[] = [];

    // Collect attackers — the player-selected subset if provided, otherwise all
    // units on the tile (Nobles count in the battle even if they can't initiate
    // attacks — validator already ensured ≥1 combat unit is present)
    const attackerIds = unitIds && unitIds.length > 0
      ? unitIds
      : unitsOnTile(state, fromTileId, playerId, UNIT_KINDS);
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

    // Occupation mechanic: a surviving Noble in the attack force erodes the
    // target tile's loyalty — this is now the ONLY way to capture a tile,
    // whether it's unowned or enemy-owned. Raw combat (no Noble, or the Noble
    // died) just fights: defenders may die, but ownership never transfers.
    // Must be computed BEFORE losses are deleted below.
    const survivingNobleId = attackerIds.find(
      (id) => state.pieces.get(id)?.kind === 'noble' && !result.attackerLosses.includes(id),
    );

    // Safe deletion: collect IDs first, then delete outside the iterator
    const toRemove = [...result.defenderLosses, ...result.attackerLosses];
    for (const id of toRemove) state.pieces.delete(id);

    events.push({
      type: 'battle-resolved',
      playerId,
      payload: {
        fromTileId,
        toTileId,
        defenderOwner,
        attackerWins: result.attackerWins,
        attackerStrength: result.attackerStrength,
        defenderStrength: result.defenderStrength,
        attackerCasualties: result.attackerLosses.length,
        defenderCasualties: result.defenderLosses.length,
      },
    });

    // Occupation mechanic: a surviving Noble eroding the target tile's loyalty.
    // If the Noble died in combat, loyalty is untouched — only a successful
    // attack with a surviving Noble damages it. Applies uniformly to unowned
    // AND enemy-owned tiles; raw military force alone never captures either.
    if (survivingNobleId) {
      const loyaltyMap = { ...getTileLoyalty(state) };
      const currentLoyalty = loyaltyMap[toTileId]?.loyalty ?? MAX_LOYALTY;
      const nextLoyalty = currentLoyalty - LOYALTY_DAMAGE_PER_ATTACK;

      if (nextLoyalty <= 0) {
        delete loyaltyMap[toTileId];
        state.extras['k:tileLoyalty'] = loyaltyMap;
        state.extras['k:ownership'] = { ...getOwnership(state), [toTileId]: playerId };
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
          } else if (defStructure) {
            // Non-capital capture: transfer structure ownership to the attacker
            const oldPiece = state.pieces.get(defStructure.id);
            if (oldPiece) {
              state.pieces.set(defStructure.id, { ...oldPiece, owner: playerId } as Piece);
            }
          }
        }
      } else {
        loyaltyMap[toTileId] = { loyalty: nextLoyalty, lastAttackerId: playerId };
        state.extras['k:tileLoyalty'] = loyaltyMap;
        events.push({ type: 'tile-loyalty-reduced', playerId, payload: { tileId: toTileId, loyalty: nextLoyalty } });
      }
    }

    state.extras['k:attackedFrom'] = [...getAttackedFrom(state), fromTileId];
    return events;
  },
};
