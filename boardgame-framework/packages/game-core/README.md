# `@bgf/game-core`

Pure-domain game framework. **No I/O, no framework, no DB.** Everything board-game-related lives here, broken into small modules.

See [`../../docs/module-guide.md`](../../docs/module-guide.md) for the design intent.

```
src/
├── map/          — Coordinates, tiles, terrain, edges, vertices
├── pieces/       — Things placed on the map
├── players/      — Player identity and management
├── resources/    — Resources and inventories
├── cards/        — Cards, decks, hands
├── dice/         — Dice + seeded RNG
├── rounds/       — Round / phase / turn state machine
├── actions/      — Command pattern: validate → execute → emit events
├── events/       — Event type union
├── rules/        — Rule engine + victory conditions
├── state/        — GameState container
├── setup/        — Initial state construction
└── game.ts       — Top-level orchestrator
```
