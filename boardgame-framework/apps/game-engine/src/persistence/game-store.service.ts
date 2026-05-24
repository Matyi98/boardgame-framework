import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import type { GameState } from '@bgf/game-core';
import { REDIS } from './redis.module.js';

/**
 * Hot game state in Redis as JSON. Postgres holds the cold archive (games
 * completed, snapshots for replay) via the snapshot service.
 *
 * Locking: `engine:lock:<gameId>` is a SET NX EX 30 string holding the
 * replica id. Replicas refresh their locks every 10s; on graceful shutdown
 * they release. If a replica dies, the lock expires and another picks it up
 * on the next command.
 *
 * Note: GameState includes class instances (RoundManager, ResourcePool, …).
 * A real serializer must reify these on load — this stub does the JSON
 * round-trip and leaves the reification as a TODO.
 */
@Injectable()
export class GameStoreService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async save(gameId: string, state: GameState): Promise<void> {
    await this.redis.set(this.key(gameId), this.serialize(state));
  }

  async load(gameId: string): Promise<unknown | null> {
    const raw = await this.redis.get(this.key(gameId));
    return raw ? JSON.parse(raw) : null;
  }

  async delete(gameId: string): Promise<void> {
    await this.redis.del(this.key(gameId));
  }

  private key(gameId: string): string {
    return `engine:state:${gameId}`;
  }

  private serialize(state: GameState): string {
    // Naive — JSON.stringify won't capture Maps or class instances. The first
    // PR implementing a scenario will need a structured serializer. Keeping
    // the API symmetric so callers don't change.
    return JSON.stringify(state, (_, value) => {
      if (value instanceof Map) return { __map: true, entries: [...value.entries()] };
      return value;
    });
  }
}
