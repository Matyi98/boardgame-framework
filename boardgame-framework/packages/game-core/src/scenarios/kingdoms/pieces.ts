import { PieceRegistry } from '../../pieces/piece-registry.js';

/**
 * Balance knobs: all costs, attack values, HP, and food costs are here.
 * Changing a unit's stats = one-line edit, zero risk to validator logic.
 */
export interface UnitStats {
  attack: number;
  foodPerRound: number;
  hp: number;
}

export interface StructureStats {
  hp: number;
  /** combat defense multiplier applied to defenders on this tile (1.0 = no bonus) */
  defenseMultiplier: number;
}

export const UNIT_STATS: Record<string, UnitStats> = {
  'spearman':  { attack: 2, foodPerRound: 1, hp: 1 },
  'cannoneer': { attack: 5, foodPerRound: 2, hp: 2 },
  'noble':     { attack: 3, foodPerRound: 1, hp: 1 },
};

export const STRUCTURE_STATS: Record<string, StructureStats> = {
  'capital-base': { hp: 5, defenseMultiplier: 1.0 },
  'farm':         { hp: 3, defenseMultiplier: 1.0 },
  'city':         { hp: 3, defenseMultiplier: 1.0 },
  'castle':       { hp: 4, defenseMultiplier: 2.0 },
  'gate':         { hp: 2, defenseMultiplier: 1.0 },
};

export const UNIT_KINDS = new Set(Object.keys(UNIT_STATS));
export const STRUCTURE_KINDS = new Set(Object.keys(STRUCTURE_STATS));
export const BUILDABLE_STRUCTURES = new Set(['farm', 'city', 'castle', 'gate']);

export const kingdomsPieces = new PieceRegistry()
  .register({
    kind: 'capital-base',
    category: 'building',
    displayName: 'Capital Base',
    limitPerPlayer: 1,
    meta: { ...STRUCTURE_STATS['capital-base'] },
  })
  .register({
    kind: 'farm',
    category: 'building',
    displayName: 'Farm',
    cost: { wood: 2 },
    limitPerPlayer: 5,
    meta: { ...STRUCTURE_STATS['farm'] },
  })
  .register({
    kind: 'city',
    category: 'building',
    displayName: 'City',
    cost: { wood: 3, iron: 2 },
    limitPerPlayer: 3,
    meta: { ...STRUCTURE_STATS['city'] },
  })
  .register({
    kind: 'castle',
    category: 'building',
    displayName: 'Castle',
    cost: { wood: 4, iron: 3 },
    limitPerPlayer: 3,
    meta: { ...STRUCTURE_STATS['castle'] },
  })
  .register({
    kind: 'gate',
    category: 'building',
    displayName: 'Gate',
    cost: { wood: 2, iron: 1 },
    meta: { ...STRUCTURE_STATS['gate'] },
  })
  .register({
    kind: 'spearman',
    category: 'unit',
    displayName: 'Spearman',
    cost: { iron: 1, food: 1 },
    limitPerPlayer: 20,
    meta: { ...UNIT_STATS['spearman'] },
  })
  .register({
    kind: 'cannoneer',
    category: 'unit',
    displayName: 'Cannoneer',
    cost: { iron: 3, food: 2 },
    limitPerPlayer: 8,
    meta: { ...UNIT_STATS['cannoneer'] },
  })
  .register({
    kind: 'noble',
    category: 'unit',
    displayName: 'Noble',
    cost: { gold: 5 },
    limitPerPlayer: 2,
    meta: { ...UNIT_STATS['noble'] },
  });
