import type { GameMap } from '../../map/game-map.js';

/**
 * BFS reachability from a player's capital tile through tiles they own.
 *
 * Disconnected owned tiles generate no income at end-of-turn. This creates
 * strategic depth: cutting an opponent's supply line is as valuable as direct
 * military conquest.
 *
 * This is a pure function — call it whenever you need connectivity, don't cache it.
 * At 61-tile board sizes the BFS runs in well under 1ms. See ADR-005.
 */
export function getConnectedTiles(
  map: GameMap,
  capitalTileId: string,
  ownedTileIds: ReadonlySet<string>,
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
      if (!visited.has(neighbour.id) && ownedTileIds.has(neighbour.id)) {
        queue.push(neighbour.id);
      }
    }
  }

  return visited;
}

/** Build an owned-tile set for one player from the k:ownership extra. */
export function playerOwnedTiles(
  ownership: Record<string, string>,
  playerId: string,
): Set<string> {
  return new Set(
    Object.entries(ownership)
      .filter(([, owner]) => owner === playerId)
      .map(([id]) => id),
  );
}
