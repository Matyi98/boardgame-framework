import type { Action } from './actions/action.js';
import type { ActionResult } from './actions/action.js';
import { ActionValidatorRegistry } from './actions/action-validator.js';
import { ActionExecutorRegistry } from './actions/action-executor.js';
import { GameEventEmitter } from './events/event-emitter.js';
import { RuleEngine } from './rules/rule-engine.js';
import { VictoryConditionRegistry } from './rules/victory-condition.js';
import { GameStateMachine } from './state/state-machine.js';
import type { GameState } from './state/game-state.js';
import type { Scenario } from './setup/scenario.js';

/**
 * Game ties the registries together. One instance per active game, owned by
 * the engine service. The engine service exposes `submit(action)` over its
 * API and replays the resulting events into RabbitMQ.
 *
 * No I/O happens here. Hosts (engine service) handle persistence and message
 * delivery; this class is pure orchestration.
 */
export class Game {
  readonly events = new GameEventEmitter();

  private readonly validators = new ActionValidatorRegistry();
  private readonly executors = new ActionExecutorRegistry();
  private readonly rules = new RuleEngine();
  private readonly victories = new VictoryConditionRegistry();
  private readonly machine: GameStateMachine;

  constructor(
    readonly state: GameState,
    scenario: Scenario,
  ) {
    this.machine = new GameStateMachine(state.status);
    scenario.validators.forEach((v) => this.validators.register(v));
    scenario.executors.forEach((e) => this.executors.register(e));
    scenario.rules.forEach((r) => this.rules.add(r));
    scenario.victoryConditions.forEach((c) => this.victories.add(c));
  }

  start(): void {
    if (this.machine.status === 'setup') {
      this.machine.transitionTo('playing');
      this.state.status = 'playing';
    }
  }

  /**
   * The single entry point for state changes. Validates, executes, runs
   * follow-up rules, checks victory, and records to history. Returns the
   * stamped events the caller should publish.
   */
  submit(action: Action): ActionResult {
    const error = this.validators.validate(this.state, action);
    if (error) return { ok: false, error };

    const primary = this.executors.execute(this.state, action);
    const stamped = primary.map((e) => this.events.emit(e));
    const followUps = stamped.flatMap((e) => this.rules.process(this.state, e));
    const stampedFollow = followUps.map((e) => this.events.emit(e));

    const all = [...stamped, ...stampedFollow];
    this.state.history.append(action, all);

    const victory = this.victories.evaluate(this.state);
    if (victory) {
      this.machine.transitionTo('ended');
      this.state.status = 'ended';
      const ended = this.events.emit({ type: 'game-ended', payload: victory });
      return { ok: true, events: [...all, ended] };
    }

    return { ok: true, events: all };
  }
}
