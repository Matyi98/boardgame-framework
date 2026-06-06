# CLAUDE.md — Kingdoms of Dominion Scenario

## What this is
The `kingdoms-v1` scenario: military conquest on a 61-tile hex map.
See `README.md` for player-facing documentation. See `docs/kingdoms/` for ADRs.

## Files
| File | Purpose |
|------|---------|
| `terrain.ts` | TerrainRegistry with defenseBonus + moveCost in meta |
| `resources.ts` | ResourceRegistry: wood, food, iron, gold |
| `pieces.ts` | PieceRegistry + UNIT_STATS + STRUCTURE_STATS constants |
| `map.ts` | buildKingdomsMap() — 61-tile 4-ring hex, KINGDOMS_STARTING_COORDS |
| `combat.ts` | resolveAttack() — pure function, no framework imports |
| `connectivity.ts` | getConnectedTiles() — BFS from capital through owned tiles |
| `income.ts` | computeIncome(), computeFoodCost(), chooseAttritionVictims() |
| `actions.ts` | All validators + executors |
| `victory.ts` | lastPlayerStanding victory condition |
| `scenario.ts` | Wires everything into kingdomsScenario + buildView() |
| `index.ts` | Public re-exports |

## Key invariants
- `k:ownership` is the source of truth for tile ownership — NOT piece presence
- A tile stays owned even when all units leave (armies can relocate safely)
- A tile becomes neutral only via `attackTileExecutor` when ownership is transferred
- `k:movedThisTurn` and `k:attackedFrom` are always reset at end-of-turn
- `k:nextPieceId` monotonically increases — never reuse IDs even after pieces die
- Player elimination is tracked via `state.players.eliminate(id)` → `Player.status = 'eliminated'`
  **Never** write to a `k:eliminated` extras array — that pattern was removed in Step 2

## Common tasks
| Task | Where |
|------|-------|
| Add a new unit type | Add to UNIT_STATS + kingdomsPieces in pieces.ts, handle cost deduction in recruitUnitExecutor |
| Add a new structure | Add to STRUCTURE_STATS + BUILDABLE_STRUCTURES + kingdomsPieces in pieces.ts, add income to STRUCTURE_INCOME in income.ts |
| Change combat formula | Edit resolveAttack() in combat.ts only |
| Change terrain defense | Edit defenseBonus in terrain.ts meta |
| Add a new action | Add validator + executor to actions.ts, register in scenario.ts |
| Change starting resources | Edit onSetup() in scenario.ts |
| Add a second victory condition | Add to victory.ts, register in victoryConditions array in scenario.ts |

## Frontend note
The Kingdoms frontend (KingdomsBoard, EconomyPanel, MilitaryPanel) does not exist yet.
When implementing it, consume the `KingdomsView` produced by `scenario.buildView()`.
The view shape is documented in `scenario.ts` → `buildView()`.

## Things NOT to do
- Do not import NestJS, ioredis, or any I/O library here (game-core is pure)
- Do not access `state.extras['homeTiles']` or other Frontier keys — they don't exist in this scenario
- Do not modify `combat.ts` to accept `GameState` — it must stay pure and framework-free
- Do not cache connectivity — always call getConnectedTiles() fresh (see ADR-005)
