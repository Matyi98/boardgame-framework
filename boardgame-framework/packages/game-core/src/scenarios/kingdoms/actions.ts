import type { ActionValidator } from '../../actions/action-validator.js';
import type { ActionExecutor } from '../../actions/action-executor.js';
import type { GameState } from '../../state/game-state.js';
import type { GameEvent } from '../../events/game-event.js';
import { actionError } from '../../actions/action.js';
import { makeUnit } from '../../pieces/unit.js';
import { resolveAttack, type CombatUnit } from './combat.js';
import { computeIncome, computeFoodCost, chooseAttritionVictims } from './income.js';
import { UNIT_STATS, UNIT_KINDS, BUILDABLE_STRUCTURES, STRUCTURE_STATS, STRUCTURE_KINDS, kingdomsPieces } from './pieces.js';
import { terrainDefenseBonus } from './terrain.js';

// ── State-extras helpers ──────────────────────────────────────────────────────

function getOwnership(state: GameState): Record<string, string> {
  return (state.extras['k:ownership'] as Record<string, string>) ?? {};
}
function getCapitals(state: GameState): Record<string, string> {
  return (state.extras['k:capitals'] as Record<string, string>) ?? {};
}
function getEliminated(state: GameState): string[] {
  return (state.extras['k:eliminated'] as string[]) ?? [];
}
function getMovedThisTurn(state: GameState): string[] {
  return (state.extras['k:movedThisTurn'] as string[]) ?? [];
}
function getAttackedFrom(state: GameState): string[] {
  return (state.extras['k:attackedFrom'] as string[]) ?? [];
}

function nextId(state: GameState): string {
  const n = ((state.extras['k:nextPieceId'] as number) ?? 0) + 1;
  state.extras['k:nextPieceId'] = n;
  return `kp-${n}`;
}

// ── Piece query helpers ───────────────────────────────────────────────────────

function unitsOnTile(state: GameState, tileId: string, ownerFilter?: string): string[] {
  const ids: string[] = [];
  for (const [id, piece] of state.pieces) {
    if (!UNIT_KINDS.has(piece.kind)) continue;
    if (piece.location.kind !== 'tile') continue;
    if ((piece.location as { kind: 'tile'; tileId: string }).tileId !== tileId) continue;
    if (ownerFilter !== undefined && piece.owner !== ownerFilter) continue;
    ids.push(id);
  }
  return ids;
}

function structureOnTile(state: GameState, tileId: string): { id: string; kind: string; owner: string } | null {
  for (const [id, piece] of state.pieces) {
    if (!STRUCTURE_KINDS.has(piece.kind)) continue;
    if (piece.location.kind !== 'tile') continue;
    if ((piece.location as { kind: 'tile'; tileId: string }).tileId !== tileId) return null;
    return { id, kind: piece.kind, owner: piece.owner };
  }
  return null;
}

function countPlayerPiecesOfKind(state: GameState, playerId: string, kind: string): number {
  let count = 0;
  for (const [, piece] of state.pieces) {
    if (piece.owner === playerId && piece.kind === kind) count++;
  }
  return count;
}

function isAdjacent(map: GameState['map'], tileIdA: string, tileIdB: string): boolean {
  const tileA = map.tileById(tileIdA);
  if (!tileA) return false;
  return map.neighboursOf(tileA.coord).some((t) => t.id === tileIdB);
}

// ── Common validation guards ──────────────────────────────────────────────────

function guardActivePlayer(state: GameState, playerId: string | null) {
  if (!playerId) return actionError('no-player', 'No player ID on action');
  if (state.rounds.turn().activePlayer !== playerId)
    return actionError('not-your-turn', 'It is not your turn');
  if (getEliminated(state).includes(playerId))
    return actionError('eliminated', 'You have been eliminated');
  return null;
}

// ── recruit-unit ─────────────────────────────────────────────────────────────

interface RecruitPayload { tileId: string; unitKind: string }

