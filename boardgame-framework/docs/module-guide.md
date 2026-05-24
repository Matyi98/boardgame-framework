# `game-core` module guide

`packages/game-core` is the heart of the framework. It's a pure-domain TypeScript library — no framework, no I/O, no database. Every concept a board game needs lives here, broken into small focused modules. The `game-engine` service imports it and wraps it with persistence + messaging.

## Design principles

1. **Pure functions where possible** — Given the same input state and action, executing produces the same new state and event list. This makes games replayable from logs.
2. **Seeded RNG** — All randomness flows through a single `RandomSource` interface. Pass a deterministic seed → fully reproducible games.
3. **Commands and events** — Every state change is a `Command` (validated, then executed) that produces `Event`s. The state is reconstructible by replaying the event log.
4. **Pluggable, not hard-coded** — Terrains, resource types, piece types, card effects are all registered with the framework rather than baked in. You build a specific game (Catan-clone, Risk-clone, your own) by configuring the registries.

## Modules

### `map/`
Spatial structure of the board.
- `coordinate.ts` — Axial / cube coordinates for hex grids, plus offset for square grids.
- `tile.ts` — `Tile` interface: id, coordinate, terrain, optional number token.
- `hex-tile.ts` — Hex-specific helpers (neighbours, ring traversal).
- `terrain.ts` — `TerrainRegistry`. Games register their own terrains (forest, hills, sea, ...).
- `edge.ts` — Edge between two tiles. Holds optional piece (e.g. a road).
- `vertex.ts` — Corner shared by three tiles. Holds optional piece (e.g. a settlement).
- `game-map.ts` — Container: all tiles, edges, vertices, lookup helpers.
- `map-builder.ts` — Fluent builder. Compose a map declaratively.

### `pieces/`
Things placed on the map.
- `piece.ts` — Abstract base. Knows its owner, location, kind.
- `building.ts` — Buildings live on **vertices** (settlements, cities).
- `unit.ts` — Units live on **tiles** (soldiers, armies).
- `piece-behavior.ts` — Strategy for movement/attack/upgrade. Lets you swap behaviour without subclassing.
- `piece-registry.ts` — Games register the piece kinds available.

### `players/`
- `player.ts` — Identity, display name.
- `player-color.ts` — Color enum, helpers.
- `player-manager.ts` — Roster, lookup, "find player by id".

### `resources/`
- `resource-type.ts` — `ResourceRegistry`. Money, wood, ore, custom... all opaque string IDs.
- `inventory.ts` — Per-player bag-of-resources. Add, remove, has-at-least.
- `resource-pool.ts` — Shared pools (bank, supply).
- `trade.ts` — Trade offer / acceptance model.

### `cards/`
- `card.ts` — Abstract card.
- `deck.ts` — Draw, discard, shuffle (uses seeded RNG).
- `hand.ts` — A player's cards.
- `card-effect.ts` — How a card mutates state when played. Pluggable.

### `dice/`
- `dice.ts` — Roll N dice with M sides.
- `random.ts` — `RandomSource` interface + a seeded XorShift implementation.

### `rounds/`
- `round.ts` — A full pass around the table.
- `phase.ts` — A sub-step within a turn (e.g. "produce" → "trade" → "build").
- `turn.ts` — One player's turn.
- `turn-order.ts` — Clockwise, snake, custom.
- `round-manager.ts` — Drives the state machine: which player, which phase, what's next.

### `actions/`
The command pattern, the contract between "player wants to do X" and "state changes".
- `action.ts` — Abstract `Action` with a `kind` discriminator.
- `action-validator.ts` — "Is this player allowed to do this right now?" Returns ok or a typed reason.
- `action-executor.ts` — Mutates state and emits events. Pure given input.
- `action-history.ts` — Append-only log of executed actions. Powers replay + undo.

### `events/`
- `game-event.ts` — Event type union. Every state change emits at least one event.
- `event-emitter.ts` — Minimal in-process emitter. The engine forwards these to RabbitMQ.

### `rules/`
- `rule.ts` — A composable predicate over state.
- `rule-engine.ts` — Combine rules; ask "what actions are legal for player X right now?".
- `victory-condition.ts` — When the game ends, who won.

### `state/`
- `game-state.ts` — The single source of truth: map + players + inventories + decks + current round + history.
- `state-machine.ts` — Lobby → setup → playing → ended. Plus phase transitions.

### `setup/`
- `game-setup.ts` — Builds the initial `GameState` from a scenario.
- `scenario.ts` — A named configuration (terrains, initial pieces, victory rules, ...).

## Adding a new feature

The dependency direction is one-way:

```
setup  →  state  →  rules / round-manager  →  actions  →  events
                                                              ↓
                                                            map, pieces, players, resources, cards, dice
```

Adding "trading cards between players" looks like:
1. Define a new `Action` subtype in `actions/`.
2. Add a validator and an executor for it.
3. Emit a new event type in `events/`.
4. The engine wires it up — no other module changes.
