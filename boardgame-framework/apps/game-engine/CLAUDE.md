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

## buildView() — per-scenario view building (ADR-001)
`engine.service.ts` → `buildView(state, players, victory, scenario)` now delegates to
`scenario.buildView()` when the scenario implements it. Only falls back to the old
hardcoded Frontier logic when `scenario.buildView` is absent.

**For any new scenario**: implement `buildView()` in the scenario object.
**For Frontier fields**: still hardcoded in the engine fallback — no change needed.

## Adding a new scenario
1. Create scenario directory in `packages/game-core/src/scenarios/<name>/`
2. Implement the `Scenario` interface (including `buildView()` for custom view shape)
3. Export from `packages/game-core/src/scenarios/index.ts`
4. Register in `src/engine/engine.module.ts` → `onModuleInit()`
5. Rebuild this service

## Registered scenarios
| ID | Name | File |
|----|------|------|
| `demo-v1` | Frontier | `packages/game-core/src/scenarios/demo/` |
| `kingdoms-v1` | Kingdoms of Dominion | `packages/game-core/src/scenarios/kingdoms/` |

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
