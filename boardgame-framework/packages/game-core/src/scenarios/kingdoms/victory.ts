import type { VictoryCondition, VictoryResult } from '../../rules/victory-condition.js';
import type { GameState } from '../../state/game-state.js';

/**
 * Win when all other players are eliminated. Evaluated after every action
 * that could produce a `player-eliminated` event.
 */
export const lastPlayerStanding: VictoryCondition = {
  id: 'last-player-standing',
  evaluate(state: GameState): VictoryResult | null {
    if (state.players.count() < 2) return null;

    const survivors = state.players.active();

    if (survivors.length === 1) {
      return {
        winner: survivors[0]!.id,
        reason: `${survivors[0]!.displayName} is the last kingdom standing`,
        conditionId: 'last-player-standing',
      };
    }

    if (survivors.length === 0) {
      return { winner: null, reason: 'All kingdoms fell — the land is silent', conditionId: 'last-player-standing' };
    }

    return null;
  },
};
