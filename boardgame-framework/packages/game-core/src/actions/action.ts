import type { PlayerId } from '../players/player.js';

/**
 * Actions are the only way game state mutates. They flow:
 *   client → engine → validator → executor → event emitter → state.
 *
 * Keep payloads serializable (JSON-safe) so they can travel through the
 * message bus and be persisted in action-history for replay.
 */
export interface Action<TPayload = unknown> {
  /** Stable type discriminator, e.g. `'place-building'`, `'roll-dice'`. */
  readonly type: string;
  /** Who initiated the action. May be `null` for system-triggered actions. */
  readonly playerId: PlayerId | null;
  /** Action-specific data. */
  readonly payload: TPayload;
  /** Monotonic client-side sequence; lets servers reject duplicates. */
  readonly clientSeq?: number;
}

/** Result of attempting an action. Engines should always return one of these. */
export type ActionResult =
  | { ok: true; events: ReadonlyArray<unknown> }
  | { ok: false; error: ActionError };

export interface ActionError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export const actionError = (code: string, message: string, details?: Record<string, unknown>): ActionError => ({
  code,
  message,
  ...(details ? { details } : {}),
});
