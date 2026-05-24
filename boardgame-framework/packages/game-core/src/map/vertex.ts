import { AxialCoord } from './coordinate.js';

/**
 * A vertex is a corner shared by (typically three) tiles.
 * In Catan, settlements / cities live on vertices.
 */
export interface Vertex {
  readonly id: string;
  /** The tiles meeting at this corner. */
  readonly tiles: ReadonlyArray<AxialCoord>;
}

export function vertexId(tiles: ReadonlyArray<AxialCoord>): string {
  return [...tiles]
    .map(t => `${t.q},${t.r}`)
    .sort()
    .join('|');
}
