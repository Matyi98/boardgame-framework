import type { GameState } from '../state/game-state.js';
import type { GameEvent } from '../events/game-event.js';
import type { Rule } from './rule.js';

/**
 * Holds the ordered set of rules for a particular game variant. Order matters
 * — earlier rules see events first and their follow-up events feed later
 * rules in the same pass.
 */
export class RuleEngine {
  private readonly rules: Rule[] = [];

  add(rule: Rule): this {
    this.rules.push(rule);
    return this;
  }

  /**
   * Process an event through all rules, recursively collecting any follow-up
   * events they emit. Returns the full flat list of follow-ups.
   */
  process(state: GameState, event: GameEvent): ReadonlyArray<GameEvent> {
    const out: GameEvent[] = [];
    const queue: GameEvent[] = [event];
    let safety = 1000;
    while (queue.length > 0) {
      if (safety-- <= 0) throw new Error('Rule engine cycle limit exceeded');
      const next = queue.shift()!;
      for (const rule of this.rules) {
        const follow = rule.onEvent(state, next);
        out.push(...follow);
        queue.push(...follow);
      }
    }
    return out;
  }
}
