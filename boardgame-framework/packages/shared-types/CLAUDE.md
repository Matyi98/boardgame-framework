# CLAUDE.md — packages/shared-types

## What this is
Pure TypeScript interfaces shared across service boundaries.  
No runtime code — only `interface`, `type`, and `enum` declarations.

## Rule
**Never add runtime logic or imports from Node.js/npm packages here.**  
If something needs to be shared, it goes here as a type — not as a utility function.

## File map
```
src/
  events/
    lobby-events.ts   LobbyEvent union (room-created, player-joined, game-starting, ...)
    game-events.ts    GameBusEvent (what the engine emits per action)
  commands/
    game-commands.ts  GameCommandMessage (what the gateway publishes per player action)
  http/
    auth.ts           AuthResponse, LoginRequest, RegisterRequest
    lobby.ts          RoomSummary, RoomDetail, CreateRoomRequest
    game.ts           GameSnapshot
```

## GameBusEvent shape
```ts
interface GameBusEvent {
  gameId: string;
  seq: number;       // monotonic per game, from GameEventEmitter
  type: string;      // 'game-started' | 'tile-claimed' | 'turn-ended' | 'round-ended' | 'game-ended' | 'error'
  payload: unknown;  // type-narrowed by consumers based on `type`
  at: number;        // unix ms timestamp
  privateTo?: string; // userId — if set, only that player's sockets receive it
}
```

## GameCommandMessage shape
```ts
interface GameCommandMessage {
  gameId: string;
  userId: string;    // from JWT sub
  type: string;      // 'claim-tile' | 'end-turn' | ...
  payload: unknown;
  clientSeq?: number;
  socketId: string;
}
```

## GameStartingEvent shape (in LobbyEvent union)
```ts
interface GameStartingEvent {
  type: 'game-starting';
  roomId: string;
  gameId: string;
  scenarioId: string;
  players: ReadonlyArray<{ id: string; displayName: string }>;
  at: number;
}
```

## Adding a new event type
1. Add the string literal to the `type` discriminator in the relevant union
2. Document the payload shape in a comment — payload is `unknown` at the bus level, narrowed by consumers
3. Update consumers (frontend `applyEvent`, gateway relay, engine `flushEvents`) as needed
