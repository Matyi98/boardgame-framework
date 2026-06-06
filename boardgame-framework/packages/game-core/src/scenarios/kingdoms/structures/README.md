# Kingdoms of Dominion — Structure System

Structures are permanent pieces placed on owned tiles. A tile holds at most one
structure at a time. All structure data is defined in a single canonical table:
[`../structures.ts`](../structures.ts).

## Structure table

| Structure    | Build cost         | Defense mult | Income effect            | Food/round | Limit |
|--------------|--------------------|:------------:|--------------------------|:----------:|:-----:|
| Capital Base | (starting)         | 2.0×         | +1 gold flat             | 0          | 1     |
| Farm         | 2 Wood             | 1.0×         | +50% resource yield      | 0          | 5     |
| City         | 3 Wood + 2 Iron    | 1.0×         | ×2 gold on tile          | 2          | 3     |
| Castle       | 4 Wood + 3 Iron    | 2.0×         | none                     | 0          | 3     |
| Gate         | 2 Wood + 1 Iron    | 1.0×         | re-connects territory    | 0          | ∞     |

All values are balance knobs. **To change them: edit `structures.ts` only.**
No other file needs to be modified for a simple cost/defense/income change.

## Build validation rules

1. It is the player's turn.
2. The player owns the target tile.
3. The tile is **connected** to the player's capital (BFS via `playerConnectedTiles`).
4. No structure already exists on the tile.
5. The player has not exceeded the per-kind limit.
6. The player has sufficient resources.

Capital Base is excluded from `BUILDABLE_STRUCTURES` — it is placed by setup.

## Demolish

Any non-Capital-Base structure can be demolished. The player receives a **50%
resource refund** (rounded down per resource). Demolishing a Gate may disconnect
previously bridged territory on the following turn.

## Develop-tile action

Spending `DEVELOP_COST` (= 8) gold permanently boosts a connected, owned tile:

- Tiles with an existing resource type: `+BASE_RESOURCE_YIELD` of that resource
  each round (on top of structure multipliers).
- Barren tiles (`resourceType = null`): unlock the terrain's natural resource at
  `BASE_RESOURCE_YIELD` per round (plains → food, forest → wood, hills/mountain → iron).

A tile can only be developed once. Development is stored in `state.extras['k:developed']`
and applied in `income.ts` — tile properties themselves remain immutable.

## Why income effects are in economy.ts, not events

Structure income is applied once per round in a deterministic, ordered sweep over
all connected tiles. Emitting an event per-structure per-round and then replaying
those events would produce the same result but:

1. Creates hundreds of events per round at scale (61 tiles × 4 players).
2. Makes the income formula implicit (it lives in the event handler, not the calculator).
3. Introduces ordering bugs if event handlers fire out of order.

Instead: `calculateTileIncome(tile, structureKinds)` → `computeIncome(state, playerId)` →
`endTurnExecutor` emits one `income-collected` event per player with totals. The pure
function is easily testable and the event log stays minimal.

## Capital Base defense

The Capital Base has a **2.0× defense multiplier** (same as Castle). This makes the
capital significantly harder to capture than unfortified tiles, without making it
completely impregnable (which 4× would achieve). This is a balance decision — adjust
`defenseMultiplier` in `structures.ts` if needed.

## City food consumption

Cities consume **2 food per round**. This is separate from military unit food so
that:
- `chooseAttritionVictims` only disbands units, never structures.
- Step 7 (economy-loop) can implement "city mortgaging" when gold is depleted,
  as a separate mechanic from unit attrition.

`computeFoodCost` in `income.ts` sums both unit and structure food costs.
`calculateStructureFoodCost` in `economy.ts` handles the structure portion as a
pure function.
