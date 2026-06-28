export { kingdomsScenario } from './scenario.js';

// View types — import these in the frontend instead of duplicating the shape
export type {
  KingdomsView,
  KingdomsTileView,
  KingdomsTilepiece,
  KingdomsTileIncome,
  KingdomsPlayerView,
  KingdomsTurnState,
} from './view-builder.js';

// Combat
export type { Combatant, CombatResult } from './combat.js';
export { resolveAttack } from './combat.js';

// Connectivity
export {
  getConnectedTiles,
  playerOwnedTiles,
  playerGateTileIds,
  playerConnectedTiles,
  isConnected,
} from './connectivity.js';

// Economy (pure functions + constants — importable by frontend for previews)
export type { TileIncome, StructureIncomeEffect } from './economy.js';
export {
  calculateTileIncome,
  calculateFoodConsumption,
  calculateStructureFoodCost,
  calculateGoldIncome,
  EXCHANGE_RATE,
  DEVELOP_COST,
  STRUCTURE_INCOME_EFFECTS,
} from './economy.js';

// Resources
export { canExchange, executeExchange, exchangeForFood } from './resources.js';

// Structures (single source of truth — adding a new structure = edit structures.ts only)
export type { StructureKind, StructureDef } from './structures.js';
export { STRUCTURE_DEFS, STRUCTURE_KINDS, BUILDABLE_STRUCTURES } from './structures.js';

// Develop mechanic constants (useful for frontend tooltips)
export { TERRAIN_DEVELOPS_INTO } from './actions/develop.js';
