import type { GameState } from '../../state/game-state.js';
import type { PlayerId } from '../../players/player.js';
import { getConnectedTiles, playerOwnedTiles } from './connectivity.js';
import { UNIT_STATS } from './pieces.js';

/** Resources earned by each structure kind per end-of-turn. */
const STRUCTURE_INCOME: Record<string, Partial<Record<string, number>>> = {
  'capital-base': { gold: 1 },
  'farm':         { food: 2 },
  'city':         { gold: 2 },
  'castle':       {},
  'gate':         {},
};

export interface IncomeResult {
  wood: number;
  food: number;
  iron: number;
  gold: number;
}

/**
 * Compute resources a player earns at end-of-turn.
 * Only structures on tiles connected to the capital contribute.
 */
export function computeIncome(state: GameState, playerId: PlayerId): IncomeResult {
  const result: IncomeResult = { wood: 0, food: 0, iron: 0, gold: 0 };

  const ownership = (state.extras['k:ownership'] as Record<string, string>) ?? {};
  const capitals  = (state.extras['k:capitals']  as Record<string, string>) ?? {};
  const capitalId = capitals[playerId];
  if (!capitalId) return result;

  const owned     = playerOwnedTiles(ownership, playerId);
  const connected = getConnectedTiles(state.map, capitalId, owned);

  for (const [, piece] of state.pieces) {
    if (piece.owner !== playerId) continue;
    if (piece.location.kind !== 'tile') continue;
    const tid = (piece.location as { kind: 'tile'; tileId: string }).tileId;
    if (!connected.has(tid)) continue;

    const structIncome = STRUCTURE_INCOME[piece.kind];
    if (!structIncome) continue;

    result.wood += structIncome['wood'] ?? 0;
    result.food += structIncome['food'] ?? 0;
    result.iron += structIncome['iron'] ?? 0;
    result.gold += structIncome['gold'] ?? 0;
  }

  return result;
}

/**
 * Total food a player's army needs per round.
 */
export function computeFoodCost(state: GameState, playerId: PlayerId): number {
  let total = 0;
  for (const [, piece] of state.pieces) {
    if (piece.owner !== playerId) continue;
    total += UNIT_STATS[piece.kind]?.foodPerRound ?? 0;
  }
  return total;
}

/**
 * When food would go negative, pick which unit IDs to disband.
 * Priority: cheapest units (spearmen) first to preserve siege capability.
 */
export function chooseAttritionVictims(
  state: GameState,
  playerId: PlayerId,
  foodDeficit: number,
): string[] {
  const PRIORITY_ORDER = ['spearman', 'noble', 'cannoneer'];
  const victims: string[] = [];
  let deficit = foodDeficit;

  for (const kind of PRIORITY_ORDER) {
    if (deficit <= 0) break;
    for (const [id, piece] of state.pieces) {
      if (deficit <= 0) break;
      if (piece.owner !== playerId || piece.kind !== kind) continue;
      const foodFreed = UNIT_STATS[kind]?.foodPerRound ?? 1;
      victims.push(id);
      deficit -= foodFreed;
    }
  }

  return victims;
}
