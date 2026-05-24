import { Injectable } from '@nestjs/common';

/**
 * Tracks (gameId → sockets) and (socketId → games) for fast filtered fan-out.
 * Per-instance only — gateways do not need to share this state because each
 * one independently knows which of its local sockets care about a given
 * gameId, and the event bus delivers messages to every gateway instance.
 */
@Injectable()
export class RoomRegistryService {
  private readonly bySocket = new Map<string, Set<string>>(); // socketId -> gameIds
  private readonly byGame = new Map<string, Map<string, string>>(); // gameId -> (socketId -> userId)

  attach(gameId: string, socketId: string, userId: string): void {
    if (!this.byGame.has(gameId)) this.byGame.set(gameId, new Map());
    this.byGame.get(gameId)!.set(socketId, userId);

    if (!this.bySocket.has(socketId)) this.bySocket.set(socketId, new Set());
    this.bySocket.get(socketId)!.add(gameId);
  }

  detach(gameId: string, socketId: string): void {
    this.byGame.get(gameId)?.delete(socketId);
    this.bySocket.get(socketId)?.delete(gameId);
  }

  removeSocket(socketId: string): void {
    const games = this.bySocket.get(socketId);
    if (!games) return;
    for (const gameId of games) this.byGame.get(gameId)?.delete(socketId);
    this.bySocket.delete(socketId);
  }

  socketsForGame(gameId: string): ReadonlyMap<string, string> {
    return this.byGame.get(gameId) ?? new Map();
  }
}
