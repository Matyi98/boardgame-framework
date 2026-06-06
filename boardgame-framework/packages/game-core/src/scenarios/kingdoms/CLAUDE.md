# CLAUDE.md — Kingdoms of Dominion Scenario

## What this is
The `kingdoms-v1` scenario: military conquest on a 61-tile hex map.
See `README.md` for player-facing documentation. See `docs/kingdoms/` for ADRs.

## Files
| File | Purpose |
|------|---------|
| `structures.ts` | **SINGLE SOURCE OF TRUTH** for all structure data (costs, hp, defense, income, food/round) |
| `units.ts` | **SINGLE SOURCE OF TRUTH** for all unit data (costs, hp, attack, defense, movement, food/round, canOccupyUnowned) |
| `terrain.ts` | TerrainRegistry with defenseBonus + moveCost in meta |
| `resources.ts` | ResourceRegistry: wood, food, iron, gold |
| `pieces.ts` | PieceRegistry; UNIT_STATS/UNIT_KINDS derived from units.ts; STRUCTURE_STATS/BUILDABLE_STRUCTURES derived from structures.ts |
| `economy.ts` | Pure math: calculateTileIncome, calculateStructureFoodCost, STRUCTURE_INCOME_EFFECTS (derived from structures.ts) |
| `map.ts` | buildKingdomsMap() — 61-tile 4-ring hex, KINGDOMS_STARTING_COORDS |
| `combat.ts` | resolveAttack() — pure function, no framework imports; wraps framework rules/combat.ts |
| `connectivity.ts` | Thin wrapper over utils/connectivity.ts. Adds playerOwnedTiles(), playerGateTileIds(), playerConnectedTiles() |
| `income.ts` | computeIncome(), computeFoodCost(), chooseAttritionVictims() — state integration layer |
| `actions/` | Modular action files (one file per action group): helpers, recruit, move, attack, build, develop, end-turn |
| `actions/index.ts` | Barrel re-export of all validators + executors |
| `victory.ts` | lastPlayerStanding victory condition |
| `scenario.ts` | Wires everything into kingdomsScenario + buildView() |
| `index.ts` | Public re-exports |
| `structures/README.md` | Structure design table, validation rules, architecture rationale |
| `economy-loop.ts` | `processRoundEnd()` — per-round batch: income → food → attrition → mortgage → connectivity |
| `economy-loop/README.md` | **Critical document** — step-by-step ordering rationale; must be updated on any economic change |
| `units/README.md` | Unit design table, movement rules, Noble capture sequence with turn-by-turn example |

## Key invariants
- `COMBAT_UNIT_KINDS` ⊂ `UNIT_KINDS`: units with `canAttack: false` (Nobles) appear in
  `UNIT_KINDS` but NOT `COMBAT_UNIT_KINDS`. attack-tile validator requires ≥1 COMBAT_UNIT
  on the attacking tile — Nobles alone cannot initiate attacks but do fight alongside
  combat units once a battle begins (their attack stat still contributes to strength)
- `k:ownership` is the source of truth for tile ownership — NOT piece presence
- A tile stays owned even when all units leave (armies can relocate safely)
- A tile becomes neutral only via `attackTileExecutor` when ownership is transferred
- `k:movedThisTurn` and `k:attackedFrom` are always reset at end-of-turn
- `k:nextPieceId` monotonically increases — never reuse IDs even after pieces die
- `k:developed` is a `string[]` of developed tile IDs; income.ts reads it for develop bonus
- Player elimination is tracked via `state.players.eliminate(id)` → `Player.status = 'eliminated'`
  **Never** write to a `k:eliminated` extras array — that pattern was removed in Step 2
- `k:pendingOccupations` / `k:confirmedOccupations` drive the Noble two-turn capture pipeline
  (see units/README.md); endTurnExecutor promotes pending→confirmed then resolves confirmed
