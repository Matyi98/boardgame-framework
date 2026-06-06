# Kingdoms of Dominion — Overview

## What the game is

Kingdoms of Dominion is a turn-based hex-map strategy game layered on top of the
Boardgame Framework. 2–4 players grow military kingdoms from a starting Capital Base,
expand across the map by conquest, manage four resources, and try to eliminate each
other. A player is eliminated when their Capital Base is captured.

## Core design pillars

| Pillar | Implication |
|--------|-------------|
| **Territorial continuity** | Territory must stay BFS-connected to the Capital Base to generate income. Cutting an opponent's supply line is a key strategy. |
| **Non-linear combat** | `strength = Σ(attack) × √(unitCount) × defenseModifier`. Massed armies are stronger-than-additive. Terrain and castles multiply defender strength. |
| **Four-resource economy** | Wood (construction), Food (sustains armies), Iron (military production), Gold (flexible). Imbalanced economies collapse under pressure. |
| **Frequent-change friendliness** | Balance numbers (VP per structure, unit attack values, food costs) are isolated constants in `pieces.ts` and `terrain.ts`. Changing them requires zero refactoring. |

## Relationship to Frontier (demo-v1)

Kingdoms is a completely separate scenario registered alongside Frontier. The two games
share the framework (engine, event bus, lobby, gateway) but have zero code overlap in
game logic. The only modification to existing code was adding the optional `buildView()`
method to the `Scenario` interface.

## Files

```
packages/game-core/src/scenarios/kingdoms/
  terrain.ts       — terrain registry (plains/hills/forest/mountain) with meta
  resources.ts     — resource registry (wood/food/iron/gold)
  pieces.ts        — piece kind registry with costs, limits, and stats
  map.ts           — 61-tile 4-ring hex map builder
  combat.ts        — pure resolveAttack() — no state, no imports
  connectivity.ts  — pure BFS getConnectedTiles()
  income.ts        — computeIncome() and computeFoodConsumption()
  actions.ts       — all validators + executors
  victory.ts       — last-player-standing victory condition
  scenario.ts      — wires everything into a Scenario object
  index.ts         — public re-exports
```

## Turn structure

1. **Command phase** — player recruits, moves, attacks, builds, demolishes (any order, any number of actions)
2. **End turn** — player explicitly ends their turn; this triggers:
   a. Income collection (connected structures → player inventories)
   b. Food consumption (units eat)
   c. Attrition (starving units disbanded in kind-priority order)
   d. Turn advance (next player becomes active)

## See also

- [01-data-model.md](./01-data-model.md) — entity definitions and relationships
- [02-adr.md](./02-adr.md) — architectural decisions and their rationale
- [03-action-catalogue.md](./03-action-catalogue.md) — every action with payload and validation rules
