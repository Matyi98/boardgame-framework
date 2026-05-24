import type { GameState } from '../state/game-state.js';
import type { PlayerId } from '../players/player.js';

/**
 * A victory condition decides whether the game is over and, if so, who won.
 * Multiple may be registered; the first that returns a winner ends the game.
 */
export interface VictoryCondition {
  readonly id: string;
  evaluate(state: GameState): VictoryResult | null;
}

export interface VictoryResult {
  readonly winner: PlayerId | null; // null for draw
  readonly reason: string;
  readonly conditionId: string;
}

export class VictoryConditionRegistry {
  private readonly conditions: VictoryCondition[] = [];

  add(condition: VictoryCondition): this {
    this.conditions.push(condition);
    return this;
  }

  evaluate(state: GameState): VictoryResult | null {
    for (const c of this.conditions) {
      const r = c.evaluate(state);
      if (r) return r;
    }
    return null;
  }
}
