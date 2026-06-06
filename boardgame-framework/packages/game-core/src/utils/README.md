# game-core/src/utils

General-purpose pure utilities that are scenario-agnostic and have no I/O.

## connectivity.ts

`getConnectedTiles(map, capitalTileId, ownedTileIds, bridgeTileIds?)` — BFS
reachability from a capital tile through contiguous owned territory.

### Algorithm

Standard breadth-first search with an optional one-hop bridge extension:

```
queue = [capitalTileId]
visited = {}

while queue not empty:
  current = queue.shift()
  mark current visited

  for each neighbour N of current:
    if N is owned and not visited:
      → add N to queue  (normal traversal)

    else if N is NOT owned AND current is a bridge tile (has Gate):
      → peek through N: for each neighbour M of N:
           if M is owned and not visited → add M to queue
```

The unowned "pass-through" tile is never added to `visited` — only owned tiles
on the other side of the gap appear in the returned set.

### Time complexity

O(T + E) where T = number of tiles, E = total adjacency edges.  
On a 61-tile hex map with 6 edges per tile this is ≤ 367 operations — well under 1 ms.

### Why not cache?

Cached connectivity becomes stale the moment a tile changes owner or a Gate is
placed or destroyed. A stale cache lets players recruit on disconnected tiles or
exploit dead Gates. The cost of recalculating is negligible at this board size
(confirmed by benchmarks; see ADR-005). **Do not store the result in `GameState`
or in any mutable variable that outlives a single validate/execute call.**

### Gate bridge mechanic

A tile in `bridgeTileIds` can bridge the BFS through one adjacent unowned tile.
This models a Gate structure: build a Gate on the edge of your territory and it
maintains a supply route across a single contested tile to reconnect cut-off land.

Bridging is one-hop only. Two or more consecutive unowned tiles break the chain
(unless another Gate exists on the far side, where normal traversal resumes).

### isConnected

`isConnected(tileId, connectedSet)` — thin predicate wrapping `Set.has()`.  
Use it in validators instead of `connectedSet.has(tileId)` to make intent explicit:

```typescript
if (!isConnected(tileId, connectedTiles(state, playerId)))
  return actionError('disconnected', 'Tile is not reachable from your capital');
```
