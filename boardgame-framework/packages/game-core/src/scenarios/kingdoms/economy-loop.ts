/**
 * economy-loop.ts — Per-round economic batch processing for Kingdoms of Dominion.
 *
 * The single exported function processRoundEnd() is called from endTurnExecutor
 * exactly ONCE per round, after the last player in the round ends their turn.
 *
 * ── Processing order ──────────────────────────────────────────────────────────
 *
 * The order below is STRICT and must never be reordered. See economy-loop/README.md
 * for the rationale behind each ordering decision.
 *
 *   For each active player (in turn order):
 *     1. Income collection
 *     2. Food consumption + gold exchange
 *     3. Mortgage (safeguard — fires only if gold goes negative)
 *   After all players:
 *     4. Connectivity check (informational — emits territory-disconnected events)
 *     5. round-ended event
 *
 * ── No starvation attrition ──────────────────────────────────────────────────
 *
 * Units are never disbanded for an unmet food deficit. Instead, recruit-unit
 * blocks recruiting a unit kind that would push the player's food balance
 * negative (see actions/recruit.ts). An existing army can run a deficit
 * indefinitely; gold exchange in step 2 covers what it can, the remainder is
 * simply unmet that round.
 *
 * ── Why per-player then all-players ──────────────────────────────────────────
 *
 * Steps 1–4 are processed fully for each player before the next player starts.
 * This is correct because each player's income/food/attrition is independent of
 * other players — one player's gold doesn't affect another's food requirement.
 * The connectivity check (step 5) runs after ALL players because it reflects the
 * final ownership state after all attrition and mortgages have been applied.
 *
 * ── When to call ─────────────────────────────────────────────────────────────
 *
 * Call processRoundEnd(state) from endTurnExecutor when newRound === true.
 * Never call it mid-round or manually — income snapshots the current ownership
 * state, which should only be read once per round for fairness.
 */

import type { GameState } from '../../state/game-state.js';
import type { GameEvent } from '../../events/game-event.js';
import { computeIncome, computeFoodCost } from './income.js';
import { exchangeForFood } from './resources.js';
import { EXCHANGE_RATE } from './economy.js';
import { playerConnectedTiles } from './connectivity.js';

// ── Internal helpers ──────────────────────────────────────────────────────────

function getOwnership(state: GameState): Record<string, string> {
  return (state.extras['k:ownership'] as Record<string, string>) ?? {};
}

/**
 * Extract the numeric order suffix from a piece ID.
 * Used to find the "oldest" city to mortgage first (lowest suffix = placed first).
 */
function idOrder(pieceId: string): number {
  const match = pieceId.match(/(\d+)$/);
  return match ? parseInt(match[1]!, 10) : 0;
}

/**
 * Find the oldest (lowest ID order) non-mortgaged city owned by a player.
 * Returns null if the player has no unmortgaged cities.
 */
function findOldestUnmortgagedCity(
  state: GameState,
  playerId: string,
  mortgagedIds: Set<string>,
): string | null {
  let oldest: string | null = null;
  let oldestOrder = Infinity;
  for (const [id, piece] of state.pieces) {
    if (piece.owner !== playerId || piece.kind !== 'city') continue;
    if (mortgagedIds.has(id)) continue;
    const order = idOrder(id);
    if (order < oldestOrder) { oldest = id; oldestOrder = order; }
  }
  return oldest;
}

/**
 * Tile IDs owned by a player that are NOT reachable via BFS from their capital.
 * Emitted as territory-disconnected events for UI feedback — no ownership is lost.
 */
function findDisconnectedTiles(state: GameState, playerId: string): string[] {
  const ownership = getOwnership(state);
  const connected = playerConnectedTiles(state.map, state, playerId);
  return Object.entries(ownership)
    .filter(([tileId, owner]) => owner === playerId && !connected.has(tileId))
    .map(([tileId]) => tileId);
}

// ── Per-player round cycle ─────────────────────────────────────────────────────

