import { AxialCoord } from './coordinate.js';
import { TerrainType } from './terrain.js';

export interface Tile {
  readonly id: string;
  readonly coord: AxialCoord;
  readonly terrain: TerrainType;
  /** Optional numeric token (e.g. Catan-style number tokens for production). */
  readonly numberToken?: number;
  /**
   * Per-tile properties set by the scenario's map builder.
   * Scenarios use this for domain-specific data (resourceType, economicValue,
   * combatValue, …) without polluting the shared Tile interface with typed fields.
   * Frontier ignores this; Kingdoms populates it via MapBuilder.setTileProperty().
   */
  readonly properties?: Readonly<Record<string, unknown>>;
}

export const tileId = (c: AxialCoord): string => `${c.q},${c.r}`;
