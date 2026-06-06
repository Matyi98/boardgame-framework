# CLAUDE.md — packages/event-bus

## What this is
A thin wrapper around `amqplib` (RabbitMQ AMQP client) that provides typed publish/subscribe.  
Used by `lobby-service`, `game-engine`, and `realtime-gateway`.

## Key exports
```ts
// Publishing
class BusPublisher {
  publish<T>(exchange: string, routingKey: string, payload: T): void
}

// Consuming
class BusConsumer {
  subscribe<T>(opts: SubscribeOptions, handler: (msg: T) => Promise<void>): Promise<void>
}

// Constants
const Exchange = {
  LobbyEvents: 'lobby.events',
  GameCommands: 'game.commands',
  GameEvents:   'game.events',
}

// Routing key builders
const RoutingKey = {
  lobbyEvent:  (roomId, type)  => `lobby.${roomId}.${type}`,
  gameEvent:   (gameId, type)  => `game.${gameId}.${type}`,
  gameCommand: (gameId)        => `game.${gameId}.command`,
}
```

## SubscribeOptions
```ts
interface SubscribeOptions {
  exchange: string;
  routingKey: string;  // binding pattern, e.g. 'game.*.*'
  queue: string;       // queue name
  exclusive?: boolean; // true = queue deleted when consumer disconnects (gateway pattern)
}
```

## Queue strategies
- **Shared queue** (multiple consumers, one message delivered to one): lobby-service → engine game-starting, gateway → engine commands
- **Exclusive queue** per instance (all consumers see all messages): engine → all gateway instances for fan-out

## Important
Messages are auto-acknowledged after the handler resolves without throwing.  
If the handler throws, the message is nacked and re-queued (once).

## Environment variable
```
RABBITMQ_URL=amqp://bgf:changeme@rabbitmq:5672
```
