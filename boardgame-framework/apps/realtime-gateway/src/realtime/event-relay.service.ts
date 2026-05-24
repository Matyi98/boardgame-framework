import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { BusConsumer, Exchange } from '@bgf/event-bus';
import type { GameBusEvent } from '@bgf/shared-types';
import { RealtimeGateway } from './realtime.gateway.js';
import { RoomRegistryService } from './room-registry.service.js';

/**
 * Pulls events off `game.events` and pushes them into Socket.io rooms.
 *
 * Queue strategy: every gateway replica creates its own exclusive queue
 * (`gateway-events-<uuid>`) bound to `game.*.*`. This gives us pub/sub
 * semantics — every gateway sees every event, then filters locally to
 * sockets actually subscribed to that game.
 */
@Injectable()
export class EventRelayService implements OnModuleInit {
  private readonly logger = new Logger(EventRelayService.name);

  constructor(
    private readonly consumer: BusConsumer,
    private readonly gateway: RealtimeGateway,
    private readonly rooms: RoomRegistryService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.consumer.subscribe<GameBusEvent>(
      {
        exchange: Exchange.GameEvents,
        routingKey: 'game.*.*',
        queue: `gateway-events-${randomUUID()}`,
        exclusive: true,
      },
      (msg) => this.dispatch(msg),
    );
    this.logger.log('subscribed to game.events');
  }

  private dispatch(event: GameBusEvent): void {
    const room = `game:${event.gameId}`;
    if (event.privateTo) {
      // Send only to the matching player's sockets.
      const sockets = this.rooms.socketsForGame(event.gameId);
      for (const [sid, uid] of sockets) {
        if (uid === event.privateTo) {
          this.gateway.server.to(sid).emit('game-event', event);
        }
      }
    } else {
      this.gateway.server.to(room).emit('game-event', event);
    }
  }
}
