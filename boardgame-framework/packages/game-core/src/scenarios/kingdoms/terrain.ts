import { TerrainRegistry } from '../../map/terrain.js';

/**
 * Balance knobs: defenseBonus and moveCost live here so they can be tweaked
 * without touching validator or executor logic.
 *
 * defenseBonus: multiplies defender combat strength (1.0 = no bonus)
 * moveCost:     reserved for future AP-based movement (currently units move once/turn)
 */
export const kingdomsTerrains = new TerrainRegistry()
  .register({ id: 'plains',   name: 'Plains',   meta: { defenseBonus: 1.0, moveCost: 1 } })
  .register({ id: 'hills',    name: 'Hills',    meta: { defenseBonus: 1.3, moveCost: 2 } })
  .register({ id: 'forest',   name: 'Forest',   meta: { defenseBonus: 1.5, moveCost: 2 } })
  .register({ id: 'mountain', name: 'Mountain', meta: { defenseBonus: 2.0, moveCost: 3 } });

export function terrainDefenseBonus(terrain: string): number {
  return (kingdomsTerrains.get(terrain)?.meta?.['defenseBonus'] as number | undefined) ?? 1.0;
}
