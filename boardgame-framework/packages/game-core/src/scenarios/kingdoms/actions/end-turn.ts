import type { ActionValidator } from '../../../actions/action-validator.js';
import type { ActionExecutor } from '../../../actions/action-executor.js';
import type { GameState } from '../../../state/game-state.js';
import type { GameEvent } from '../../../events/game-event.js';
import { processRoundEnd } from '../economy-loop.js';
import {
  guardActivePlayer,
  getTileLoyalty,
} from './helpers.js';

/** Loyalty recovered on every tile with reduced loyalty, every round-end, unconditionally. */
const LOYALTY_RECOVERY_PER_ROUND = 10;
const MAX_LOYALTY = 100;

export const endTurnValidator: ActionValidator<Record<string, never>> = {
  type: 'end-turn',
  validate(state: GameState, action) { return guardActivePlayer(state, action.playerId); },
};

export const endTurnExecutor: ActionExecutor<Record<string, never>> = {
  type: 'end-turn',
  execute(state: GameState, action): ReadonlyArray<GameEvent> {
    const playerId = action.playerId!;
    const events: GameEvent[] = [];

    // ── Reset per-turn trackers ───────────────────────────────────────────────
    state.extras['k:movedThisTurn'] = [];
    state.extras['k:attackedFrom']  = [];

    // ── Advance turn ─────────────────────────────────────────────────────────
    const { newActivePlayer, newRound } = state.rounds.endTurn(state.players.all(), 'command');
    events.push({ type: 'turn-ended', playerId, payload: { newActivePlayer, newRound, round: state.rounds.round() } });

    // ── Per-round economic loop ───────────────────────────────────────────────
    if (newRound) {
      const roundEvents = processRoundEnd(state);
      events.push(...roundEvents);

      // Loyalty recovers unconditionally every round, regardless of whether the
      // tile was attacked — unlike the economic loop, this isn't per-player.
      const loyaltyMap = { ...getTileLoyalty(state) };
      for (const [tileId, entry] of Object.entries(loyaltyMap)) {
        const recovered = entry.loyalty + LOYALTY_RECOVERY_PER_ROUND;
        if (recovered >= MAX_LOYALTY) {
          delete loyaltyMap[tileId];
        } else {
          loyaltyMap[tileId] = { ...entry, loyalty: recovered };
        }
      }
      state.extras['k:tileLoyalty'] = loyaltyMap;
    }

    return events;
  },
};
