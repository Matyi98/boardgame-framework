# Project Map

> **Purpose of this file**: Give an LLM (or a new developer) a precise "what is where and why" snapshot of the repo so it can navigate confidently without needing to explore the filesystem first.

## Monorepo layout

```
boardgame-framework/
├── apps/
│   ├── auth-service/        # JWT auth (register / login / me)
│   ├── game-engine/         # Pure game logic host; owns GameState in-memory
│   ├── lobby-service/       # Room CRUD; publishes game-starting events
│   ├── realtime-gateway/    # WebSocket bridge (Socket.io ↔ RabbitMQ)
│   └── web/                 # React SPA (Vite + Zustand + socket.io-client)
├── packages/
│   ├── event-bus/           # RabbitMQ wrapper (BusPublisher / BusConsumer)
│   ├── game-core/           # Pure domain library — all board-game primitives
│   └── shared-types/        # DTO interfaces shared across service boundaries
├── docs/                    # You are here
├── infra/                   # RabbitMQ definitions, Postgres init SQL
└── docker-compose.yml       # Full local stack
```

---

## apps/auth-service

| File | Role |
|------|------|
| `src/auth/auth.controller.ts` | REST endpoints: `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me` |
| `src/auth/auth.service.ts` | Bcrypt password hashing, JWT minting via `@nestjs/jwt` |
| `src/users/user.entity.ts` | TypeORM entity: `id UUID PK, username TEXT UNIQUE, passwordHash TEXT` |
| `src/users/users.service.ts` | `findByUsername`, `create` |

**Key env vars**: `JWT_SECRET`, `DATABASE_URL`

---

## apps/lobby-service

| File | Role |
|------|------|
| `src/lobby/lobby.controller.ts` | REST: create/list/get/join/ready/start/close rooms |
| `src/lobby/lobby.service.ts` | In-memory room map + RabbitMQ publish on state changes |
| `src/lobby/room.entity.ts` | `RoomEntity` class — members, status, host, TTL |
| `src/auth/` | JWT guard — validates Bearer token against `JWT_SECRET` |

**Publishes** to exchange `lobby.events` routing key `lobby.<roomId>.<eventType>`.  
**game-starting** event triggers the game-engine to create a new game.

---

## apps/game-engine

| File | Role |
|------|------|
| `src/engine/game-runner.service.ts` | Subscribes to `lobby.events` (game-starting) and `game.commands`. Bridges bus → EngineService |
| `src/engine/engine.service.ts` | `createGame()` + `handleCommand()`. Owns the `Map<gameId, GameInstance>` |
| `src/engine/game-instance.ts` | Thin wrapper: holds one `Game` + event buffer, exposes `submit()` and `drainEvents()` |
| `src/engine/scenario.registry.ts` | `ScenarioRegistry` — maps scenario id strings to `Scenario` objects |
| `src/messaging/games.controller.ts` | `GET /api/games/:id/init` — returns saved view snapshot for page-refresh hydration |
| `src/persistence/game-store.service.ts` | Redis: `save(gameId, state)`, `load`, `saveView`, `loadView` |

**Consumes** `game.commands` exchange.  
**Publishes** to `game.events` exchange.

---

## apps/realtime-gateway

| File | Role |
|------|------|
| `src/realtime/realtime.gateway.ts` | Socket.io gateway at `/ws`. Handles `subscribe-game`, `unsubscribe-game`, `game-command` messages |
| `src/realtime/event-relay.service.ts` | Consumes `game.events.*` from RabbitMQ, dispatches to matching Socket.io rooms |
| `src/realtime/room-registry.service.ts` | Tracks which socket IDs are in which game rooms (for private-event routing) |

---

## apps/web

