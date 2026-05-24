import { AxialCoord } from './coordinate.js';
import { TerrainType } from './terrain.js';

export interface Tile {
  readonly id: string;
  readonly coord: AxialCoord;
  readonly terrain: TerrainType;
  /** Optional numeric token (e.g. Catan-style number tokens for production). */
  readonly numberToken?: number;
  /** Arbitrary tile-level state set by game rules (blocked, on fire, etc.). */
  readonly meta?: Readonly<Record<string, unknown>>;
}

export const tileId = (c: AxialCoord): string => `${c.q},${c.r}`;
