import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Exchange, RoutingKey, BusPublisher } from '@bgf/event-bus';
import type { GameCommandMessage } from '@bgf/shared-types';
import { RoomRegistryService } from './room-registry.service.js';

interface AuthedSocket extends Socket {
  data: { userId: string; username: string } & Socket['data'];
}

/**
 * Socket.io gateway exposed at `/ws`. Each connection authenticates with the
 * JWT minted by auth-service. Clients join rooms via `subscribe-game` and
 * submit commands via `game-command`; the gateway translates each command
 * into a `game.commands` bus message and the engine handles the rest.
 *
 * Horizontal scaling: every gateway instance subscribes to the `game.events`
 * exchange with an *exclusive* queue so all gateways receive every event,
 * and each forwards only to its locally-connected sockets. No Redis adapter
 * needed for fan-out — RabbitMQ already does it.
 */
@WebSocketGateway({ path: '/ws', cors: { origin: true, credentials: true } })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer() server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly rooms: RoomRegistryService,
    private readonly bus: BusPublisher,
  ) {}

  handleConnection(client: AuthedSocket): void {
    const token = client.handshake.auth?.token ?? client.handshake.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      client.emit('error', { code: 'no-token', message: 'Missing token' });
      client.disconnect();
      return;
    }
    try {
      const secret = this.config.get<string>('JWT_SECRET') ?? 'dev-secret-change-me';
      const payload = this.jwt.verify<{ sub: string; username: string }>(token, { secret });
      client.data.userId = payload.sub;
      client.data.username = payload.username;
      this.logger.log(`socket connected userId=${payload.sub} sid=${client.id}`);
    } catch {
      client.emit('error', { code: 'bad-token', message: 'Invalid token' });
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthedSocket): void {
    this.rooms.removeSocket(client.id);
    this.logger.log(`socket disconnected sid=${client.id}`);
  }

  @SubscribeMessage('subscribe-game')
  subscribeGame(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { gameId: string },
  ): { ok: boolean } {
    this.rooms.attach(body.gameId, client.id, client.data.userId);
    void client.join(`game:${body.gameId}`);
    return { ok: true };
  }

  @SubscribeMessage('unsubscribe-game')
  unsubscribeGame(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { gameId: string },
  ): { ok: boolean } {
    this.rooms.detach(body.gameId, client.id);
    void client.leave(`game:${body.gameId}`);
    return { ok: true };
  }

  @SubscribeMessage('game-command')
  command(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { gameId: string; type: string; payload: unknown; clientSeq?: number },
  ): { ok: boolean } {
    const msg: GameCommandMessage = {
      gameId: body.gameId,
      userId: client.data.userId,
      type: body.type,
      payload: body.payload,
      clientSeq: body.clientSeq,
      socketId: client.id,
    };
    this.bus.publish(Exchange.GameCommands, RoutingKey.gameCommand(body.gameId), msg);
    return { ok: true };
  }
}