export const recruitUnitValidator: ActionValidator<RecruitPayload> = {
  type: 'recruit-unit',
  validate(state, action) {
    const guard = guardActivePlayer(state, action.playerId);
    if (guard) return guard;

    const { tileId, unitKind } = action.payload;
    const ownership = getOwnership(state);

    if (!UNIT_KINDS.has(unitKind)) return actionError('invalid-kind', `Unknown unit kind: ${unitKind}`);
    if (ownership[tileId] !== action.playerId) return actionError('not-owned', 'You do not own this tile');

    const def = kingdomsPieces.require(unitKind);
    const limit = def?.limitPerPlayer;
    if (limit !== undefined && countPlayerPiecesOfKind(state, action.playerId, unitKind) >= limit)
      return actionError('unit-limit', `${unitKind} limit reached (${limit})`);

    const cost = def?.cost ?? {};
    const inv = state.inventories.get(action.playerId!);
    for (const [res, qty] of Object.entries(cost)) {
      if ((inv?.get(res) ?? 0) < qty)
        return actionError('insufficient-resources', `Not enough ${res}`);
    }

    return null;
  },
};

export const recruitUnitExecutor: ActionExecutor<RecruitPayload> = {
  type: 'recruit-unit',
  execute(state, action): ReadonlyArray<GameEvent> {
    const { tileId, unitKind } = action.payload;
    const playerId = action.playerId!;

    const def = kingdomsPieces.require(unitKind);
    const cost = def?.cost ?? {};
    const inv = state.inventories.get(playerId)!;
    for (const [res, qty] of Object.entries(cost)) inv.remove(res, qty);

    const id = nextId(state);
    state.pieces.set(id, makeUnit({ id, kind: unitKind, owner: playerId, tileId }));

    return [{ type: 'unit-recruited', playerId, payload: { pieceId: id, unitKind, tileId } }];
  },
};

// ── move-unit ─────────────────────────────────────────────────────────────────

interface MovePayload { pieceId: string; targetTileId: string }

