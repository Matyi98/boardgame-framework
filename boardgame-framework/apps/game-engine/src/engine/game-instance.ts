import { Game, type Action, type GameState, type Scenario } from '@bgf/game-core';
import type { GameEvent } from '@bgf/game-core';

/**
 * Thin wrapper around a single `Game` from game-core. Owns the in-memory
 * `GameState` and exposes ergonomic methods for the runner. Persistence is
 * not its concern — the runner asks for snapshots and writes them out.
 */
export class GameInstance {
  private readonly listenerOff: () => void;
  private readonly buffer: GameEvent[] = [];

  constructor(
    readonly gameId: string,
    readonly game: Game,
    readonly scenario: Scenario,
  ) {
    this.listenerOff = game.events.onAny((e) => this.buffer.push(e));
  }

  start(): void {
    this.game.start();
  }

  submit(action: Action): ReturnType<Game['submit']> {
    return this.game.submit(action);
  }

  drainEvents(): ReadonlyArray<GameEvent> {
    const out = this.buffer.slice();
    this.buffer.length = 0;
    return out;
  }

  get state(): GameState {
    return this.game.state;
  }

  dispose(): void {
    this.listenerOff();
  }
}
