import type { ActionValidator } from '../../../actions/action-validator.js';
import type { ActionExecutor } from '../../../actions/action-executor.js';
import type { GameState } from '../../../state/game-state.js';
import type { GameEvent } from '../../../events/game-event.js';
import { computeIncome, computeFoodCost, chooseAttritionVictims } from '../income.js';
import { exchangeForFood } from '../resources.js';
import { EXCHANGE_RATE } from '../economy.js';
import {
  guardActivePlayer,
  getOwnership,
  getPendingOccupations,
  getConfirmedOccupations,
} from './helpers.js';

export const endTurnValidator: ActionValidator<Record<string, never>> = {
  type: 'end-turn',
  validate(state: GameState, action) { return guardActivePlayer(state, action.playerId); },
};

export const endTurnExecutor: ActionExecutor<Record<string, never>> = {
  type: 'end-turn',
  execute(state: GameState, action): ReadonlyArray<GameEvent> {
    const playerId = action.playerId!;
    const events: GameEvent[] = [];

    // ── 0. Resolve Noble occupations (before income so new tiles count) ──────
    //
    // Two-stage pipeline per player:
    //   EndTurn N:   pending  → confirmed  (occupation registered, waiting one full turn)
    //   EndTurn N+1: confirmed → captured  (Noble still on tile AND tile still unowned)
    //
    // "Still unowned" guard ensures a combat capture of the tile during another
    // player's turn cancels the occupation without needing separate cleanup.

    // Stage A: Resolve confirmed occupations for this player
    const confirmed  = { ...getConfirmedOccupations(state) };
    const ownership  = { ...getOwnership(state) };
    for (const [tileId, entry] of Object.entries(confirmed)) {
      if (entry.playerId !== playerId) continue;

      const noble       = state.pieces.get(entry.nobleId);
      const stillOnTile = noble?.location.kind === 'tile' &&
        (noble.location as { kind: 'tile'; tileId: string }).tileId === tileId;
      const stillUnowned = ownership[tileId] === undefined;

      if (stillOnTile && stillUnowned) {
        ownership[tileId] = playerId;
        events.push({ type: 'tile-captured', playerId, payload: { tileId, byNoble: entry.nobleId } });
      }
      // Whether captured or cancelled, remove from confirmed
      delete confirmed[tileId];
    }
    state.extras['k:ownership']           = ownership;
    state.extras['k:confirmedOccupations'] = confirmed;

    // Stage B: Promote this player's pending occupations to confirmed
    const pending    = { ...getPendingOccupations(state) };
    const newConfirmed = { ...getConfirmedOccupations(state) }; // re-read (was just written)
    for (const [tileId, entry] of Object.entries(pending)) {
      if (entry.playerId !== playerId) continue;
      newConfirmed[tileId] = entry;
      delete pending[tileId];
    }
    state.extras['k:pendingOccupations']   = pending;
    state.extras['k:confirmedOccupations'] = newConfirmed;

    // ── 1. Income from connected territory ───────────────────────────────────
    const income = computeIncome(state, playerId);
    const inv    = state.inventories.get(playerId)!;
    if (income.wood > 0) inv.add('wood', income.wood);
    if (income.food > 0) inv.add('food', income.food);
    if (income.iron > 0) inv.add('iron', income.iron);
    if (income.gold > 0) inv.add('gold', income.gold);
    events.push({ type: 'income-collected', playerId, payload: income });

    // ── 2. Food consumed by units and structures ─────────────────────────────
    const foodCost = computeFoodCost(state, playerId);
    if (foodCost > 0) {
      const foodHave = inv.get('food');
      const foodUsed = Math.min(foodHave, foodCost);
      if (foodUsed > 0) inv.remove('food', foodUsed);
      events.push({ type: 'food-consumed', playerId, payload: { foodConsumed: foodUsed, foodCost } });

      // ── 3. Gold exchange: buy missing food before attrition ───────────────
      const rawDeficit = foodCost - foodHave;
      if (rawDeficit > 0) {
        const purchased = exchangeForFood(inv, rawDeficit);
        if (purchased > 0)
          events.push({ type: 'food-purchased', playerId, payload: { purchased, goldSpent: purchased * EXCHANGE_RATE } });

        // ── 4. Attrition: disband units still unfed after exchange ─────────
        const remainingDeficit = rawDeficit - purchased;
        if (remainingDeficit > 0) {
          const victims = chooseAttritionVictims(state, playerId, remainingDeficit);
          for (const id of victims) state.pieces.delete(id);
          if (victims.length > 0)
            events.push({ type: 'attrition-applied', playerId, payload: { disbandedCount: victims.length, pieceIds: victims } });
        }
      }
    }

    // ── 5. Reset per-turn trackers ───────────────────────────────────────────
    state.extras['k:movedThisTurn'] = [];
    state.extras['k:attackedFrom']  = [];

    // ── 6. Advance turn — TurnOrder skips eliminated players automatically ───
    const { newActivePlayer, newRound } = state.rounds.endTurn(state.players.all(), 'command');
    events.push({ type: 'turn-ended', playerId, payload: { newActivePlayer, newRound, round: state.rounds.round() } });

    return events;
  },
};
