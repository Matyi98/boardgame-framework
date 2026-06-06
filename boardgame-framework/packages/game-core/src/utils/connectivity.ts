import type { GameMap } from '../map/game-map.js';

/**
 * BFS reachability from a capital tile through contiguous owned territory,
 * with optional one-hop bridge support for Gate structures.
 *
 * @param map          - The game map (provides neighbour lookups)
 * @param capitalTileId - Tile the BFS starts from; must be in ownedTileIds
 * @param ownedTileIds  - All tiles owned by the player
 * @param bridgeTileIds - Owned tiles that carry a Gate structure. A Gate tile
 *   can "bridge" through one adjacent unowned tile to reach owned tiles on the
 *   other side — modeling a supply route across contested ground. Pass an empty
 *   set or omit entirely to disable bridge logic.
 *
 * Returns the set of tile IDs reachable from the capital. The unowned tiles
 * used as bridge hops are NOT included in the returned set.
 *
 * Complexity: O(T + E) where T = map tiles, E = adjacency edges.
 * On a 61-tile board this is negligible — well under 1 ms.
 *
 * IMPORTANT: Do NOT cache the return value in game state. Call this function
 * fresh on every validate() call that requires connectivity. Stale caches cause
 * bugs when ownership or Gate positions change between calls. See ADR-005.
 *
 * Bridge mechanic detail:
 *   Suppose the player owns tile A (with a Gate) and tile C, separated by
 *   unowned tile B (A — B — C). The BFS visits A, sees B is unowned but A is
 *   a bridge tile, peeks at B's neighbours, finds C is owned → adds C to the
 *   queue. C is reachable even though B is not owned.
 */
export function getConnectedTiles(
  map: GameMap,
  capitalTileId: string,
  ownedTileIds: ReadonlySet<string>,
  bridgeTileIds: ReadonlySet<string> = new Set(),
): Set<string> {
  if (!ownedTileIds.has(capitalTileId)) return new Set();

  const visited = new Set<string>();
  const queue: string[] = [capitalTileId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const tile = map.tileById(current);
    if (!tile) continue;

    for (const neighbour of map.neighboursOf(tile.coord)) {
      const nid = neighbour.id;

      if (ownedTileIds.has(nid)) {
        // Normal contiguous-ownership traversal
        if (!visited.has(nid)) queue.push(nid);
      } else if (bridgeTileIds.has(current)) {
        // Gate bridge: this owned tile carries a Gate.
        // Peek one hop through the unowned neighbour to find owned tiles beyond.
        const bridgePassTile = map.tileById(nid);
        if (!bridgePassTile) continue;
        for (const beyond of map.neighboursOf(bridgePassTile.coord)) {
          if (ownedTileIds.has(beyond.id) && !visited.has(beyond.id)) {
            queue.push(beyond.id);
          }
        }
      }
    }
  }

  return visited;
}

/**
 * Convenience predicate for action validators.
 *
 * Prefer `isConnected(tileId, connectedSet)` over `connectedSet.has(tileId)`
 * at call sites — it reads as intent, not implementation.
 */
export function isConnected(tileId: string, connectedSet: ReadonlySet<string>): boolean {
  return connectedSet.has(tileId);
}
