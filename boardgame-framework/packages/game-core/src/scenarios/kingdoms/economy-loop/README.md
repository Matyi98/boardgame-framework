# Kingdoms of Dominion — Economic Loop

`economy-loop.ts` implements `processRoundEnd()`, the single function that runs
all economic processing once per round. It is called from `endTurnExecutor` when
`state.rounds.endTurn()` returns `newRound === true` (i.e., after the last player
in the round ends their turn).

**This is the most critical document in the whole system.**
Any engineer modifying the economic loop MUST update this README.

---

## Processing sequence

The steps below run in strict order. Reordering them changes game outcomes.

```
For each active player (in turn order):
  1. Income collection
  2. Food consumption
     2a. Gold exchange (if food deficit)
  3. Attrition (if deficit remains after exchange)
  4. Mortgage (safeguard — currently never fires)

After all players:
  5. Connectivity check
  6. round-ended event
```

---

## Step-by-step rationale

### 1. Income collection → `income-collected` event

```
income = computeIncome(state, playerId)
inv.add('wood' | 'food' | 'iron' | 'gold', ...)
```

**Income is computed from the ownership state at round end** — after all player
turns have been completed. This means tiles captured during the round DO count
toward income; tiles lost during the round do NOT.

**Why income before consumption:** A player must first collect what their territory
produces, then pay upkeep. This models the real world — land is farmed, then
soldiers eat. Computing income after consumption would penalise resource-poor
players doubly.

**Why income first across all rounds:** Computing income once per round (not per
player turn) avoids a "turn order advantage" where players who go earlier get to
collect income before players who go later. All players' income is based on the
same post-round ownership snapshot.

---

### 2. Food consumption → `food-consumed` event

```
foodCost = computeFoodCost(state, playerId)
foodUsed = min(food_in_inventory, foodCost)
inv.remove('food', foodUsed)
```

Food is consumed after income so that newly produced food can offset the same
round's upkeep. A player who exactly breaks even on food (production = consumption)
never triggers gold exchange or attrition.

**What consumes food:**
- Military units: `foodPerRound` stat (spearman=1, cannoneer=2, noble=1)
- Cities: 2 food/round (tracks `calculateStructureFoodCost`)
- Mortgaged cities: exempt (deactivated → no income AND no food cost)

**Why units AND cities consume food:** Cities represent the administrative and
logistical overhead of maintaining urban centres. The separation matters because
attrition only disbands units; cities cannot be "disbanded" — they can only be
mortgaged (Step 4).

---

### 2a. Gold exchange → `food-purchased` event

```
rawDeficit = foodCost - foodHave
purchased  = min(rawDeficit, floor(gold / EXCHANGE_RATE))
inv.remove('gold', purchased × EXCHANGE_RATE)
inv.add('food', purchased)
```

If a player has a food deficit, they may spend gold to purchase food at
`EXCHANGE_RATE` gold per food unit (currently 3:1). Exchange fires BEFORE attrition
to give wealthy players a buffer — they can sustain a food deficit for one round by
spending gold rather than losing units.

**Why exchange before attrition:** Without this buffer, a single bad round wipes out
units immediately. The exchange step allows strategic planning: stockpile gold
during good seasons, spend it in a food shortage.

---

### 3. Attrition → `attrition-applied` event

```
remainingDeficit = rawDeficit - purchased
victims          = chooseAttritionVictims(state, playerId, remainingDeficit)
for id of victims: state.pieces.delete(id)
```

If the deficit persists after gold exchange, units are disbanded until the army
can be sustained.

**Selection order (LIFO + tiebreak):**
Units are selected in reverse recruitment order — the most recently recruited
unit dies first (LIFO). Within the same recruitment slot, `ATTRITION_PRIORITY`
is the tiebreaker (currently: spearman → noble → cannoneer).

**Rationale for LIFO:**
- Newly recruited units are still deploying and easiest to send home
- Creates pre-game strategy: recruit expensive units first so cheaper units absorb attrition
- Requires no additional state tracking — piece ID numeric suffix encodes order
- "kp-150 dies before kp-100" is intuitive from an ID-ordering perspective

**Structures are never attritioned.** Only units with `foodPerRound > 0` are
candidates. City deactivation is handled separately by the mortgage mechanic.

---

### 4. Mortgage (safeguard) → `city-mortgaged` event

```
if (inv.get('gold') < 0):
  cityToMortgage = findOldestUnmortgagedCity(state, playerId)
  state.extras['k:mortgagedCities'].push(cityToMortgage)
```

**In the current economic model, this step never fires.** Gold cannot go negative
because food exchange is capped at available gold. The mortgage step is a forward
compatibility safeguard for future mechanics that introduce gold upkeep or debt.

When triggered, the oldest (lowest piece ID number = placed first) unmortgaged city
is deactivated:
- No gold income bonus from this city
- No food cost from this city (city.foodCostPerRound is skipped)
- The city piece remains on the map (not deleted)

There is currently no un-mortgage mechanic — a mortgaged city stays mortgaged.
A future "city repair" action could remove the piece ID from `k:mortgagedCities`.

---

### 5. Connectivity check → `territory-disconnected` event

After all players have processed their economic cycle, connectivity is recomputed
for each active player:

```
disconnected = playerOwnedTiles ∩ ¬playerConnectedTiles
if disconnected.length > 0:
  emit territory-disconnected { tileIds: disconnected }
```

**This is informational only.** No ownership is changed. Disconnected tiles:
- Still belong to the player (k:ownership unchanged)
- Do NOT generate income (computeIncome already uses BFS — only connected tiles count)
- Are shown in the UI as "grayed out" for feedback

The connectivity check runs after all players because it reflects the final state
after attrition has potentially removed units that were holding territory.

---

### 6. `round-ended` event

Always the final event emitted by processRoundEnd. The round number in the payload
is the round that just completed (not the upcoming round).

---

## Extras keys owned by this loop

| Key | Type | Description |
|-----|------|-------------|
| `k:mortgagedCities` | `string[]` | Piece IDs of deactivated cities |

All other extras keys (`k:ownership`, `k:movedThisTurn`, etc.) are read but not
written by `processRoundEnd` — they are managed by other executors.

---

## Adding new economic steps

To add a new step to the economic loop:

1. Add the step function to `economy-loop.ts`
2. Call it in `processPlayerCycle()` at the correct position
3. Define the event type it emits
4. Update this README with the step and its rationale

Do NOT add economic logic to `endTurnExecutor` — that function only handles
per-turn mechanics (Noble occupation, tracker resets) and the delegation to
`processRoundEnd`.