export const moveUnitValidator: ActionValidator<MovePayload> = {
  type: 'move-unit',
  validate(state, action) {
    const guard = guardActivePlayer(state, action.playerId);
    if (guard) return guard;

    const { pieceId, targetTileId } = action.payload;
    const piece = state.pieces.get(pieceId);

    if (!piece || piece.owner !== action.playerId)
      return actionError('not-your-piece', 'Piece not found or not yours');
    if (!UNIT_KINDS.has(piece.kind))
      return actionError('not-a-unit', 'Can only move military units');
    if (getMovedThisTurn(state).includes(pieceId))
      return actionError('already-moved', 'This unit has already moved this turn');

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
  execute(state, action): ReadonlyArray<GameEvent> {
    const { pieceId, targetTileId } = action.payload;
    const piece = state.pieces.get(pieceId)!;
    const fromTileId = (piece.location as { kind: 'tile'; tileId: string }).tileId;

    // Immutably replace the piece with updated location
    state.pieces.set(pieceId, {
      ...piece,
      location: { kind: 'tile', tileId: targetTileId },
    });

    const moved = getMovedThisTurn(state);
    state.extras['k:movedThisTurn'] = [...moved, pieceId];

    return [{ type: 'unit-moved', playerId: action.playerId, payload: { pieceId, fromTileId, toTileId: targetTileId } }];
  },
};

// ── attack-tile ───────────────────────────────────────────────────────────────

interface AttackPayload { fromTileId: string; toTileId: string }

export const attackTileValidator: ActionValidator<AttackPayload> = {
  type: 'attack-tile',
  validate(state, action) {
    const guard = guardActivePlayer(state, action.playerId);
    if (guard) return guard;

    const { fromTileId, toTileId } = action.payload;
    const ownership = getOwnership(state);

    if (ownership[fromTileId] !== action.playerId)
      return actionError('not-owned', 'You do not own the attacking tile');
    if (ownership[toTileId] === action.playerId)
      return actionError('own-tile', 'Cannot attack your own tile');
    if (!isAdjacent(state.map, fromTileId, toTileId))
      return actionError('not-adjacent', 'Tiles are not adjacent');
    if (unitsOnTile(state, fromTileId, action.playerId!).length === 0)
      return actionError('no-units', 'No units on attacking tile');
    if (getAttackedFrom(state).includes(fromTileId))
      return actionError('already-attacked', 'This tile has already attacked this turn');

    return null;
  },
};

export const attackTileExecutor: ActionExecutor<AttackPayload> = {
  type: 'attack-tile',
  execute(state, action): ReadonlyArray<GameEvent> {
    const { fromTileId, toTileId } = action.payload;
    const playerId = action.playerId!;
    const events: GameEvent[] = [];

    // Gather combatants
    const attackerIds = unitsOnTile(state, fromTileId, playerId);
    const defenderIds = unitsOnTile(state, toTileId);
    const defenderOwner = getOwnership(state)[toTileId] ?? null;

    const toCombatUnit = (id: string): CombatUnit => {
      const piece = state.pieces.get(id)!;
      return { id, kind: piece.kind, attack: UNIT_STATS[piece.kind]?.attack ?? 1 };
    };

    const attackers = attackerIds.map(toCombatUnit);
    const defenders = defenderIds.map(toCombatUnit);

    // Compute defense bonus: terrain × castle (if present)
    const defTile = state.map.tileById(toTileId);
    const terrainBonus = defTile ? terrainDefenseBonus(defTile.terrain) : 1.0;
    const defStructure = structureOnTile(state, toTileId);
    const structureBonus = defStructure ? (STRUCTURE_STATS[defStructure.kind]?.defenseMultiplier ?? 1.0) : 1.0;
    const defenseBonus = terrainBonus * structureBonus;

    const result = resolveAttack(attackers, defenders, defenseBonus);

    // Apply casualties
    for (const id of result.killedDefenderIds) state.pieces.delete(id);
    for (const id of result.killedAttackerIds) state.pieces.delete(id);

    events.push({
      type: 'battle-resolved',
      playerId,
      payload: {
        fromTileId,
        toTileId,
        attackerWins: result.attackerWins,
        attackerStrength: result.attackerStrength,
        defenderStrength: result.defenderStrength,
        attackerCasualties: result.killedAttackerIds.length,
        defenderCasualties: result.killedDefenderIds.length,
      },
    });

    if (result.attackerWins) {
      // Transfer ownership
      const ownership = { ...getOwnership(state), [toTileId]: playerId };
      state.extras['k:ownership'] = ownership;

      events.push({ type: 'tile-captured', playerId, payload: { tileId: toTileId, previousOwner: defenderOwner } });

      // Check if the defender's capital was on this tile
      if (defenderOwner) {
        const capitals = getCapitals(state);
        if (capitals[defenderOwner] === toTileId) {
          // Eliminate the defending player
          const eliminated = [...getEliminated(state), defenderOwner];
          state.extras['k:eliminated'] = eliminated;

          // Remove all of the eliminated player's pieces
          for (const [id, piece] of state.pieces) {
            if (piece.owner === defenderOwner) state.pieces.delete(id);
          }
          // Their tiles become neutral
          const neutralised = { ...getOwnership(state) };
          for (const [tid, owner] of Object.entries(neutralised)) {
            if (owner === defenderOwner) delete neutralised[tid];
          }
          state.extras['k:ownership'] = neutralised;

          events.push({ type: 'player-eliminated', payload: { eliminatedPlayerId: defenderOwner, byPlayerId: playerId } });
        }
      }
    }

    // Mark this tile as having attacked
    state.extras['k:attackedFrom'] = [...getAttackedFrom(state), fromTileId];

    return events;
  },
};

// ── build-structure ───────────────────────────────────────────────────────────

interface BuildPayload { tileId: string; structureKind: string }

export const buildStructureValidator: ActionValidator<BuildPayload> = {
  type: 'build-structure',
  validate(state, action) {
    const guard = guardActivePlayer(state, action.playerId);
    if (guard) return guard;

    const { tileId, structureKind } = action.payload;

    if (!BUILDABLE_STRUCTURES.has(structureKind))
      return actionError('invalid-kind', `${structureKind} cannot be built manually`);
    if (getOwnership(state)[tileId] !== action.playerId)
      return actionError('not-owned', 'You do not own this tile');
    if (structureOnTile(state, tileId) !== null)
      return actionError('tile-occupied', 'A structure already exists on this tile');

    const def = kingdomsPieces.require(structureKind);
    const limit = def?.limitPerPlayer;
    if (limit !== undefined && countPlayerPiecesOfKind(state, action.playerId!, structureKind) >= limit)
      return actionError('structure-limit', `${structureKind} limit reached`);

    const cost = def?.cost ?? {};
    const inv = state.inventories.get(action.playerId!);
    for (const [res, qty] of Object.entries(cost)) {
      if ((inv?.get(res) ?? 0) < qty)
        return actionError('insufficient-resources', `Not enough ${res}`);
    }

    return null;
  },
};

export const buildStructureExecutor: ActionExecutor<BuildPayload> = {
  type: 'build-structure',
  execute(state, action): ReadonlyArray<GameEvent> {
    const { tileId, structureKind } = action.payload;
    const playerId = action.playerId!;

    const def = kingdomsPieces.require(structureKind);
    const cost = def?.cost ?? {};
    const inv = state.inventories.get(playerId)!;
    for (const [res, qty] of Object.entries(cost)) inv.remove(res, qty);

    const id = nextId(state);
    state.pieces.set(id, makeUnit({ id, kind: structureKind, owner: playerId, tileId }));

    return [{ type: 'structure-built', playerId, payload: { pieceId: id, structureKind, tileId } }];
  },
};

// ── demolish-structure ────────────────────────────────────────────────────────

interface DemolishPayload { tileId: string }

export const demolishStructureValidator: ActionValidator<DemolishPayload> = {
  type: 'demolish-structure',
  validate(state, action) {
    const guard = guardActivePlayer(state, action.playerId);
    if (guard) return guard;

    const { tileId } = action.payload;
    if (getOwnership(state)[tileId] !== action.playerId)
      return actionError('not-owned', 'You do not own this tile');

    const structure = structureOnTile(state, tileId);
    if (!structure) return actionError('no-structure', 'No structure on this tile');
    if (structure.kind === 'capital-base') return actionError('cannot-demolish', 'Cannot demolish your Capital Base');
    if (structure.owner !== action.playerId) return actionError('not-yours', 'Structure belongs to another player');

    return null;
  },
};

export const demolishStructureExecutor: ActionExecutor<DemolishPayload> = {
  type: 'demolish-structure',
  execute(state, action): ReadonlyArray<GameEvent> {
    const { tileId } = action.payload;
    const playerId = action.playerId!;
    const structure = structureOnTile(state, tileId)!;

    state.pieces.delete(structure.id);

    // Refund 50% of build cost (rounded down per resource)
    const def = kingdomsPieces.get(structure.kind);
    const cost = def?.cost ?? {};
    const inv = state.inventories.get(playerId)!;
    const refund: Record<string, number> = {};
    for (const [res, qty] of Object.entries(cost)) {
      const back = Math.floor(qty / 2);
      if (back > 0) { inv.add(res, back); refund[res] = back; }
    }

    return [{ type: 'structure-demolished', playerId, payload: { structureKind: structure.kind, tileId, refund } }];
  },
};

// ── end-turn ──────────────────────────────────────────────────────────────────

export const endTurnValidator: ActionValidator<Record<string, never>> = {
  type: 'end-turn',
  validate(state, action) {
    return guardActivePlayer(state, action.playerId);
  },
};

export const endTurnExecutor: ActionExecutor<Record<string, never>> = {
  type: 'end-turn',
  execute(state, action): ReadonlyArray<GameEvent> {
    const playerId = action.playerId!;
    const events: GameEvent[] = [];

    // 1. Collect income from connected structures
    const income = computeIncome(state, playerId);
    const inv = state.inventories.get(playerId)!;
    if (income.wood > 0) inv.add('wood', income.wood);
    if (income.food > 0) inv.add('food', income.food);
    if (income.iron > 0) inv.add('iron', income.iron);
    if (income.gold > 0) inv.add('gold', income.gold);
    events.push({ type: 'income-collected', playerId, payload: income });

    // 2. Consume food for all units
    const foodCost = computeFoodCost(state, playerId);
    if (foodCost > 0) {
      const foodHave = inv.get('food');
      const foodUsed = Math.min(foodHave, foodCost);
      if (foodUsed > 0) inv.remove('food', foodUsed);
      events.push({ type: 'food-consumed', playerId, payload: { foodConsumed: foodUsed, foodCost } });

      // 3. Attrition: disband units that cannot be fed
      const deficit = foodCost - foodHave;
      if (deficit > 0) {
        const victims = chooseAttritionVictims(state, playerId, deficit);
        for (const id of victims) state.pieces.delete(id);
        if (victims.length > 0)
          events.push({ type: 'attrition-applied', playerId, payload: { disbandedCount: victims.length, pieceIds: victims } });
      }
    }

    // 4. Reset per-turn trackers
    state.extras['k:movedThisTurn']  = [];
    state.extras['k:attackedFrom']   = [];

    // 5. Advance turn
    const allPlayers = state.players.all();
    const { newActivePlayer, newRound } = state.rounds.endTurn(
      allPlayers,
      'command',
    );

    events.push({
      type: 'turn-ended',
      playerId,
      payload: { newActivePlayer, newRound, round: state.rounds.round() },
    });

    return events;
  },
};
