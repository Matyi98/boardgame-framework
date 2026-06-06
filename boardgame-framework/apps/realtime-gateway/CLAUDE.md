# CLAUDE.md — apps/realtime-gateway

## What this service does
The WebSocket bridge. It:
- Accepts Socket.io connections at `/ws`, validates JWT on handshake
- Lets clients **subscribe** to a game room (`subscribe-game` event)
- Forwards client **commands** to RabbitMQ (`game-command` → `game.commands` exchange)
- Fans out **engine events** from RabbitMQ back to the right Socket.io rooms

This service holds **no game state** — it's a pure routing layer.

## Key files
| File | Role |
|------|------|
| `src/realtime/realtime.gateway.ts` | Socket.io gateway — handles `subscribe-game`, `unsubscribe-game`, `game-command` |
| `src/realtime/event-relay.service.ts` | Consumes `game.events.*` from RabbitMQ, dispatches to rooms |
| `src/realtime/room-registry.service.ts` | Maps `gameId → Set<{socketId, userId}>` for private-event routing |

## Socket.io events (client ↔ gateway)
| Direction | Event | Payload |
|-----------|-------|---------|
| client → server | `subscribe-game` | `{ gameId }` |
| client → server | `unsubscribe-game` | `{ gameId }` |
| client → server | `game-command` | `{ gameId, type, payload, clientSeq? }` |
| server → client | `game-event` | `GameBusEvent` (from `@bgf/shared-types`) |
| server → client | `error` | `{ code, message }` |

## Auth
JWT is extracted from `socket.handshake.auth.token` (or `Authorization` header).  
Verified with `JwtService.verify()` against `JWT_SECRET` env var.  
`socket.data.userId` and `socket.data.username` are set on the socket for later use.

## Private events
If a `GameBusEvent` has a `privateTo: userId` field, it's routed only to that player's sockets  
(via `RoomRegistryService.socketsForGame(gameId)` lookup).

## RabbitMQ subscription
- **Exchange**: `game.events` / routing key `game.*.*` / queue `gateway-events-<uuid>` (exclusive per instance)
- This gives pub/sub semantics: every gateway replica receives every game event.

## Scaling
Each replica subscribes with an **exclusive** queue so all replicas get all events.  
Each replica forwards only to its own connected sockets.  
No Redis adapter needed — RabbitMQ provides the fan-out.

## Environment variables
```
RABBITMQ_URL=amqp://bgf:changeme@rabbitmq:5672
JWT_SECRET=dev-secret-change-me
PORT=3003
```
