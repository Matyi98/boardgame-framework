/**
 * Re-exports the framework-level combat contract for use within this scenario.
 * The actual implementation lives in packages/game-core/src/rules/combat.ts.
 *
 * If Kingdoms ever needs scenario-specific combat extensions (e.g. Noble-capture
 * logic, siege mechanics), add them here and keep the framework layer generic.
 */
export type { Combatant, TileProperties, StructureEffect, CombatResult } from '../../rules/combat.js';
export { resolveAttack, pieceAsCombatant } from '../../rules/combat.js';
