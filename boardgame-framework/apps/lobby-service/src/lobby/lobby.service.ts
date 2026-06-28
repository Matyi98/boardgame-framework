import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Exchange, RoutingKey, BusPublisher } from '@bgf/event-bus';
import type {
  CreateRoomRequest,
  RoomDetail,
  RoomSummary,
  LobbyEvent,
} from '@bgf/shared-types';
import { RoomEntity } from './room.entity.js';

const ROOM_TTL_MS = 30 * 60 * 1000; // 30 minutes for rooms with 2+ players
const SOLO_ROOM_TTL_MS = 3 * 60 * 1000; // 3 minutes for host-only rooms
const CLEANUP_INTERVAL_MS = 60 * 1000; // every 1 minute

@Injectable()
export class LobbyService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(LobbyService.name);
  private readonly rooms = new Map<string, RoomEntity>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly bus: BusPublisher) {}

  onModuleInit(): void {
    this.cleanupTimer = setInterval(() => this.purgeAbandonedRooms(), CLEANUP_INTERVAL_MS);
  }

  onApplicationShutdown(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  async listRooms(): Promise<ReadonlyArray<RoomSummary>> {
    return [...this.rooms.values()].map((r) => r.toSummary());
  }

  async getRoom(roomId: string): Promise<RoomDetail> {
    const room = this.rooms.get(roomId);
    if (!room) throw new NotFoundException('Room not found');
    return room.toDetail();
  }

  async createRoom(userId: string, displayName: string, req: CreateRoomRequest): Promise<RoomDetail> {
    const room = new RoomEntity({
      roomId: randomUUID(),
      name: req.name,
      scenarioId: req.scenarioId,
      hostId: userId,
      maxPlayers: req.maxPlayers,
    });
    room.addPlayer(userId, displayName);
    this.rooms.set(room.roomId, room);
    this.publish(room.roomId, { type: 'room-created', roomId: room.roomId, hostId: userId, at: Date.now() });
    return room.toDetail();
  }

  async joinRoom(userId: string, displayName: string, roomId: string): Promise<RoomDetail> {
    const room = this.rooms.get(roomId);
    if (!room) throw new NotFoundException('Room not found');
    if (room.status !== 'open') throw new ForbiddenException('Room is no longer accepting players');
    if (room.isFull) throw new ForbiddenException('Room is full');
    room.addPlayer(userId, displayName);
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
    if (room.playerCount < 2) throw new ForbiddenException('Need at least 2 players to start');
    if (!room.allReady) throw new ForbiddenException('All players must be ready before starting');

    const gameId = randomUUID();
    room.markStarting(gameId);
    this.publish(roomId, {
      type: 'game-starting',
      roomId,
      gameId,
      scenarioId: room.scenarioId,
      players: room.players(),
      at: Date.now(),
    });
    return room.toDetail();
  }

  async leaveRoom(userId: string, roomId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) throw new NotFoundException('Room not found');
    if (room.hostId === userId) throw new ForbiddenException('Host cannot leave — close the room instead');
    room.removePlayer(userId);
    this.publish(roomId, { type: 'player-left', roomId, userId, at: Date.now() });
    // Auto-close if only the host remains — no point keeping an empty room
    if (room.playerCount <= 1) {
      this.rooms.delete(roomId);
      this.publish(roomId, { type: 'room-closed', roomId, reason: 'host-closed', at: Date.now() });
      this.logger.log(`room auto-closed (all guests left) roomId=${roomId}`);
    }
  }

  async closeRoom(userId: string, roomId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) throw new NotFoundException('Room not found');
    if (room.hostId !== userId) throw new ForbiddenException('Only the host can close the room');
    this.rooms.delete(roomId);
    this.publish(roomId, { type: 'room-closed', roomId, reason: 'host-closed', at: Date.now() });
    this.logger.log(`room closed by host roomId=${roomId}`);
  }

  private purgeAbandonedRooms(): void {
    const cutoff = Date.now() - ROOM_TTL_MS;
    const soloCutoff = Date.now() - SOLO_ROOM_TTL_MS;
    let purged = 0;
    for (const [id, room] of this.rooms) {
      if (room.status !== 'open') continue;
      const isSolo = room.playerCount <= 1;
      const expired = isSolo
        ? room.createdAt.getTime() < soloCutoff
        : room.createdAt.getTime() < cutoff;
      if (expired) {
        this.rooms.delete(id);
        this.publish(id, { type: 'room-closed', roomId: id, reason: 'ttl-expired', at: Date.now() });
        purged++;
      }
    }
    if (purged > 0) this.logger.log(`purged ${purged} abandoned room(s)`);
  }

  private publish(roomId: string, event: LobbyEvent): void {
    this.bus.publish(Exchange.LobbyEvents, RoutingKey.lobbyEvent(roomId, event.type), event);
  }
}
