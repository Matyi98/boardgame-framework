import { Controller, Get, Param } from '@nestjs/common';
import type { GameSnapshot } from '@bgf/shared-types';
import { GameStoreService } from '../persistence/game-store.service.js';

/**
 * REST surface for the engine. The hot path is the bus — clients submit
 * commands via the realtime gateway and receive events via WebSocket. This
 * controller exists for snapshot fetches (e.g. after reconnect, get the
 * current state so the client can render without waiting for the next event).
 */
@Controller('games')
export class GamesController {
  constructor(private readonly store: GameStoreService) {}

  @Get(':id/snapshot')
  async snapshot(@Param('id') id: string): Promise<GameSnapshot> {
    const state = await this.store.load(id);
    return {
      gameId: id,
      scenarioId: (state as { scenarioId?: string })?.scenarioId ?? 'unknown',
      status: (state as { status?: GameSnapshot['status'] })?.status ?? 'lobby',
      lastEventSeq: 0, // TODO: track in store
      state,
    };
  }
}
