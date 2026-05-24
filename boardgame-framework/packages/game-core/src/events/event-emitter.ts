import type { GameEvent } from './game-event.js';

export type EventListener<E extends GameEvent = GameEvent> = (event: E) => void;

/**
 * In-process event emitter for the game-core. The host app (engine service)
 * subscribes and re-publishes to RabbitMQ for cross-service delivery.
 *
 * Deliberately tiny — we don't use Node's EventEmitter because game-core must
 * stay Node-agnostic so it can run in any TS runtime (including the browser
 * for offline replays).
 */
export class GameEventEmitter {
  private readonly listeners = new Map<string, Set<EventListener>>();
  private readonly wildcards = new Set<EventListener>();
  private nextSeq = 1;

  on<E extends GameEvent>(type: string, listener: EventListener<E>): () => void {
    const set = this.listeners.get(type) ?? new Set<EventListener>();
    set.add(listener as EventListener);
    this.listeners.set(type, set);
    return () => set.delete(listener as EventListener);
  }

  onAny(listener: EventListener): () => void {
    this.wildcards.add(listener);
    return () => this.wildcards.delete(listener);
  }

  emit(event: GameEvent): GameEvent {
    const stamped: GameEvent = { ...event, seq: this.nextSeq++, at: Date.now() };
    this.listeners.get(stamped.type)?.forEach((l) => l(stamped));
    this.wildcards.forEach((l) => l(stamped));
    return stamped;
  }
}
