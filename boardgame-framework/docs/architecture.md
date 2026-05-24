# Architecture

## Goals

1. **Modular** — Every concern is its own small module. Players, dice, cards, map, rounds, resources... each is independently understandable.
2. **Asynchronous between components** — Services talk via RabbitMQ, not direct HTTP. The realtime gateway never waits on the game engine; it publishes the player's intent and listens for the resulting events.
3. **Horizontally scalable** — The two services that need it (realtime gateway, game engine) are stateless from the perspective of any individual request; per-game state lives in Redis (hot) and Postgres (persistent). Spinning up more instances is `docker compose up --scale ...`.
4. **Multi-game capable** — One running stack hosts thousands of concurrent rooms, partitioned across game-engine instances.

## Component responsibilities

### Web client (`apps/web`)
React SPA. Talks HTTP to the REST endpoints (auth, lobby, game queries) and WebSocket to the realtime gateway. No game logic — purely view + intent submission. Optionally imports `@bgf/game-core` for client-side prediction.

### API gateway (Traefik)
- Routes HTTP based on path prefix.
- Proxies WebSocket on `/ws`.
- Load-balances across replicas of the realtime gateway and game engine.
- Sticky-cookie routing for the realtime gateway, so a single browser stays on one instance (avoids re-handshake).
- Auto-configured by Docker labels. No config to maintain.

### Auth service (`apps/auth-service`)
- POST `/api/auth/register`, `/api/auth/login`, GET `/api/auth/me`.
- Issues JWTs; other services validate them locally without round-tripping.
- Only this service reads/writes the `users` table.

### Lobby service (`apps/lobby-service`)
- Game-room CRUD: create, list, join, leave, ready, kick.
- Stores room metadata in Postgres.
- Publishes `LobbyEvent`s to RabbitMQ when the room state changes (so the realtime gateway can notify clients in that room).
- When a room transitions to "playing", publishes `GameStartRequested` so a game-engine instance picks it up.

### Realtime gateway (`apps/realtime-gateway`)
- Holds WebSocket connections.
- Each connection joins one or more Socket.io rooms (e.g. `lobby:42`, `game:abc`).
- **Inbound**: receives client events, validates auth, publishes them to RabbitMQ on `game.commands.<gameId>`.
- **Outbound**: subscribes to `game.events.*` and `lobby.events.*` and fans out to the matching Socket.io rooms.
- **Holds no game state** — just routing. Trivially scales.

### Game engine (`apps/game-engine`)
- The only service that imports `@bgf/game-core`.
- Each instance maintains in-memory `GameInstance`s for the games it owns (with a Redis snapshot for crash recovery).
- Consumes `game.commands.<gameId>` from RabbitMQ; routes to the right `GameInstance`.
- Applies the command through the game-core action pipeline (validate → execute → emit events).
- Publishes resulting events to `game.events.<gameId>`.
- Periodically snapshots state to Redis; on terminal moves, persists final state to Postgres.

**Game ownership**: when a new game starts, the engine instance that picks up the `GameStartRequested` message claims it via a Redis lock keyed by `game:<id>:owner`. All future commands for that game are routed to that instance via a consistent-hash queue. (For the skeleton, simplest implementation is a single-consumer queue per game.)

## Data flow: a player rolls the dice

```
1. Browser    →  realtime-gateway   (WebSocket: "rollDice", gameId)
2. realtime   →  RabbitMQ           (publish: game.commands.<id>  { type: "ROLL_DICE", playerId })
3. RabbitMQ   →  game-engine        (consume; routed to the owning instance)
4. engine     →  game-core          (validate action → execute → returns events)
5. engine     →  RabbitMQ           (publish: game.events.<id>  [ { type: "DICE_ROLLED", values: [3, 4] }, ... ])
6. RabbitMQ   →  realtime-gateway   (all instances subscribe; only the ones with sockets in `game:<id>` care)
7. realtime   →  Browsers           (Socket.io broadcast to room `game:<id>`)
```

Everything between steps 2 and 6 is **fully async**. The browser is never blocked waiting on the engine — it sees the dice roll arrive as a broadcast.

## RabbitMQ topology

See `infra/rabbitmq/definitions.json`. Three exchanges:

- `game.commands` (topic) — client → engine. Routing key `<gameId>`.
- `game.events` (topic) — engine → everyone interested. Routing key `<gameId>`.
- `lobby.events` (topic) — lobby → realtime gateway.

Queues are auto-created per consumer. The engine uses a competing-consumer queue per game (eventually a consistent-hash exchange). The realtime gateway uses fanout-style queues that mirror events to every instance.

## Scaling notes

- **Realtime gateway**: scale up to handle more WebSocket connections. Traefik sticky cookies keep a browser on one instance. All instances see all events, broadcast to their own connections.
- **Game engine**: scale up to handle more concurrent games. Each game is owned by exactly one instance at a time. Loss of an instance → another picks up the game from its Redis snapshot.
- **Auth / Lobby**: scale up only if HTTP load demands it. They're cheap.
- **Postgres / Redis / RabbitMQ**: vertical first; clustered when you really need it.

## What's intentionally NOT in the skeleton

- **Observability** (metrics, traces, structured logs). Add Prometheus + OpenTelemetry when you're ready.
- **Rate limiting**. Easy to add as Traefik middleware.
- **CDN for static assets**. Out of scope; serve from web container behind Traefik.
- **Spectator mode**, **chat**, **replay viewer**. All fit naturally into the event-bus model; not in scope for v0.