| File | Role |
|------|------|
| `src/store/auth.ts` | Zustand + persist: `userId`, `username`, `token`. Login / register / logout |
| `src/store/game.ts` | Zustand: `view: DemoView`, `events[]`. Connects WebSocket, applies events via `applyEvent()` |
| `src/store/lobby.ts` | Zustand: room list, current room, polling |
| `src/lib/api.ts` | Typed fetch wrapper — adds Bearer token, handles errors |
| `src/lib/socket.ts` | Singleton `socket.io-client` instance |
| `src/pages/LobbyPage.tsx` | Room list + create/join/ready/start UI |
| `src/pages/GamePage.tsx` | Active game: board, player list, event log, pass button |
| `src/components/Board.tsx` | SVG hex board — renders tiles, claims, dice indicators, hover states |
| `src/components/PlayerList.tsx` | VP scoreboard with progress bars |

---

## packages/game-core

The pure domain library. **No I/O, no framework, no side effects.**

| Module | Key exports | What it does |
|--------|-------------|--------------|
| `map/` | `GameMap`, `MapBuilder`, `HexTile`, `tileId()` | Hex grid: tiles, edges, vertices, terrain registry |
| `pieces/` | `makeUnit()`, `Piece`, `PieceRegistry` | Game tokens placed on tiles/vertices/edges |
| `players/` | `Player`, `PlayerManager` | Roster, seat order |
| `resources/` | `Inventory`, `ResourcePool`, `ResourceRegistry` | Per-player resource bags |
| `cards/` | `Deck`, `Hand`, `CardEffect` | Draw piles and hands |
| `dice/` | `rollDice()`, `SeededRandom`, `RandomSource` | Reproducible randomness |
| `rounds/` | `RoundManager`, `ClockwiseTurnOrder` | Turn/phase state machine |
| `actions/` | `ActionValidator`, `ActionExecutor`, `actionError()` | Command validation + execution |
| `events/` | `GameEventEmitter`, `GameEvent` | In-process event bus |
| `rules/` | `RuleEngine`, `VictoryCondition` | Win condition evaluation |
| `state/` | `GameState`, `GameStateMachine` | The complete in-memory snapshot |
| `setup/` | `createGameState()`, `Scenario` | Factory that builds initial state from a Scenario |
| `game.ts` | `Game` | Orchestrator: validate → execute → check victory |

---

## packages/shared-types

Single source of truth for DTO shapes crossing service boundaries:

| File | Contains |
|------|----------|
| `src/events/lobby-events.ts` | `LobbyEvent` union: room-created, player-joined, game-starting, … |
| `src/commands/game-commands.ts` | `GameCommandMessage` (what the gateway publishes per player action) |
| `src/events/game-events.ts` | `GameBusEvent` (what the engine publishes back) |
| `src/http/auth.ts` | `AuthResponse`, `LoginRequest`, `RegisterRequest` |
| `src/http/lobby.ts` | `RoomSummary`, `RoomDetail`, `CreateRoomRequest` |

---

## packages/event-bus

| File | Role |
|------|------|
| `src/bus-publisher.ts` | `BusPublisher.publish(exchange, routingKey, payload)` |
| `src/bus-consumer.ts` | `BusConsumer.subscribe({ exchange, routingKey, queue, exclusive }, handler)` |
| `src/exchange.ts` | String constants: `Exchange.GameEvents`, `Exchange.GameCommands`, `Exchange.LobbyEvents` |
| `src/routing-key.ts` | `RoutingKey.gameEvent(gameId, type)`, `RoutingKey.gameCommand(gameId)` |

---

## infra/

| Path | Role |
|------|------|
| `rabbitmq/definitions.json` | Exchanges declared at startup; queues are auto-created by consumers |
| `postgres/init.sql` | Creates `users` table (auth-service owns it) |

---

## Key dependency rules

```
web           → shared-types (HTTP DTOs only)
auth-service  → shared-types
lobby-service → shared-types, event-bus
game-engine   → game-core, shared-types, event-bus
realtime-gw   → shared-types, event-bus
game-core     → (nothing — pure domain)
event-bus     → (nothing — pure infra)
shared-types  → (nothing — pure types)
```

`game-core` MUST stay free of NestJS, Express, RabbitMQ, and database drivers.
