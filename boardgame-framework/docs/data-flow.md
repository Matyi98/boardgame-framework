# Data Flow Reference

> Precise trace of how a player action travels from browser click to all players' screens, with file references.

---

## 1. Player clicks a tile → `claim-tile` action

```
Browser (Board.tsx:onClick)
  → useGame.send('claim-tile', { tileId })          [web/src/store/game.ts]
  → socket.emit('game-command', { gameId, type, payload })  [web/src/lib/socket.ts]
```

---

## 2. WebSocket gateway receives and publishes

```
RealtimeGateway.command()                           [realtime-gateway/src/realtime/realtime.gateway.ts]
  Extracts userId from JWT in socket.data
  → BusPublisher.publish(Exchange.GameCommands, 'game.<gameId>.command', msg)
```

`msg` is a `GameCommandMessage` from `@bgf/shared-types`.

---

## 3. Game engine processes the command

```
GameRunnerService (consumer of 'game.commands')     [game-engine/src/engine/game-runner.service.ts]
  → EngineService.handleCommand(msg)                [game-engine/src/engine/engine.service.ts]
    → GameInstance.submit(action)                   [game-engine/src/engine/game-instance.ts]
      → Game.submit(action)                         [packages/game-core/src/game.ts]
        1. ActionValidatorRegistry.validate()       → claimTileValidator
        2. ActionExecutorRegistry.execute()         → claimTileExecutor (mutates state, returns events)
        3. RuleEngine.process() (follow-up rules)
        4. VictoryConditionRegistry.evaluate()
        5. Events emitted via GameEventEmitter
```

`GameInstance` listens to all events via `game.events.onAny()` and buffers them.

---

## 4. Executor mutates state and emits events

Inside `claimTileExecutor` (`packages/game-core/src/scenarios/demo/actions.ts`):

1. Looks up tile from `state.map.tileById(tileId)`
2. Rolls dice via `state.rng.intInRange(1, 6)` (seeded — reproducible)
3. Adds piece to `state.pieces` via `makeUnit()`
4. Updates `state.inventories.get(playerId).add('vp', vp)`
5. Calls `state.rounds.endTurn(state.players.all(), 'turn')` — advances active player
6. Returns `[tile-claimed, turn-ended, (round-ended?)]` events

---

## 5. Engine flushes events to the bus

```
EngineService.flushEvents(instance)
  → instance.drainEvents()                          (clears the buffer)
  → BusPublisher.publish(Exchange.GameEvents, 'game.<gameId>.<type>', event)
                                                    (one publish per event)
  → store.save(gameId, instance.state)              (Redis snapshot)
  → store.saveView(gameId, buildView(...))          (view snapshot for /init)
```

---

## 6. Events fan out to all gateways

```
EventRelayService (all gateway instances)           [realtime-gateway/src/realtime/event-relay.service.ts]
  Consumes from exclusive per-instance queue bound to 'game.*.*'
  → dispatch(event):
      if event.privateTo:  emit only to that player's socket(s)
      else:                server.to('game:<gameId>').emit('game-event', event)
```

---

## 7. Frontend applies each event

```
useGame store (game-event socket listener)          [web/src/store/game.ts]
  → applyEvent(currentView, event) → newView
      'game-started':  set view = event.payload (full snapshot)
      'tile-claimed':  update tile.claimedBy + player VP
      'turn-ended':    update currentActivePlayer + player.isActive flags
      'round-ended':   (no view change — round number comes from view.round via /init)
      'game-ended':    set view.status = 'ended', view.winner
  → set({ view: newView, events: [...events, event] })
```

React re-renders: `Board.tsx` recomputes claimable tiles, `PlayerList.tsx` updates VP bars, `GamePage.tsx` updates turn indicator and event log.

---

## Page refresh / late join

When a player navigates to `/game/:gameId`:

```
GamePage.tsx useEffect
  → useGame.connect(gameId)    subscribe to WS room
  → useGame.fetchInit(gameId)  GET /api/games/:id/init
      → GamesController.init() → store.loadView(gameId)
      → Returns current DemoView snapshot (all tile claims, VPs, active player)
      → store sets view = snapshot (if WS hasn't already set it)
```

This means a page refresh never loses game state — the `/init` endpoint always returns the current snapshot.

---

## RabbitMQ exchange / routing key reference

| Exchange | Routing key pattern | Direction |
|----------|---------------------|-----------|
| `lobby.events` | `lobby.<roomId>.<eventType>` | lobby-service → gateway |
| `game.commands` | `game.<gameId>.command` | gateway → engine |
| `game.events` | `game.<gameId>.<eventType>` | engine → gateway |

Exchange and routing key constants: `packages/event-bus/src/exchange.ts`, `routing-key.ts`

---

## State ownership

| Data | Owner | Storage |
|------|-------|---------|
| Users / passwords | auth-service | Postgres `users` table |
| Room list / members | lobby-service | In-memory `Map<roomId, RoomEntity>` (reset on restart) |
| In-flight game state | game-engine | In-memory `Map<gameId, GameInstance>` + Redis snapshot |
| Current view snapshot | game-engine | Redis `engine:view:<gameId>` |
| Client-side view | web (Zustand) | Browser memory + zustand-persist for auth token |
