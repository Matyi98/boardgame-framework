/**
 * Resource definitions and gold-exchange utilities for Kingdoms of Dominion.
 *
 * ── Four resources ─────────────────────────────────────────────────────────────
 *
 *   Wood  — construction material for farms, castles, gates
 *   Food  — army upkeep; an unfed army blocks recruiting new units (see actions/recruit.ts)
 *   Iron  — military prerequisite for cannoneers and castle upgrades
 *   Gold  — universal exchange medium; produced by every connected tile
 *             based on its economicValue (NOT a terrain type)
 *
 * ── Gold exchange ──────────────────────────────────────────────────────────────
 *
 * A player may spend EXCHANGE_RATE gold to purchase 1 unit of Wood, Food, or Iron.
 * Exchange is used automatically in the economic loop when a player has
 * insufficient food. Any remaining deficit after exchange is simply unmet that
 * round — no units are lost. Players may also exchange manually via a future
 * trade action.
 *
 * ── Production ────────────────────────────────────────────────────────────────
 *
 * See economy.ts for tile-based production rates and structure bonuses.
 * See income.ts for the state-integration layer that calls economy.ts.
 */

import { ResourceRegistry } from '../../resources/resource-type.js';
import type { Inventory } from '../../resources/inventory.js';
import { EXCHANGE_RATE } from './economy.js';

// ── Registry ──────────────────────────────────────────────────────────────────

export const kingdomsResources = new ResourceRegistry()
  .register({ id: 'wood', name: 'Wood', symbol: '🪵' })
  .register({ id: 'food', name: 'Food', symbol: '🍞' })
  .register({ id: 'iron', name: 'Iron', symbol: '⚙️' })
  .register({ id: 'gold', name: 'Gold', symbol: '💰' });

// ── Exchange utilities ────────────────────────────────────────────────────────

/**
 * Returns true if the inventory has enough gold to buy qty of the given resource.
 * The `resource` parameter is accepted for forward compatibility — all resources
 * currently share one exchange rate, but per-resource rates may differ in a future update.
 *
 * @param inventory  The player's inventory
 * @param _resource  Target resource (currently unused; all share EXCHANGE_RATE)
 * @param qty        Number of resource units to purchase
 */
export function canExchange(inventory: Inventory, _resource: string, qty: number): boolean {
  return inventory.has('gold', qty * EXCHANGE_RATE);
}

/**
 * Spend gold from the inventory and add the requested resource.
 * Throws if the inventory lacks sufficient gold (call canExchange first).
 *
 * @param inventory  The player's inventory (mutated in place)
 * @param resource   Target resource: 'wood' | 'food' | 'iron'
 * @param qty        Number of resource units to purchase
 */
export function executeExchange(inventory: Inventory, resource: string, qty: number): void {
  if (qty <= 0) return;
  inventory.remove('gold', qty * EXCHANGE_RATE);
  inventory.add(resource, qty);
}

/**
 * Try to cover a food shortage using gold exchange.
 * Returns the number of food units purchased (may be less than needed if gold is scarce).
 *
 * This is the primary entry point used by the economic loop (Step 7) during
 * the food-shortage phase.
 *
 * @param inventory   The player's inventory (mutated in place)
 * @param foodNeeded  How many food units are needed to cover the deficit
 */
export function exchangeForFood(inventory: Inventory, foodNeeded: number): number {
  if (foodNeeded <= 0) return 0;
  const goldAvailable  = inventory.get('gold');
  const maxAffordable  = Math.floor(goldAvailable / EXCHANGE_RATE);
  const purchased      = Math.min(foodNeeded, maxAffordable);
  if (purchased > 0) executeExchange(inventory, 'food', purchased);
  return purchased;
}
