import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Exchange, RoutingKey, BusPublisher } from '@bgf/event-bus';
import type {
  CreateRoomRequest,
  RoomDetail,
  RoomSummary,
  LobbyEvent,
} from '@bgf/shared-types';
import { RoomEntity } from './room.entity.js';

/**
 * In-memory rooms with bus-driven fan-out. Production would persist rooms to
 * Postgres and use Redis pub/sub for cross-instance state, but the event bus
 * surface is the same.
 */
@Injectable()
export class LobbyService {
  private readonly rooms = new Map<string, RoomEntity>();

  constructor(private readonly bus: BusPublisher) {}

  async listRooms(): Promise<ReadonlyArray<RoomSummary>> {
    return [...this.rooms.values()].map((r) => r.toSummary());
  }

  async getRoom(roomId: string): Promise<RoomDetail> {
    const room = this.rooms.get(roomId);
    if (!room) throw new NotFoundException('Room not found');
    return room.toDetail();
  }

  async createRoom(userId: string, req: CreateRoomRequest): Promise<RoomDetail> {
    const room = new RoomEntity({
      roomId: randomUUID(),
      name: req.name,
      scenarioId: req.scenarioId,
      hostId: userId,
      maxPlayers: req.maxPlayers,
    });
    room.addPlayer(userId);
    this.rooms.set(room.roomId, room);
    this.publish(room.roomId, { type: 'room-created', roomId: room.roomId, hostId: userId, at: Date.now() });
    return room.toDetail();
  }

  async joinRoom(userId: string, roomId: string): Promise<RoomDetail> {
    const room = this.rooms.get(roomId);
    if (!room) throw new NotFoundException('Room not found');
    if (room.isFull) throw new ForbiddenException('Room is full');
    room.addPlayer(userId);
    this.publish(roomId, { type: 'player-joined', roomId, userId, at: Date.now() });
    return room.toDetail();
  }

  async setReady(userId: string, roomId: string, ready: boolean): Promise<RoomDetail> {
    const room = this.rooms.get(roomId);
    if (!room) throw new NotFoundException('Room not found');
    room.setReady(userId, ready);
    this.publish(roomId, { type: 'player-ready', roomId, userId, ready, at: Date.now() });
    return room.toDetail();
  }

  async startGame(userId: string, roomId: string): Promise<RoomDetail> {
    const room = this.rooms.get(roomId);
    if (!room) throw new NotFoundException('Room not found');
    if (room.hostId !== userId) throw new ForbiddenException('Only the host can start the game');
    if (!room.allReady) throw new ForbiddenException('Not all players are ready');

    // The engine listens for `game-starting`, creates a GameState, and binds
    // the room to the resulting gameId.
    const gameId = randomUUID();
    room.markStarting(gameId);
    this.publish(roomId, { type: 'game-starting', roomId, gameId, at: Date.now() });
    return room.toDetail();
  }

  private publish(roomId: string, event: LobbyEvent): void {
    this.bus.publish(Exchange.LobbyEvents, RoutingKey.lobbyEvent(roomId, event.type), event);
  }
}
