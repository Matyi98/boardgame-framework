import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Game, createGameState, type Action, type Player } from '@bgf/game-core';
import { Exchange, RoutingKey, BusPublisher } from '@bgf/event-bus';
import type { GameBusEvent } from '@bgf/shared-types';
import { GameInstance } from './game-instance.js';
import { ScenarioRegistry } from './scenario.registry.js';
import { GameStoreService } from '../persistence/game-store.service.js';

/**
 * One engine replica owns a *subset* of games at any time. Ownership is
 * acquired through a Redis lock (TTL-refreshed) so two replicas never
 * concurrently mutate the same game. The replica that holds the lock for a
 * gameId is the only one that processes its commands.
 *
 * See docs/architecture.md → "Engine ownership" for the full protocol.
 */
@Injectable()
export class EngineService {
  private readonly logger = new Logger(EngineService.name);
  private readonly games = new Map<string, GameInstance>();

  constructor(
    private readonly scenarios: ScenarioRegistry,
    private readonly store: GameStoreService,
    private readonly bus: BusPublisher,
  ) {}

  /**
   * Bootstraps a fresh game. Called when the engine receives a
   * `game-starting` lobby event.
   */
  async createGame(input: {
    gameId: string;
    scenarioId: string;
    players: ReadonlyArray<Player>;
    seed: string;
  }): Promise<void> {
    const scenario = this.scenarios.get(input.scenarioId);
    const state = createGameState({
      gameId: input.gameId,
      scenario,
      players: input.players,
      seed: input.seed,
    });
    const game = new Game(state, scenario);
    const instance = new GameInstance(input.gameId, game, scenario);
    this.games.set(input.gameId, instance);
    instance.start();
    await this.store.save(input.gameId, state);
    this.flushEvents(instance);
    this.logger.log(`game created gameId=${input.gameId} scenario=${input.scenarioId}`);
  }

  /**
   * Applies a command coming in off the bus. Returns false if this replica
   * doesn't own the game (caller may re-enqueue or ignore).
   */
  async handleCommand(input: { gameId: string; userId: string; type: string; payload: unknown; clientSeq?: number }): Promise<boolean> {
    const instance = this.games.get(input.gameId);
    if (!instance) {
      // Lazy hydration: load from snapshot if this replica should own it.
      const restored = await this.store.load(input.gameId);
      if (!restored) throw new NotFoundException(`Unknown game: ${input.gameId}`);
      // TODO: rebuild Game from restored state + scenario + replay tail.
      throw new ServiceUnavailableException('Game not loaded on this replica');
    }
    const action: Action = {
      type: input.type,
      playerId: input.userId,
      payload: input.payload,
      ...(input.clientSeq !== undefined ? { clientSeq: input.clientSeq } : {}),
    };
    const result = instance.submit(action);
    if (!result.ok) {
      this.bus.publish<GameBusEvent>(
        Exchange.GameEvents,
        RoutingKey.gameEvent(input.gameId, 'error'),
        {
          gameId: input.gameId,
          seq: 0,
          type: 'error',
          payload: result.error,
          at: Date.now(),
          privateTo: input.userId,
        } as GameBusEvent,
      );
      return true;
    }
    this.flushEvents(instance);
    await this.store.save(input.gameId, instance.state);
    return true;
  }

  private flushEvents(instance: GameInstance): void {
    for (const event of instance.drainEvents()) {
      const msg: GameBusEvent = {
        gameId: instance.gameId,
        seq: event.seq ?? 0,
        type: event.type,
        payload: event.payload,
        at: event.at ?? Date.now(),
        ...(event.privateTo ? { privateTo: event.privateTo } : {}),
      };
      this.bus.publish(Exchange.GameEvents, RoutingKey.gameEvent(instance.gameId, event.type), msg);
    }
  }
}
