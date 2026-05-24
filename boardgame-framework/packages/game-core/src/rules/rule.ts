import type { GameState } from '../state/game-state.js';
import type { GameEvent } from '../events/game-event.js';

/**
 * Rules are passive observers: they watch every emitted event and may produce
 * follow-up events (e.g. "after a piece is placed, recompute longest road" →
 * may emit `longest-road-changed`).
 *
 * They run AFTER the executor; they read state, may inspect events, and return
 * additional events. They must NOT mutate state directly — if they need to,
 * they emit a system action instead.
 */
export interface Rule {
  readonly id: string;
  /** Called once per emitted event. Return any follow-up events. */
  onEvent(state: GameState, event: GameEvent): ReadonlyArray<GameEvent>;
}
