# CLAUDE.md — apps/lobby-service

## What this service does
Manages game rooms (create, join, ready, start, close).  
Rooms are stored **in-memory** — they reset on service restart.  
When a game starts, it publishes a `game-starting` event that the engine picks up.

## Key files
| File | Role |
|------|------|
| `src/lobby/lobby.controller.ts` | REST endpoints — all under `/api/lobby/` |
| `src/lobby/lobby.service.ts` | Business logic: room CRUD, TTL cleanup, RabbitMQ publish |
| `src/lobby/room.entity.ts` | `RoomEntity` class — holds members, status, host |
| `src/auth/` | JWT guard reused from auth-service's secret |

## REST API
```
POST   /api/lobby/rooms              create room  { name, scenarioId, maxPlayers }
GET    /api/lobby/rooms              list open rooms
GET    /api/lobby/rooms/:id          get room detail
POST   /api/lobby/rooms/:id/join     join room
POST   /api/lobby/rooms/:id/ready    toggle ready
POST   /api/lobby/rooms/:id/start    host starts game (all must be ready)
DELETE /api/lobby/rooms/:id          host closes room
```

## Room lifecycle
```
open → (all ready + host starts) → starting → [engine picks up game-starting event]
```

## What game-starting event contains
```ts
{
  type: 'game-starting',
  roomId, gameId,             // gameId is a fresh UUID
  scenarioId,                 // e.g. 'demo-v1'
  players: [{ id: userId, displayName }],  // insertion order = seat order
  at: timestamp,
}
```
The engine uses `players[i].id` as the in-game player ID (same as auth userId).

## Room TTL
Rooms older than 30 minutes that are still `open` are purged every 5 minutes.  
Rooms in `starting` state are not purged (the game is live).

## Important: rooms are in-memory
If the lobby-service restarts, all open rooms are lost. Players need to create new rooms.  
This is intentional for the skeleton — add Postgres persistence when needed.

## Environment variables
```
RABBITMQ_URL=amqp://bgf:changeme@rabbitmq:5672
JWT_SECRET=dev-secret-change-me
PORT=3002
```
