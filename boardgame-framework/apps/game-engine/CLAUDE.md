# CLAUDE.md — apps/game-engine

## What this service does
The only service that imports `@bgf/game-core`. It:
1. Listens on RabbitMQ for `game-starting` lobby events → creates new `GameInstance`s
2. Listens for `game.commands` → routes to the right `GameInstance.submit()`
3. Publishes resulting events back to `game.events` exchange
4. Snapshots state to Redis after every mutation
5. Exposes `GET /api/games/:id/init` for page-refresh hydration

## Key files
| File | Role |
|------|------|
| `src/engine/engine.service.ts` | `createGame()` + `handleCommand()` — the main orchestrator |
| `src/engine/game-instance.ts` | Thin wrapper: holds one `Game`, buffers events, exposes `submit()` |
| `src/engine/game-runner.service.ts` | RabbitMQ consumer bootstrap |
| `src/engine/scenario.registry.ts` | Maps scenario ID strings → `Scenario` objects |
| `src/messaging/games.controller.ts` | REST: `GET /api/games/:id/init` and `GET /api/games/:id/snapshot` |
| `src/persistence/game-store.service.ts` | Redis: `save/load` state + `saveView/loadView` for view snapshots |
| `src/persistence/redis.module.ts` | ioredis connection |

## buildView() — critical function
`engine.service.ts` → `buildView(state, players, victory)` converts `GameState` (class instances) to a plain JSON object that the frontend's `DemoView` type can consume.

**If you add a new field to the frontend `DemoView`**, you must also add it here.

Current fields emitted:
```
status, tiles[], players[], currentActivePlayer, winner, winReason, homeTiles, round
```

## Adding a new scenario
1. Create scenario in `packages/game-core/src/scenarios/`
2. Import it in `src/engine/scenario.registry.ts` and call `this.register(myScenario)`
3. Rebuild this service

## RabbitMQ subscriptions
- **Exchange**: `lobby.events` / routing key `lobby.*.game-starting` / queue `engine-game-starting` (shared — one engine picks it up)
- **Exchange**: `game.commands` / routing key `game.*.command` / queue `engine-commands` (shared)

## Persistence note
`GameStoreService.save()` JSON-serializes the full `GameState` (Maps become `{__map:true, entries:[...]}` objects).  
**This is a stub** — the serializer does not reconstruct class instances on `load()`.  
The in-memory `GameInstance` is the source of truth; Redis is only for crash recovery (not yet wired for re-hydration).

## Environment variables
```
RABBITMQ_URL=amqp://bgf:changeme@rabbitmq:5672
REDIS_URL=redis://redis:6379
PORT=3004
```
