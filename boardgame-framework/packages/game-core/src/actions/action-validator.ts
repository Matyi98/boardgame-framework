import type { Action, ActionError } from './action.js';
import type { GameState } from '../state/game-state.js';

/**
 * Validators are pure functions: given current state + action, decide whether
 * the action is currently legal. They MUST NOT mutate state.
 */
export interface ActionValidator<TPayload = unknown> {
  readonly type: string;
  validate(state: GameState, action: Action<TPayload>): ActionError | null;
}

export class ActionValidatorRegistry {
  private readonly validators = new Map<string, ActionValidator>();

  register<TPayload>(validator: ActionValidator<TPayload>): this {
    if (this.validators.has(validator.type)) {
      throw new Error(`Validator already registered for action type: ${validator.type}`);
    }
    this.validators.set(validator.type, validator as ActionValidator);
    return this;
  }

  validate(state: GameState, action: Action): ActionError | null {
    const v = this.validators.get(action.type);
    if (!v) return { code: 'unknown-action', message: `No validator for action: ${action.type}` };
    return v.validate(state, action);
  }
}
