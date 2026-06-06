# Kingdoms of Dominion Scenario (`kingdoms-v1`)

Turn-based military conquest on a 61-tile hex map. Players grow kingdoms by recruiting
units, attacking adjacent territory, and capturing enemy Capital Bases. A player is
eliminated when their Capital Base is taken. Last kingdom standing wins.

## Quick reference

| Thing to change | File to edit |
|-----------------|--------------|
| Unit attack / food cost / HP | `pieces.ts` → `UNIT_STATS` |
| Unit build cost / limit | `pieces.ts` → `kingdomsPieces` registry |
| Structure income | `income.ts` → `STRUCTURE_INCOME` |
| Terrain defense bonus | `terrain.ts` → `kingdomsTerrains` meta |
| Starting resources | `scenario.ts` → `onSetup()` |
| Map size or shape | `map.ts` → `ALL_COORDS` + `TERRAIN_BAG` |
| Combat formula | `combat.ts` → `resolveAttack()` |
| Victory rule | `victory.ts` |

## Action types (WebSocket `type` field)

| type | description |
|------|-------------|
| `recruit-unit` | Place a new unit on an owned tile |
| `move-unit` | Move a unit to an adjacent owned tile |
| `attack-tile` | Attack an adjacent non-owned tile |
| `build-structure` | Build a structure on an owned tile |
| `demolish-structure` | Demolish own structure, get 50% resources back |
| `end-turn` | Collect income, feed army, advance turn |

## Event types (published to frontend)

| type | description |
|------|-------------|
| `unit-recruited` | A new unit was placed |
| `unit-moved` | A unit changed tile |
| `battle-resolved` | Combat result with strengths and casualties |
| `tile-captured` | Tile ownership transferred |
| `player-eliminated` | A player's Capital Base was taken |
| `structure-built` | A structure was placed |
| `structure-demolished` | A structure was removed |
| `income-collected` | Resources earned at end-of-turn |
| `food-consumed` | Food deducted for unit upkeep |
| `attrition-applied` | Starving units disbanded |
| `turn-ended` | Turn advanced to next player |

## Extras keys (all prefixed `k:`)

| key | type | description |
|-----|------|-------------|
| `k:ownership` | `Record<tileId, playerId>` | Tile ownership |
| `k:capitals` | `Record<playerId, tileId>` | Capital Base location per player |
| `k:eliminated` | `string[]` | Eliminated player IDs |
| `k:nextPieceId` | `number` | Auto-increment for piece IDs |
| `k:movedThisTurn` | `string[]` | Piece IDs that moved (reset each turn) |
| `k:attackedFrom` | `string[]` | Tile IDs that attacked (reset each turn) |
