import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { BusConsumer, Exchange } from '@bgf/event-bus';
import type { GameCommandMessage, GameStartingEvent } from '@bgf/shared-types';
import { EngineService } from './engine.service.js';

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
export class GameRunnerService implements OnModuleInit {
  private readonly logger = new Logger(GameRunnerService.name);

  constructor(
    private readonly consumer: BusConsumer,
    private readonly engine: EngineService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.consumer.subscribe<GameStartingEvent>(
      {
        exchange: Exchange.LobbyEvents,
        routingKey: 'lobby.*.game-starting',
        queue: 'engine-game-starting',
      },
      async (msg) => {
        this.logger.log(`game-starting received roomId=${msg.roomId} gameId=${msg.gameId}`);
        // TODO: hydrate the player roster from the room (lobby-service exposes
        // it via REST or via a separate bus message). For now, the engine
        // creates an empty roster — the real wiring is left as an exercise
        // for whoever implements the first scenario.
        // await this.engine.createGame({ gameId: msg.gameId, scenarioId: ???, players: [], seed: msg.gameId });
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
