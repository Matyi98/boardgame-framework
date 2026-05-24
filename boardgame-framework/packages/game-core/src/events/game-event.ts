import type { PlayerId } from '../players/player.js';

/**
 * Base shape for everything that happens inside a game. Events are the
 * "outputs" of action execution and the "inputs" of the realtime gateway,
 * which fans them out to subscribed clients.
 *
 * Events MUST be JSON-serializable.
 */
export interface GameEvent<TPayload = unknown> {
  /** Stable type discriminator, e.g. `'dice-rolled'`, `'piece-placed'`. */
  readonly type: string;
  /** Monotonic, engine-assigned. Set by the engine on emit. */
  readonly seq?: number;
  /** Epoch ms; set by the engine on emit. */
  readonly at?: number;
  /** Player this event primarily concerns, if any. */
  readonly playerId?: PlayerId | null;
  /** Event-specific data. */
  readonly payload: TPayload;
  /**
   * If true, the event contains hidden information (e.g. cards drawn) and
   * should be filtered before being sent to spectators / other players.
   */
  readonly privateTo?: PlayerId | null;
}

/** Common built-in event types the framework itself can emit. */
export const CoreEventType = {
  GameStarted: 'game-started',
  GameEnded: 'game-ended',
  PhaseChanged: 'phase-changed',
  TurnEnded: 'turn-ended',
  RoundEnded: 'round-ended',
  Error: 'error',
} as const;
