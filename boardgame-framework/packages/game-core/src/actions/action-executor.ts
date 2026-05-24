import type { Action } from './action.js';
import type { GameState } from '../state/game-state.js';
import type { GameEvent } from '../events/game-event.js';

/**
 * Executors mutate state and emit events. They are called only AFTER the
 * matching validator has accepted the action. Keep them deterministic — the
 * same state + action must always produce the same events, otherwise replay
 * from action-history will diverge.
 */
export interface ActionExecutor<TPayload = unknown> {
  readonly type: string;
  execute(state: GameState, action: Action<TPayload>): ReadonlyArray<GameEvent>;
}

export class ActionExecutorRegistry {
  private readonly executors = new Map<string, ActionExecutor>();

  register<TPayload>(executor: ActionExecutor<TPayload>): this {
    if (this.executors.has(executor.type)) {
      throw new Error(`Executor already registered for action type: ${executor.type}`);
    }
    this.executors.set(executor.type, executor as ActionExecutor);
    return this;
  }

  execute(state: GameState, action: Action): ReadonlyArray<GameEvent> {
    const e = this.executors.get(action.type);
    if (!e) throw new Error(`No executor for action: ${action.type}`);
    return e.execute(state, action);
  }
}
