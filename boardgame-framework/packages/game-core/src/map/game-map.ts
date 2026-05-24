import { AxialCoord, axialEquals } from './coordinate.js';
import { Tile, tileId } from './tile.js';
import { Edge } from './edge.js';
import { Vertex } from './vertex.js';

/**
 * Container for everything spatial: tiles, edges (roads / connectors),
 * vertices (corners / nodes). Lookup-optimised; immutable once built.
 */
export class GameMap {
  private readonly _tiles = new Map<string, Tile>();
  private readonly _edges = new Map<string, Edge>();
  private readonly _vertices = new Map<string, Vertex>();

  addTile(tile: Tile): void { this._tiles.set(tile.id, tile); }
  addEdge(edge: Edge): void { this._edges.set(edge.id, edge); }
  addVertex(vertex: Vertex): void { this._vertices.set(vertex.id, vertex); }

  tile(coord: AxialCoord): Tile | undefined { return this._tiles.get(tileId(coord)); }
  tileById(id: string): Tile | undefined { return this._tiles.get(id); }
  edge(id: string): Edge | undefined { return this._edges.get(id); }
  vertex(id: string): Vertex | undefined { return this._vertices.get(id); }

  tiles(): IterableIterator<Tile> { return this._tiles.values(); }
  edges(): IterableIterator<Edge> { return this._edges.values(); }
  vertices(): IterableIterator<Vertex> { return this._vertices.values(); }

  tilesWhere(predicate: (t: Tile) => boolean): Tile[] {
    return [...this._tiles.values()].filter(predicate);
  }

  /** Find all tiles adjacent to the given one. */
  neighboursOf(coord: AxialCoord): Tile[] {
    return [...this._tiles.values()].filter(t => isNeighbour(coord, t.coord));
  }
}

function isNeighbour(a: AxialCoord, b: AxialCoord): boolean {
  if (axialEquals(a, b)) return false;
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return Math.abs(dq) <= 1 && Math.abs(dr) <= 1 && Math.abs(dq + dr) <= 1;
}
