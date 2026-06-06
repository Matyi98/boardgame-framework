# Kingdoms of Dominion — Data Model

## Terrain types

Stored in `terrain.ts`. Properties live in `TerrainDefinition.meta` so the framework
registry doesn't need to be changed when balance is adjusted.

| id | displayName | defenseBonus | moveCost | notes |
|----|-------------|-------------|----------|-------|
| `plains` | Plains | 1.0 | 1 | Basic terrain |
| `hills` | Hills | 1.3 | 2 | Slight defense bonus |
| `forest` | Forest | 1.5 | 2 | Significant defense |
| `mountain` | Mountain | 2.0 | 3 | Strong defense |

**defenseBonus** multiplies defender combat strength. 1.0 = no bonus.
**moveCost** is reserved for future per-AP movement (currently each unit moves once/turn).

## Resources

All four live in the player's `Inventory` (from `GameState.inventories`).

| id | symbol | primary source | primary sink |
|----|--------|----------------|--------------|
| `wood` | 🪵 | not auto-generated — must be traded or captured | buildings |
| `food` | 🍞 | Farms (2/round) | unit upkeep |
| `iron` | ⚙️ | not auto-generated — starting stock + captured | military production |
| `gold` | 💰 | Capital Base (1/round), Cities (2/round) | flexible |

Note: Wood and Iron are scarce by design. Players start with some and must manage carefully.
Future: a terrain-based passive income for wood/iron can be added in `income.ts`.

## Piece kinds

Defined in `pieces.ts`. All stats go in `PieceKindDefinition.meta` so balance changes
require only that file.

### Structures (category: 'building', placed on tiles)

| kind | displayName | recruit cost | hp | income | defense bonus | limit |
|------|-------------|-------------|----|---------|----|-------|
| `capital-base` | Capital Base | free (setup) | 5 | 1 gold/round | none (terrain applies) | 1 |
| `farm` | Farm | 2 wood | 3 | 2 food/round | none | 5 |
| `city` | City | 3 wood + 2 iron | 3 | 2 gold/round | none | 3 |
| `castle` | Castle | 4 wood + 3 iron | 4 | none | ×2 to all defenders on tile | 3 |
| `gate` | Gate | 2 wood + 1 iron | 2 | none | none | unlimited |

`capital-base` is placed once by `onSetup()`, never buildable, never demolishable.
When a `capital-base` is captured (its tile changes ownership) the owner is eliminated.

### Military units (category: 'unit', placed on tiles)

| kind | displayName | recruit cost | attack | food/round | notes | limit |
|------|-------------|-------------|--------|------------|-------|-------|
| `spearman` | Spearman | 1 iron + 1 food | 2 | 1 | bread-and-butter infantry | 20 |
| `cannoneer` | Cannoneer | 3 iron + 2 food | 5 | 2 | siege specialist; bonus vs structures | 8 |
| `noble` | Noble | 5 gold | 3 | 1 | can capture enemy Nobles instead of killing | 2 |

## State extras (namespaced with `k:`)

`GameState.extras` is the escape hatch for scenario-specific data that doesn't fit
typed fields. All Kingdoms keys use the `k:` prefix to avoid collisions.

| key | type | description |
|-----|------|-------------|
| `k:ownership` | `Record<tileId, playerId>` | which player controls each tile |
| `k:capitals` | `Record<playerId, tileId>` | where each player's Capital Base tile is |
| `k:eliminated` | `string[]` | player IDs who have been eliminated |
| `k:nextPieceId` | `number` | auto-increment counter for unique piece IDs |
| `k:movedThisTurn` | `string[]` | piece IDs that already moved this turn (reset on turn-end) |
| `k:attackedFrom` | `string[]` | tile IDs whose units already attacked this turn (reset on turn-end) |

## Ownership and connectivity

Tile ownership is tracked in `k:ownership`. The engine does NOT rely on piece presence
to determine ownership — ownership persists even if all units leave a tile. Tiles become
neutral only when explicitly captured via `attack-tile`.

Connectivity is computed on-demand (never cached) by `getConnectedTiles()` in
`connectivity.ts`. It performs a BFS from the player's capital tile through tiles they own.
Disconnected owned tiles generate no income at end-of-turn, but remain owned.
