import { Injectable } from '@nestjs/common';

/**
 * Periodically snapshots GameState to Postgres so finished games can be
 * archived and unfinished games can be reconstructed after a full cluster
 * restart. Hot state lives in Redis (see GameStoreService).
 *
 * TODO: wire Prisma + a `game_snapshots(game_id, seq, state_json, created_at)`
 * table, and a `game_actions(game_id, seq, action_json, events_json, at)`
 * table for the replay tail.
 */
@Injectable()
export class SnapshotService {
  async snapshot(_gameId: string): Promise<void> {
    // no-op for now; the engine still saves to Redis on every command
  }

  async loadLatest(_gameId: string): Promise<unknown | null> {
    return null;
  }
}
