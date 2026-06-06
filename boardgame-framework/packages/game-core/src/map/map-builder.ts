import { AxialCoord } from './coordinate.js';
import { GameMap } from './game-map.js';
import { Tile, tileId } from './tile.js';
import { TerrainType } from './terrain.js';

/**
 * Fluent builder for maps. Accumulates tile definitions and properties, then
 * constructs an immutable GameMap on .build().
 *
 * Usage pattern:
 *   const map = new MapBuilder()
 *     .addTile({ q: 0, r: 0 }, 'plains')
 *     .addTile({ q: 1, r: 0 }, 'forest')
 *     .setTileProperty({ q: 0, r: 0 }, 'economicValue', 3)
 *     .build();
 *
 * Tile properties are committed at build() time so the same builder can be
 * used for large maps without intermediate allocations. Properties not set by
 * the time build() is called simply won't appear on the tile.
 */
export class MapBuilder {
  private readonly tileDefs: Array<{
    coord: AxialCoord;
    terrain: TerrainType;
    numberToken?: number;
  }> = [];

  /** Pending per-tile property writes, flushed into Tile.properties at build(). */
  private readonly pendingProperties = new Map<string, Record<string, unknown>>();

  addTile(coord: AxialCoord, terrain: TerrainType, numberToken?: number): this {
    this.tileDefs.push({ coord, terrain, numberToken });
    return this;
  }

  /**
   * Set a single property on the tile at coord (or by tile ID string).
   * Can be called before or after addTile() — properties are merged at build().
   * Returns `this` for chaining.
   */
  setTileProperty(coordOrId: AxialCoord | string, key: string, value: unknown): this {
    const id = typeof coordOrId === 'string' ? coordOrId : tileId(coordOrId);
    const existing = this.pendingProperties.get(id) ?? {};
    this.pendingProperties.set(id, { ...existing, [key]: value });
    return this;
  }

  /** Bulk-set multiple properties on one tile. Equivalent to multiple setTileProperty() calls. */
  setTileProperties(coordOrId: AxialCoord | string, props: Record<string, unknown>): this {
    for (const [key, value] of Object.entries(props)) {
      this.setTileProperty(coordOrId, key, value);
    }
    return this;
  }

  /** Generate edges + vertices from the current tile set. TODO: implement when needed. */
  computeAdjacency(): this {
    return this;
  }

  build(): GameMap {
    const map = new GameMap();
    for (const def of this.tileDefs) {
      const id = tileId(def.coord);
      const pending = this.pendingProperties.get(id);
      const tile: Tile = {
        id,
        coord: def.coord,
        terrain: def.terrain,
        ...(def.numberToken !== undefined ? { numberToken: def.numberToken } : {}),
        ...(pending ? { properties: Object.freeze({ ...pending }) } : {}),
      };
      map.addTile(tile);
    }
    return map;
  }
}
