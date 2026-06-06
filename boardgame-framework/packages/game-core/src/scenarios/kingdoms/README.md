# Kingdoms of Dominion Scenario (`kingdoms-v1`)

Turn-based military conquest on a 61-tile hex map. Players grow kingdoms by recruiting
units, attacking adjacent territory, and capturing enemy Capital Bases. A player is
eliminated when their Capital Base is taken. Last kingdom standing wins.

---

## Resource cycle

### The four resources

| Resource | Symbol | Produced by | Consumed by |
|----------|--------|-------------|-------------|
| Wood  | 🪵 | Forest/Plains tiles | Farms, Castles, Gates |
| Food  | 🍞 | Food tiles (plains) | Unit upkeep every round |
| Iron  | ⚙️ | Hills/Mountain tiles | Cannoneers, Castles |
| Gold  | 💰 | **Every connected tile** (economicValue) | Recruiting Nobles, Gold Exchange |

> **Critical design note**: Gold is NOT a terrain type. Every connected tile produces gold
> equal to its `economicValue` (1–5, higher near the map center) regardless of terrain.
> This is the primary income stream. Controlling the centre is economically decisive.

### Tile production (per round)

Each tile connected to the player's Capital Base produces:

```
Gold income  = floor(economicValue × goldMultiplier) + goldBonus
Resource out = floor(BASE_RESOURCE_YIELD × resourceMultiplier)  [of the tile's resourceType]
```

Default constants (`economy.ts`):
- `GOLD_PER_ECONOMIC_VALUE = 1` — 1 gold per economicValue point
- `BASE_RESOURCE_YIELD = 2` — 2 units of resource per tile

### Structure income effects

| Structure | Gold effect | Resource effect |
|-----------|-------------|-----------------|
| Capital Base | +1 gold flat | unchanged |
| Farm | none | ×1.5 resource (floor) |
| City | ×2 gold | unchanged |
| Castle | none | none (defense only) |
| Gate | none | none (connectivity only) |

*Example: Hills tile at centre (economicValue=4), no structure → 4 gold + 2 iron.
Add a City → 8 gold + 2 iron.*

### Connectivity rule

A tile contributes income **only if** it is reachable via BFS from the player's Capital Base
through contiguous owned tiles. A Gate on an otherwise disconnected tile re-connects it.

Disconnected tiles: no income, but ownership is retained until captured.

### Food shortage sequence (end of turn)

When units consume more food than the player's inventory holds:

1. **Deduct available food** (bring inventory to 0)
2. **Gold exchange**: buy food at `EXCHANGE_RATE` gold per unit (`economy.ts`)
   — automatic, no player action required
3. **Attrition**: if still short, disband units in `ATTRITION_PRIORITY` order
   until the deficit is cleared. Disbanded units emit `attrition-applied`.

```
EXCHANGE_RATE     = 3  (3 gold buys 1 food, 1 wood, or 1 iron)
ATTRITION_PRIORITY = ['spearman', 'noble', 'cannoneer']
```

### Manual gold exchange (future)

Players will be able to call `executeExchange(inventory, resource, qty)` via a
`trade-resources` action (not yet implemented). `canExchange(inventory, qty)` checks
affordability before the action proceeds.

---

## Quick reference — where to change things

| What to change | File | Symbol |
|----------------|------|--------|
| Gold per economicValue point | `economy.ts` | `GOLD_PER_ECONOMIC_VALUE` |
| Base resource yield per tile | `economy.ts` | `BASE_RESOURCE_YIELD` |
| Structure gold/resource bonuses | `economy.ts` | `STRUCTURE_INCOME_EFFECTS` |
| Gold exchange rate | `economy.ts` | `EXCHANGE_RATE` |
| Attrition unit priority | `economy.ts` | `ATTRITION_PRIORITY` |
| Unit attack / food cost / HP | `pieces.ts` | `UNIT_STATS` |
| Unit build cost / limit | `pieces.ts` | `kingdomsPieces` |
| Terrain defense bonus | `terrain.ts` | `kingdomsTerrains` meta |
| Starting resources | `scenario.ts` | `onSetup()` |
| Map size / terrain distribution | `map.ts` | `ALL_COORDS`, `TERRAIN_BAG` |
| Combat formula | `../../rules/combat.ts` | `resolveAttack()` |
| Victory rule | `victory.ts` | `lastPlayerStanding` |

---

## Action types (WebSocket `type` field)

| type | description |
|------|-------------|
| `recruit-unit` | Place a new unit on an owned connected tile |
| `move-unit` | Move a unit to an adjacent owned tile |
| `attack-tile` | Attack an adjacent non-owned tile |
| `build-structure` | Build a structure on an owned connected tile |
| `demolish-structure` | Demolish own structure, get 50% resources back |
| `end-turn` | Collect income, feed army, advance turn |

---

## Event types (published to frontend)

| type | payload summary |
|------|-----------------|
| `unit-recruited` | pieceId, unitKind, tileId |
| `unit-moved` | pieceId, fromTileId, toTileId |
| `battle-resolved` | fromTileId, toTileId, strengths, casualty counts |
| `tile-captured` | tileId, previousOwner |
| `player-eliminated` | eliminatedPlayerId, byPlayerId |
| `structure-built` | pieceId, structureKind, tileId |
| `structure-demolished` | structureKind, tileId, refund |
| `income-collected` | { wood, food, iron, gold } |
| `food-consumed` | foodConsumed, foodCost |
| `food-purchased` | purchased, goldSpent (gold exchange triggered) |
| `attrition-applied` | disbandedCount, pieceIds |
| `turn-ended` | newActivePlayer, newRound, round |

---

## State extras (all prefixed `k:`)

| key | type | description |
|-----|------|-------------|
| `k:ownership` | `Record<tileId, playerId>` | Tile ownership |
| `k:capitals` | `Record<playerId, tileId>` | Capital Base tile per player |
| `k:nextPieceId` | `number` | Auto-increment for piece IDs |
| `k:movedThisTurn` | `string[]` | Unit IDs that moved (reset each turn) |
| `k:attackedFrom` | `string[]` | Tile IDs that attacked (reset each turn) |

> Player elimination is tracked via `Player.status` (set by `PlayerManager.eliminate()`),
> not an extras key. Use `state.players.active()` to get living players.

---

## File map

| File | Purpose |
|------|---------|
| `scenario.ts` | Wires everything into `kingdomsScenario`; `onSetup()` and `buildView()` |
| `actions.ts` | All validators + executors |
| `economy.ts` | **Pure** income formulas — import here for previews and tests |
| `income.ts` | State-integration: reads GameState, delegates math to economy.ts |
| `resources.ts` | Resource registry + gold exchange helpers |
| `pieces.ts` | `UNIT_STATS`, `STRUCTURE_STATS`, `PieceRegistry` |
| `terrain.ts` | `TerrainRegistry` with defenseBonus and moveCost |
| `map.ts` | `buildKingdomsMap()` — 61-tile 4-ring hex, seeded shuffle |
| `connectivity.ts` | `getConnectedTiles()` — BFS reachability (always call fresh, never cache) |
| `combat.ts` | Re-exports `resolveAttack()` from `../../rules/combat.ts` |
| `victory.ts` | `lastPlayerStanding` victory condition |
| `index.ts` | Public re-exports |
