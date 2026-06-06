# CLAUDE.md — Boardgame Framework Root

## What this repo is
A multi-service TypeScript monorepo (pnpm workspaces) for hosting online turn-based board games.

| Scenario ID | Name | Status |
|-------------|------|--------|
| `demo-v1` | **Frontier** | ✅ Complete with frontend |
| `kingdoms-v1` | **Kingdoms of Dominion** | 🔧 Backend complete, frontend pending |

Frontier is a 37-tile hex territory-expansion game. Kingdoms of Dominion is a 61-tile military
conquest game with four resources, units, structures, and player elimination.

## How to run locally
```bash
# Full stack (Postgres + Redis + RabbitMQ + all services + nginx)
docker compose up --build

# Rebuild one service after code changes
docker compose build <service>   # e.g. game-engine, web
docker compose up -d <service>

# URLs
# http://localhost        → web app
# http://localhost:8080   → Traefik dashboard
# http://localhost:15672  → RabbitMQ management (bgf / changeme)
```

## Monorepo layout
```
apps/
  auth-service/      NestJS — JWT auth
  lobby-service/     NestJS — room management
  realtime-gateway/  NestJS — Socket.io ↔ RabbitMQ bridge
  game-engine/       NestJS — game logic host
  web/               React + Vite SPA
packages/
  game-core/         Pure domain library (no I/O, no framework)
  event-bus/         RabbitMQ wrapper
  shared-types/      Cross-service DTOs
docs/
  project-map.md       File-by-file map of the whole repo
  data-flow.md         Click → screen data flow with file refs
  adding-scenarios.md  How to add a new game variant
  architecture.md      Component responsibilities and scaling
  module-guide.md      game-core module deep-dive
  kingdoms/            Kingdoms of Dominion design docs (ADRs, data model, action catalogue)
```

## Key architectural rules
- **game-core** must stay pure: no NestJS, no RabbitMQ, no DB imports.
- Services communicate via RabbitMQ only (no direct HTTP between services).
- Game state is authoritative in the engine's in-memory `Map<gameId, GameInstance>`.
- Redis holds snapshots for crash recovery; the `/api/games/:id/init` endpoint serves them to reconnecting clients.
- All randomness goes through `state.rng` (seeded `SeededRandom`) — never `Math.random()`.

## Where to look for specific things
| Question | File |
|----------|------|
| How is a player action processed? | `apps/game-engine/src/engine/engine.service.ts` |
| How does a command reach the engine? | `apps/realtime-gateway/src/realtime/realtime.gateway.ts` |
| How does the frontend update after an event? | `apps/web/src/store/game.ts` → `applyEvent()` |
| How is the hex board rendered? | `apps/web/src/components/Board.tsx` |
| Where is Frontier's game logic? | `packages/game-core/src/scenarios/demo/` |
| Where is Kingdoms game logic? | `packages/game-core/src/scenarios/kingdoms/` |
| Where are Kingdoms design docs? | `docs/kingdoms/` |
| How are turns and rounds managed? | `packages/game-core/src/rounds/round-manager.ts` |
| How does each scenario build its view? | `Scenario.buildView()` — see ADR-001 |
| Where do dice live? | `packages/game-core/src/dice/` |

## Common tasks
- **Add a new game**: follow `docs/adding-scenarios.md`
- **Change board layout**: edit `packages/game-core/src/scenarios/demo/map.ts` + `apps/web/src/components/Board.tsx`
- **Add a new player action**: add validator + executor to `packages/game-core/src/scenarios/demo/actions.ts`, then rebuild `game-engine`
- **Change win condition**: edit `packages/game-core/src/scenarios/demo/victory.ts`
- **Change frontend game view**: `apps/web/src/pages/GamePage.tsx` + `apps/web/src/components/Board.tsx`

## Build order for changes
- Pure game logic change → rebuild `game-engine`
- Frontend change → rebuild `web`
- Shared type change → rebuild everything that imports it
- event-bus or game-core change → rebuild `game-engine` (and `web` if web imports game-core)
