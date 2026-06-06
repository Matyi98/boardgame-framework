# CLAUDE.md — packages/game-core

## What this is
The **pure domain library** for the board game framework. Zero I/O, zero framework dependencies.  
Think of it as the "rules engine" — given input state and a player action, it produces new state and events.

## Critical constraint
**Never import NestJS, RabbitMQ, Express, ioredis, or any Node.js built-in** (fs, net, etc.) here.  
This package must be importable in a browser (for client-side prediction / offline replay).

## Module map
```
src/
  game.ts            ← Entry point: Game class — orchestrates validate→execute→victory
  setup/
    game-setup.ts    ← createGameState() factory — call this to start a fresh game
    scenario.ts      ← Scenario interface — implement this to define a new game
  state/
    game-state.ts    ← GameState interface — the complete mutable snapshot
    state-machine.ts ← lobby→setup→playing→ended lifecycle
  actions/
    action.ts        ← Action + ActionResult types, actionError() helper
    action-validator.ts ← ActionValidator<P> interface
    action-executor.ts  ← ActionExecutor<P> interface
    action-history.ts   ← Append-only event log
  events/
    game-event.ts    ← GameEvent type
    event-emitter.ts ← Minimal in-process emitter (no Node EventEmitter)
  rounds/
    round-manager.ts ← Drives turn/phase state machine, exposes endTurn()
    turn-order.ts    ← ClockwiseTurnOrder, SnakeTurnOrder
    phase.ts / turn.ts / round.ts
  map/
    game-map.ts      ← Container: tiles, edges, vertices + lookup helpers
    map-builder.ts   ← Fluent builder for constructing maps
    hex-tile.ts      ← Hex-specific helpers
    tile.ts          ← Tile interface + tileId(coord) helper
    terrain.ts       ← TerrainRegistry
    coordinate.ts    ← Axial/cube coordinate math
  pieces/
    piece.ts         ← Abstract Piece interface
    unit.ts          ← makeUnit() — place a token on a tile
    building.ts      ← Buildings on vertices
    piece-registry.ts
  players/
    player.ts        ← Player type (id, displayName, color, seat)
    player-manager.ts ← Roster: all(), get(id), atSeat()
  resources/
    inventory.ts     ← Per-player bag: add(), remove(), get(), has()
    resource-pool.ts ← Shared bank
    resource-type.ts ← ResourceRegistry
  dice/
    dice.ts          ← rollDice(rng, count, sides)
    random.ts        ← RandomSource interface + SeededRandom (xorshift32)
  rules/
    combat.ts            ← resolveAttack(), pieceAsCombatant(), CombatResult — framework-level, pure
    victory-condition.ts ← VictoryCondition interface
    rule-engine.ts
  utils/
    connectivity.ts  ← getConnectedTiles() BFS + isConnected() — framework-level, pure; Gate bridge via bridgeTileIds param
    README.md        ← Algorithm details, complexity analysis, anti-caching warning (ADR-005)
  cards/             ← Deck, Hand, CardEffect (unused in Frontier)
  scenarios/
    demo/            ← Frontier game (the only implemented scenario)
      scenario.ts    ← demoScenario object
      map.ts         ← buildDemoMap() — 19-tile 2-ring hex layout
      actions.ts     ← claimTileValidator/Executor, endTurnValidator/Executor
      victory.ts     ← firstToTwelveVP, allTilesClaimed
```

## Frontier scenario specifics
- **Map**: 19 axial-hex tiles, 2 rings around center. Tile IDs are `"q,r"` strings.
- **Terrains**: grass (1 VP), forest (2 VP), mountain (3 VP)
- **Actions**: `claim-tile` (claims adjacent unclaimed tile + auto-ends turn) and `end-turn` (pass)
- **Dice**: rolled inside `claimTileExecutor` via `state.rng.intInRange(1, 6)` — roll 6 = +1 bonus VP
- **Home tiles**: pre-placed in `onSetup()`, stored in `state.extras['homeTiles']`
- **Win**: first to 12 VP, or highest VP when board fills

## How to add a player action
1. Define `interface MyPayload` and a `myValidator: ActionValidator<MyPayload>` in `actions.ts`
2. Define `myExecutor: ActionExecutor<MyPayload>` — mutate state, return `GameEvent[]`
3. Register both in `scenario.ts` under `validators` and `executors`
4. Rebuild `game-engine`; the frontend sends `socket.emit('game-command', { type: 'my-action', payload })`

## Randomness rule
Always use `state.rng.intInRange(min, max)` or `state.rng.next()`. Never `Math.random()`.  
The RNG is seeded from the game ID so games are fully reproducible.

## GameState extras
`state.extras` is a `Record<string, unknown>` for scenario-specific data that doesn't fit a typed field.  
Current usage in Frontier: `state.extras['homeTiles']` (Record<playerId, tileId>).

## Piece.stats vs Piece.state
Two bags live on every `Piece`:

| Field | Type | Semantics |
|-------|------|-----------|
| `stats` | `Readonly<Record<string, number>>` | Numeric formula inputs: attack, foodPerRound, maxHp, defenseMultiplier. Immutable once set; comes from `PieceKindDefinition.defaultStats` via `makeUnitFromRegistry()`. |
| `state` | `Readonly<Record<string, unknown>>` | Mutable runtime data: currentHp, hasMoved, etc. Scenario executors write here. |

Use `makeUnitFromRegistry(registry, args)` instead of `makeUnit()` when creating pieces from a known kind — it merges `defaultStats` automatically so attack/hp values are always on the piece without manual threading.

## Tile.properties
`Tile.properties` is a `Readonly<Record<string, unknown>>` for per-tile data set at map-build time.  
Use `MapBuilder.setTileProperties(coord, { key: value, ... })` before calling `build()`.  
Kingdoms uses `resourceType`, `economicValue`, and `combatValue`.  
Do not confuse with `TerrainDefinition.meta` (shared across all tiles of a terrain type).

## Player elimination
`PlayerManager.eliminate(playerId)` is the **sole writer** of `Player.status`.  
After calling it, `state.players.active()` and `TurnOrder.next()` skip the eliminated player automatically.  
Victory conditions read `state.players.active()` — no extras array needed.

## Framework combat
`rules/combat.ts` exposes a pure `resolveAttack(attackers, defenders, tile, structures?)` function.  
`pieceAsCombatant(piece)` extracts a `Combatant` from `Piece.stats['attack']` — returns `null` for structures that don't fight.  
Scenarios should re-export from `rules/combat.ts` rather than reimplementing the formula.
