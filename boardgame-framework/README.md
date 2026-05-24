# Board Game Framework

A modular framework for building online turn-based board games (Catan-style, Risk-style, and beyond). This repository is a **skeleton starting point** — the architecture, module layout, infrastructure and types are in place, but the game logic is intentionally left as stubs for you to fill in.

> **Status:** scaffolding only. No game rules implemented yet.

## Quick start

```bash
# 1. Install dependencies (requires pnpm 9+ and Node 20+)
pnpm install

# 2. Copy and edit env vars
cp .env.example .env

# 3. Bring the whole stack up (Postgres, Redis, RabbitMQ, all services, web)
docker compose up --build

# Visit:
#   http://localhost           - web app
#   http://localhost:8080      - Traefik dashboard
#   http://localhost:15672     - RabbitMQ management (bgf / changeme)
```

To scale a service horizontally for testing:

```bash
docker compose up --scale game-engine=3 --scale realtime-gateway=2
```

## Architecture

See [`docs/architecture.md`](./docs/architecture.md) for the full write-up. In short:

- **Web client** (React + Vite + Socket.io) talks to the backend through a single entry point.
- **Traefik** is the API gateway — it routes `/api/auth`, `/api/lobby`, `/api/games` to the appropriate services and proxies `/ws` to the realtime gateway. Auto-configured from Docker labels, no config files to maintain.
- **Four NestJS services**, all stateless and replicable:
  - `auth-service` — JWT + user accounts
  - `lobby-service` — game rooms, slot management, matchmaking
  - `realtime-gateway` — Socket.io fan-out to clients (scales × N, sticky-routed by cookie)
  - `game-engine` — actual game logic; each instance owns N active games (scales × N)
- **RabbitMQ** is the inter-service event bus. Player actions and game events flow through it asynchronously, so the realtime gateway and game engine can scale independently.
- **PostgreSQL** for persistent data (users, completed games, action history for replays).
- **Redis** for hot active-game state and session lookups.

## Repository layout

```
boardgame-framework/
├── apps/                  Microservices and the web client
│   ├── web/                React + Vite frontend
│   ├── auth-service/       JWT + users
│   ├── lobby-service/      Room and matchmaking
│   ├── realtime-gateway/   Socket.io fan-out
│   └── game-engine/        Turn logic, applies game-core
├── packages/              Shared libraries
│   ├── shared-types/       DTOs and event types shared across boundaries
│   ├── event-bus/          RabbitMQ wrapper (publisher + consumer)
│   └── game-core/          ⭐ Pure-domain game framework (no I/O)
├── infra/                 Traefik + RabbitMQ config
├── docs/                  Architecture, getting-started, module guide
└── docker-compose.yml     The whole stack
```

## The `game-core` package

This is where most of the design effort lives. It's a **pure-logic library**: no databases, no HTTP, no framework dependencies. That makes it:

- **Testable** — unit-test entire games with seeded RNG.
- **Reusable** — same code on server (engine) and client (prediction).
- **Composable** — every concept is its own small module, with a clear seam between them.

Modules:

| Module | What it covers |
|---|---|
| `map/` | Coordinate systems, tiles, terrain types, edges (e.g. roads), vertices (e.g. corners), map builder |
| `pieces/` | Abstract piece, buildings, units, behaviour strategies, registry |
| `players/` | Player, color, manager |
| `resources/` | Resource type, inventory, resource pool, trade |
| `cards/` | Card, deck, hand, card effect |
| `dice/` | Dice + seeded RNG (replayable games) |
| `rounds/` | Round, phase, turn, turn order, round manager |
| `actions/` | Command pattern: action, validator, executor, history (for undo + replay) |
| `events/` | Game event types, event emitter |
| `rules/` | Rule, rule engine, victory condition |
| `state/` | Game state container, state machine |
| `setup/` | Game setup / scenarios |

See [`docs/module-guide.md`](./docs/module-guide.md) for the design intent behind each module.

## Why these tech choices?

| Choice | Why |
|---|---|
| **pnpm workspaces** | Simplest monorepo tool. No Nx/Turbo to learn. |
| **NestJS** | Decorator-driven modules are exactly the "small, dependency-injected modules" pattern asked for. |
| **Traefik** | Auto-discovers services from Docker labels. Zero config files to maintain. |
| **RabbitMQ over Kafka** | Easier to operate. Plenty of throughput for turn-based games. |
| **Socket.io over raw WS** | Built-in room support, auto-reconnect, fallback transports. |
| **Prisma** | Type-safe DB layer. Migrations are a single command. |
| **Zustand on the frontend** | Smaller and simpler than Redux. Fine for this scale. |

## Roadmap (what to implement next)

1. **Auth-service**: finish JWT + user registration with Prisma.
2. **Lobby-service**: room creation, joining, ready-up.
3. **game-core**: pick one module to flesh out first (`dice` and `state` are easiest).
4. **game-engine**: wire a minimal "roll dice, broadcast" loop end-to-end.
5. **realtime-gateway**: relay engine events to clients in the right room.
6. **web**: minimal lobby UI, then a hex-grid renderer for the map.

## License

MIT — change as you like.
