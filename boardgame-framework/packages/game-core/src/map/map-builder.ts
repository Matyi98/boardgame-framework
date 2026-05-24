import { AxialCoord } from './coordinate.js';
import { GameMap } from './game-map.js';
import { Tile, tileId } from './tile.js';
import { TerrainType } from './terrain.js';

/**
 * Fluent builder for maps. Lets you describe a board declaratively
 * rather than imperatively wiring tiles, edges and vertices.
 *
 * NOTE: Edge / vertex generation from adjacency is left as a TODO —
 * implement based on whether your game cares about them.
 */
export class MapBuilder {
  private readonly map = new GameMap();

  addTile(coord: AxialCoord, terrain: TerrainType, numberToken?: number): this {
    const t: Tile = numberToken !== undefined
      ? { id: tileId(coord), coord, terrain, numberToken }
      : { id: tileId(coord), coord, terrain };
    this.map.addTile(t);
    return this;
  }

  /** Generate edges + vertices from the current tile set. TODO: implement. */
  computeAdjacency(): this {
    // For every pair of adjacent tiles → add an edge.
    // For every triple of mutually-adjacent tiles → add a vertex.
    return this;
  }

  build(): GameMap {
    return this.map;
  }
}
