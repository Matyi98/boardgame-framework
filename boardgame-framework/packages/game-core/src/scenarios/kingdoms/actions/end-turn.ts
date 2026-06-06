import type { ActionValidator } from '../../../actions/action-validator.js';
import type { ActionExecutor } from '../../../actions/action-executor.js';
import type { GameState } from '../../../state/game-state.js';
import type { GameEvent } from '../../../events/game-event.js';
import { processRoundEnd } from '../economy-loop.js';
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

    // ── Noble occupation pipeline (per-player, every turn) ───────────────────
    //
    // Two-stage pipeline ensures occupation takes a full round to complete:
    //   EndTurn N:   pending  → confirmed  (registered, waiting one full round)
    //   EndTurn N+1: confirmed → captured  (Noble still on tile AND still unowned)
    //
    // "Still unowned" guard ensures a combat capture of the tile during another
    // player's turn cancels the occupation without any additional cleanup code.

    // Stage A: Resolve confirmed occupations → capture tiles
    const confirmed = { ...getConfirmedOccupations(state) };
    const ownership = { ...getOwnership(state) };
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
      delete confirmed[tileId];
    }
    state.extras['k:ownership']            = ownership;
    state.extras['k:confirmedOccupations'] = confirmed;

    // Stage B: Promote pending occupations → confirmed (will resolve next endTurn)
    const pending      = { ...getPendingOccupations(state) };
    const newConfirmed = { ...getConfirmedOccupations(state) }; // re-read after Stage A
    for (const [tileId, entry] of Object.entries(pending)) {
      if (entry.playerId !== playerId) continue;
      newConfirmed[tileId] = entry;
      delete pending[tileId];
    }
    state.extras['k:pendingOccupations']   = pending;
    state.extras['k:confirmedOccupations'] = newConfirmed;

    // ── Reset per-turn trackers ───────────────────────────────────────────────
    state.extras['k:movedThisTurn'] = [];
    state.extras['k:attackedFrom']  = [];

    // ── Advance turn ─────────────────────────────────────────────────────────
    const { newActivePlayer, newRound } = state.rounds.endTurn(state.players.all(), 'command');
    events.push({ type: 'turn-ended', playerId, payload: { newActivePlayer, newRound, round: state.rounds.round() } });

    // ── Per-round economic loop ───────────────────────────────────────────────
    //
    // processRoundEnd() runs once per round (after the last player's turn).
    // It covers income, food consumption, gold exchange, attrition, mortgage,
    // and connectivity checks for ALL active players simultaneously.
    // See economy-loop.ts and economy-loop/README.md for full details.
    if (newRound) {
      const roundEvents = processRoundEnd(state);
      events.push(...roundEvents);
    }

    return events;
  },
};
