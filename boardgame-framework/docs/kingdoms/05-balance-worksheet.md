# Kingdoms of Dominion — Balance Worksheet

This document tracks the economic and military parameters that determine game pacing.
Any change to a constant in `units.ts`, `structures.ts`, or `economy.ts` should be
reflected here with a rationale. It also serves as a quick sanity-check spreadsheet for
playtest data.

---

## 1. Unit Stats

| Unit      | Recruit Cost         | Attack | Defense | HP | Movement | Food/round | canAttack |
|-----------|----------------------|--------|---------|----|----------|------------|-----------|
| Spearman  | 10 gold + 1 food     | 3      | 5       | 10 | 1        | 1          | yes       |
| Cannoneer | 20 gold + 2 iron     | 8      | 2       | 6  | 1        | 2          | yes       |
| Noble     | 30 gold + 1 iron + 1 food | 1 | 3       | 8  | 2        | 1          | no (occupation only) |

### Combat strength per unit (plains, no structure)

Strength formula: `Σ(attack) × √(count)`

| Count | Spearmen | Cannoneers |
|-------|----------|------------|
| 1     | 3.0      | 8.0        |
| 2     | 8.5      | 22.6       |
| 3     | 15.6     | 41.6       |
| 4     | 24.0     | 64.0       |
| 5     | 33.5     | 89.4       |

**Breakeven**: 1 cannoneer ≈ 2.7 spearmen in raw strength. A pair of cannoneers
(str ≈ 22.6) cleanly beats a squad of 5 spearmen (str ≈ 33.5) only when joined by a
third cannoneer (str ≈ 41.6). This means quality matters but mass cannot be
ignored indefinitely.

### Structure defense benchmarks

| Terrain  | Bonus | 1 Spearman defended | 1 Spearman + Castle |
|----------|-------|---------------------|---------------------|
| Plains   | ×1.0  | 3.0                 | 6.0                 |
| Hills    | ×1.3  | 3.9                 | 7.8                 |
| Forest   | ×1.5  | 4.5                 | 9.0                 |
| Mountain | ×2.0  | 6.0                 | 12.0                |

A single spearman in a mountain castle (str 12) defeats a pair of cannoneers in
the open (str ≈ 22.6) only if joined by a second defender. Good defensive play
rewards structure investment.

---

## 2. Structure Stats

| Structure    | Build Cost         | Defense Mult | Income Effect         | Food/round | Limit/player |
|--------------|--------------------|--------------|-----------------------|------------|--------------|
| Capital Base | (starting piece)   | ×4.0         | +1 gold flat          | 0          | 1            |
| Farm         | 2 wood             | ×1.0         | resource yield ×1.5   | 0          | —            |
| City         | 50 gold            | ×1.0         | gold income ×2        | 2          | 3            |
| Castle       | 3 iron             | ×2.0         | —                     | 0          | —            |
| Gate         | 2 wood + 1 iron    | ×1.0         | bridges 1-tile gap    | 0          | —            |

### City payback period

A city costs 50 gold and doubles gold income on its tile. For a tile with economic
value 3 (3 gold/round baseline), a city adds +3 gold/round (net of 2 food consumed
at the gold exchange rate of 3 gold/food = 6 gold equivalent cost):

```
Net income delta = 3 gold added − 6 gold in food cost = −3 gold/round
```

At EV 3, a city is a net drain unless the player already produces enough food.
A city on EV 5 produces +5 extra gold − 6 gold food = −1 gold/round, still marginal.
**Cities only become profitable when the player has a food surplus** (i.e., farm-backed
food production covers unit and city consumption, leaving gold to accumulate).

**City payback with surplus food (0 food cost):**

| Tile EV | Extra gold/round | Turns to break even |
|---------|------------------|---------------------|
| 2       | 2                | 25                  |
| 3       | 3                | 17                  |
| 5       | 5                | 10                  |

Target game length is 20–30 rounds for a 2-player game. Cities on EV 5 tiles
with a food surplus break even in 10 rounds, which is a good investment.

---

## 3. Gold Income Reference

`GOLD_PER_ECONOMIC_VALUE = 1` — each point of economic value produces 1 gold/round.

| Tiles owned | Avg EV | Gold/round (no city) | Gold/round (all cities) |
|-------------|--------|----------------------|-------------------------|
| 5           | 2      | 10                   | 20 (−10 food cost)      |
| 10          | 2.5    | 25                   | 50 (−20 food cost)      |
| 15          | 3      | 45                   | 90 (−30 food cost)      |

The centre tiles (EV 4–5) are a major economic prize — controlling 3 high-EV centre
tiles can add 15+ gold/round, funding a cannoneer every ~1.5 rounds.

---

## 4. Army Sustainability (Food Budget)

`BASE_RESOURCE_YIELD = 2` food per food-terrain tile per round.
`FARM_RESOURCE_MULT = 1.5` → 3 food/round with a Farm.

| Food tiles (no farm) | Food/round | Spearmen sustainable | Cannoneers sustainable |
|----------------------|------------|----------------------|------------------------|
| 1                    | 2          | 2                    | 1                      |
| 2                    | 4          | 4                    | 2                      |
| 3 + 1 farm           | 9          | 9                    | 4 (8 food) + 1 extra   |

**Rule of thumb**: 1 food tile (no farm) sustains 2 spearmen or 1 cannoneer.
A farm more than doubles this — a key upgrade target for aggressive players.

---

## 5. Expected Game Length by Player Count

Estimated from: income ~20 gold/round at equilibrium, capital defense mult ×4,
starting army of 2 spearmen, and the assumption that attacking players must
assemble 6+ cannoneers to crack a defended capital on mountain/hills terrain.

| Players | Rounds to first elimination | Total rounds |
|---------|----------------------------|--------------|
| 2       | 15–20                      | 20–30        |
| 3       | 12–18                      | 25–40        |
| 4       | 10–15                      | 30–50        |

These are design targets, not validated playtest data. Adjust if playtests show
games ending too quickly (buff defense) or lasting too long (buff cannoneer attack
or reduce capital defense multiplier).

---

## 6. Exchange Rate

`EXCHANGE_RATE = 3` gold per 1 unit of any resource.

Buying food to feed 1 cannoneer for 1 round costs 3 gold × 2 = 6 gold.
A cannoneer earns back its recruitment cost (20 gold) in combat value, not gold.
If a player is consistently buying food instead of growing it, they lose economy
to a food-self-sufficient opponent within 5–10 rounds.

---

## 7. Parameters to Tune (Known Risks)

| Parameter | Current value | Risk if too high | Risk if too low |
|-----------|---------------|------------------|-----------------|
| EXCHANGE_RATE | 3 | Buying resources is too expensive → stagnant games | Buying resources trivialises production |
| Cannoneer attack | 8 | Cannoneers one-shot everything → no counterplay | Spearmen dominate → boring early game |
| Capital defense mult | 4 | Capital is impregnable → games never end | Capitals fall too early → random elimination |
| City gold mult | 2 | Cities dominate economy → who builds first wins | Cities never worth building |
| Noble movement | 2 | Nobles capture too fast → hard to counter | Nobles too slow to matter strategically |
| DEVELOP_COST | 8 | Developing tiles is not worth it | Develop trivialises map control |

All numeric constants live in a single file each:
- Unit values → `packages/game-core/src/scenarios/kingdoms/units.ts`
- Structure values → `packages/game-core/src/scenarios/kingdoms/structures.ts`
- Economy rates → `packages/game-core/src/scenarios/kingdoms/economy.ts`

Change the constant, rebuild `game-core`, re-run tests. No other files need updating.
