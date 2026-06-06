import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { BusConsumer, Exchange } from '@bgf/event-bus';
import type { GameCommandMessage, GameStartingEvent } from '@bgf/shared-types';
import type { Player } from '@bgf/game-core';
import { EngineService } from './engine.service.js';

const PLAYER_COLORS = ['red', 'blue', 'green', 'yellow', 'orange', 'purple'] as const;

/**
 * Bridges the bus to the engine. Two subscriptions:
 *
 *   1. `lobby.events` (game-starting only) — shared queue across all engine
 *      replicas. Whichever replica picks it up will own the new game.
 *   2. `game.commands` — also a shared queue so commands are distributed
 *      across replicas. The replica owning the game processes the command;
 *      others reject and re-enqueue (handled inside EngineService).
 */
@Injectable()
export class GameRunnerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(GameRunnerService.name);

  constructor(
    private readonly consumer: BusConsumer,
    private readonly engine: EngineService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.consumer.subscribe<GameStartingEvent>(
      {
        exchange: Exchange.LobbyEvents,
        routingKey: 'lobby.*.game-starting',
        queue: 'engine-game-starting',
      },
      async (msg) => {
        this.logger.log(`game-starting received roomId=${msg.roomId} gameId=${msg.gameId} scenario=${msg.scenarioId}`);
        const players: Player[] = msg.players.map((p, i) => ({
          id: p.id,
          displayName: p.displayName,
          color: PLAYER_COLORS[i % PLAYER_COLORS.length]!,
          seat: i,
        }));
        await this.engine.createGame({
          gameId: msg.gameId,
          scenarioId: msg.scenarioId,
          players,
          seed: msg.gameId,
        });
      },
    );

    await this.consumer.subscribe<GameCommandMessage>(
      {
        exchange: Exchange.GameCommands,
        routingKey: 'game.*.command',
        queue: 'engine-commands',
      },
      async (msg) => {
        await this.engine.handleCommand(msg);
      },
    );

    this.logger.log('subscribed to lobby.events and game.commands');
  }
}