- `k:mortgagedCities` is a `string[]` of piece IDs; mortgaged cities are excluded from income
  AND food cost calculations in income.ts; the list is written only by processRoundEnd
- Income/food/attrition runs ONCE PER ROUND (not per turn) via `processRoundEnd()` in
  endTurnExecutor when `newRound === true`; do NOT add per-player economic logic to endTurnExecutor

## Common tasks
| Task | Where |
|------|-------|
| Add a new structure | Add ONE entry to `structures.ts` STRUCTURE_DEFS — pieces.ts and economy.ts derive automatically |
| Change structure balance (cost/defense/income/food) | Edit `structures.ts` STRUCTURE_DEFS only |
| Add a new unit type | Add ONE entry to `units.ts` UNIT_DEFS — pieces.ts derives UNIT_STATS and registry automatically |
| Change unit balance (cost/attack/defense/movement/food) | Edit `units.ts` UNIT_DEFS only |
| Allow a new unit to occupy unowned tiles | Set `canOccupyUnowned: true` in `units.ts` UNIT_DEFS |
| Change which structures allow recruitment | Edit `RECRUIT_STRUCTURES` set in `actions/recruit.ts` |
| Change attrition order | Edit `ATTRITION_PRIORITY` in economy.ts (tiebreak) or `recruitmentOrder()` in income.ts |
| Add a new economic step to the round loop | Add function to `economy-loop.ts`, call in `processPlayerCycle`, update `economy-loop/README.md` |
| Mortgage a city manually (debugging) | Add piece ID to `state.extras['k:mortgagedCities']` |
| Change tile gold yield | Edit GOLD_PER_ECONOMIC_VALUE in economy.ts |
| Change resource yield | Edit BASE_RESOURCE_YIELD in economy.ts |
| Change gold exchange rate | Edit EXCHANGE_RATE in economy.ts |
| Change develop cost | Edit DEVELOP_COST in economy.ts |
| Change attrition priority | Edit ATTRITION_PRIORITY in economy.ts |
| Change combat formula (strength scaling) | Edit resolveAttack() in ../../rules/combat.ts |
| Change casualty fractions (0.5 / 0.4) | Edit resolveAttack() in ../../rules/combat.ts |
| Add new unit that cannot attack | Set `canAttack: false` in `units.ts` UNIT_DEFS — COMBAT_UNIT_KINDS auto-updates |
| Change terrain defense | Edit defenseBonus in terrain.ts meta |
| Add a new action | Create `actions/<name>.ts`, export from `actions/index.ts`, register in scenario.ts |
| Change starting resources | Edit onSetup() in scenario.ts |
| Add a second victory condition | Add to victory.ts, register in victoryConditions array in scenario.ts |

## Frontend note
The Kingdoms frontend (KingdomsBoard, EconomyPanel, MilitaryPanel) does not exist yet.
When implementing it, consume the `KingdomsView` produced by `scenario.buildView()`.
The view shape is documented in `scenario.ts` → `buildView()`.

## Connectivity quick reference

`playerConnectedTiles(map, state, playerId)` — the single function to call from
validators and income.ts. It reads k:ownership, k:capitals, and Gate pieces from
state, then delegates to the framework BFS with Gate bridge support.

`playerGateTileIds(state, playerId)` — returns tile IDs where the player has a
Gate structure. Passed to the BFS as `bridgeTileIds` so Gates extend connectivity
one hop through an adjacent unowned tile.

`isConnected(tileId, connectedSet)` — use in validators instead of `.has()`:
```typescript
if (!isConnected(tileId, playerConnectedTiles(state.map, state, playerId)))
  return actionError('disconnected', '...');
```

## Things NOT to do
- Do not import NestJS, ioredis, or any I/O library here (game-core is pure)
- Do not access `state.extras['homeTiles']` or other Frontier keys — they don't exist in this scenario
- Do not modify `combat.ts` to accept `GameState` — it must stay pure and framework-free
- Do not cache connectivity — always call getConnectedTiles() fresh (see ADR-005)
