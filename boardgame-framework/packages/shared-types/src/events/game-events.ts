/**
 * Messages published on the `game.events` topic exchange by the engine,
 * consumed by the realtime gateway and fanned out to subscribed clients.
 *
 * Routing key pattern: `game.<gameId>.<eventName>`
 */
export interface GameBusEvent {
  gameId: string;
  /** Monotonic seq assigned by the engine. */
  seq: number;
  /** Domain event type, e.g. `'dice-rolled'`. */
  type: string;
  payload: unknown;
  /**
   * Optional player id this message is private to. The gateway must only
   * forward it to that player's sockets.
   */
  privateTo?: string;
  at: number;
}

/**
 * Messages published on the `game.commands` topic exchange by the realtime
 * gateway, consumed by the engine.
 *
 * Routing key pattern: `game.<gameId>.command`
 */
export interface GameCommandMessage {
  gameId: string;
  userId: string;
  type: string;
  payload: unknown;
  clientSeq?: number;
  /** Originating socket id, used for ack delivery. */
  socketId?: string;
}
