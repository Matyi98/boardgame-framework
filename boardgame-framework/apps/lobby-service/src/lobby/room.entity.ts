import type { RoomDetail, RoomStatus, RoomSummary } from '@bgf/shared-types';

interface RoomMember {
  userId: string;
  ready: boolean;
}

export interface RoomEntityInit {
  roomId: string;
  name: string;
  scenarioId: string;
  hostId: string;
  maxPlayers: number;
}

export class RoomEntity {
  readonly roomId: string;
  readonly name: string;
  readonly scenarioId: string;
  readonly hostId: string;
  readonly maxPlayers: number;
  readonly createdAt = new Date();
  private status: RoomStatus = 'open';
  private gameId: string | undefined;
  private readonly members = new Map<string, RoomMember>();

  constructor(init: RoomEntityInit) {
    this.roomId = init.roomId;
    this.name = init.name;
    this.scenarioId = init.scenarioId;
    this.hostId = init.hostId;
    this.maxPlayers = init.maxPlayers;
  }

  get isFull(): boolean {
    return this.members.size >= this.maxPlayers;
  }

  get allReady(): boolean {
    return this.members.size > 1 && [...this.members.values()].every((m) => m.ready);
  }

  addPlayer(userId: string): void {
    if (!this.members.has(userId)) this.members.set(userId, { userId, ready: false });
  }

  removePlayer(userId: string): void {
    this.members.delete(userId);
  }

  setReady(userId: string, ready: boolean): void {
    const m = this.members.get(userId);
    if (!m) throw new Error(`Player ${userId} not in room`);
    m.ready = ready;
  }

  markStarting(gameId: string): void {
    this.status = 'starting';
    this.gameId = gameId;
  }

  toSummary(): RoomSummary {
    return {
      roomId: this.roomId,
      name: this.name,
      scenarioId: this.scenarioId,
      hostId: this.hostId,
      status: this.status,
      playerCount: this.members.size,
      maxPlayers: this.maxPlayers,
      createdAt: this.createdAt.toISOString(),
    };
  }

  toDetail(): RoomDetail {
    return {
      ...this.toSummary(),
      players: [...this.members.values()].map((m) => ({ userId: m.userId, username: m.userId, ready: m.ready })),
      ...(this.gameId ? { gameId: this.gameId } : {}),
    };
  }
}