/**
 * Run the full income→food→attrition→mortgage cycle for a single player.
 * Mutates `state` and pushes events into `events`.
 */
function processPlayerCycle(
  state: GameState,
  playerId: string,
  events: GameEvent[],
): void {
  const inv = state.inventories.get(playerId);
  if (!inv) return; // eliminated players have no inventory

  // ── Step 1: Income ─────────────────────────────────────────────────────────
  //
  // Income is computed from the current ownership snapshot — tiles captured
  // earlier in this round already count. The "income before consumption" rule
  // means a player always benefits from territory before paying upkeep.
  const income = computeIncome(state, playerId);
  if (income.wood > 0) inv.add('wood', income.wood);
  if (income.food > 0) inv.add('food', income.food);
  if (income.iron > 0) inv.add('iron', income.iron);
  if (income.gold > 0) inv.add('gold', income.gold);
  events.push({ type: 'income-collected', playerId, payload: income });

  // ── Step 2: Food consumption ───────────────────────────────────────────────
  //
  // Food is consumed after income so that newly produced food can offset upkeep
  // in the same round. Players who break even on food never trigger attrition.
  const foodCost = computeFoodCost(state, playerId);
  if (foodCost > 0) {
    const foodHave = inv.get('food');
    const foodUsed = Math.min(foodHave, foodCost);
    if (foodUsed > 0) inv.remove('food', foodUsed);
    events.push({ type: 'food-consumed', playerId, payload: { foodConsumed: foodUsed, foodCost } });

    const rawDeficit = foodCost - foodHave;
    if (rawDeficit > 0) {
      // ── Step 2a: Gold exchange ──────────────────────────────────────────────
      //
      // Gold-for-food exchange is the only automatic relief for a food deficit.
      // EXCHANGE_RATE gold buys 1 food. Any remainder is simply unmet this
      // round — no units are disbanded (see module doc header).
      const purchased = exchangeForFood(inv, rawDeficit);
      if (purchased > 0)
        events.push({ type: 'food-purchased', playerId, payload: { purchased, goldSpent: purchased * EXCHANGE_RATE } });
    }
  }

  // ── Step 3: Mortgage (safeguard) ────────────────────────────────────────────
  //
  // In the current economic model gold cannot go negative (food exchange is
  // capped at available gold). This step is a safeguard for future changes
  // that introduce gold upkeep or debt. If triggered, the oldest city is
  // deactivated (no income, no food cost) until future gameplay resolves it.
  if (inv.get('gold') < 0) {
    const mortgagedRaw  = (state.extras['k:mortgagedCities'] as string[] | undefined) ?? [];
    const mortgagedIds  = new Set(mortgagedRaw);
    const cityToMortgage = findOldestUnmortgagedCity(state, playerId, mortgagedIds);
    if (cityToMortgage) {
      state.extras['k:mortgagedCities'] = [...mortgagedRaw, cityToMortgage];
      events.push({ type: 'city-mortgaged', playerId, payload: { pieceId: cityToMortgage } });
    }
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Full economic round-end processing. Call once per round from endTurnExecutor
 * when state.rounds.endTurn() returns newRound === true.
 *
 * Processes all active (non-eliminated) players in their current turn order.
 * Emits income-collected, food-consumed, food-purchased, city-mortgaged,
 * territory-disconnected, and round-ended events.
 */
export function processRoundEnd(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  const activePlayers = state.players.active();

  // Steps 1–3: full economic cycle per player
  for (const player of activePlayers) {
    processPlayerCycle(state, player.id, events);
  }

  // Step 4: Connectivity check — informational only, no ownership change
  for (const player of activePlayers) {
    const disconnected = findDisconnectedTiles(state, player.id);
    if (disconnected.length > 0)
      events.push({
        type: 'territory-disconnected',
        playerId: player.id,
        payload: { tileIds: disconnected },
      });
  }

  // Round marker — always the last event emitted
  events.push({ type: 'round-ended', payload: { round: state.rounds.round() } });

  return events;
}
