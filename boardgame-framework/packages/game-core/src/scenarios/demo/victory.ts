import type { VictoryCondition, VictoryResult } from '../../rules/victory-condition.js';
import type { GameState } from '../../state/game-state.js';
import type { PlayerId } from '../../players/player.js';

export const WIN_VP = 18;

/**
 * Win condition A — race: first player to WIN_VP wins outright.
 */
export const firstToEighteenVP: VictoryCondition = {
  id: 'first-to-eighteen-vp',

  evaluate(state: GameState): VictoryResult | null {
    for (const [playerId, inventory] of state.inventories) {
      if (inventory.get('vp') >= WIN_VP) {
        return {
          winner: playerId,
          reason: `Reached ${WIN_VP} victory points`,
          conditionId: 'first-to-eighteen-vp',
        };
      }
    }
    return null;
  },
};

/**
 * Win condition B — board full: when every tile has been claimed the player
 * with the highest VP total wins (null winner on a tie).
 */
export const allTilesClaimed: VictoryCondition = {
  id: 'all-tiles-claimed',

  evaluate(state: GameState): VictoryResult | null {
    const totalTiles = [...state.map.tiles()].length;
    const claimedCount = new Set(
      [...state.pieces.values()]
        .filter((p) => p.location.kind === 'tile')
        .map((p) => (p.location as { kind: 'tile'; tileId: string }).tileId),
    ).size;

    if (claimedCount < totalTiles) return null;

    let winner: PlayerId | null = null;
    let topVP = -1;
    let tied = false;

    for (const [playerId, inventory] of state.inventories) {
      const vp = inventory.get('vp');
      if (vp > topVP) {
        topVP = vp;
        winner = playerId;
        tied = false;
      } else if (vp === topVP) {
        tied = true;
      }
    }

    return {
      winner: tied ? null : winner,
      reason: tied
        ? `Board full — draw at ${topVP} VP!`
        : `Board full — wins with ${topVP} VP`,
      conditionId: 'all-tiles-claimed',
    };
  },
};
