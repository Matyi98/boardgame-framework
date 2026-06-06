import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Game, createGameState, type Action, type GameState, type Player } from '@bgf/game-core';
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

    // Persist a full renderable view snapshot so clients navigating to the
    // game page after the bus event fires can still bootstrap their UI.
    const view = this.buildView(state, input.players as Player[], null);
    await this.store.saveView(input.gameId, view);

    this.bus.publish<GameBusEvent>(
      Exchange.GameEvents,
      RoutingKey.gameEvent(input.gameId, 'game-started'),
      {
        gameId: input.gameId,
        seq: 0,
        type: 'game-started',
        payload: view,
        at: Date.now(),
      },
    );

    this.logger.log(`game created gameId=${input.gameId} scenario=${input.scenarioId}`);
  }

  /**
   * Applies a command coming in off the bus. Returns false if this replica
   * doesn't own the game (caller may re-enqueue or ignore).
   */
  async handleCommand(input: {
    gameId: string;
    userId: string;
    type: string;
    payload: unknown;
    clientSeq?: number;
  }): Promise<boolean> {
    const instance = this.games.get(input.gameId);
    if (!instance) {
      const restored = await this.store.load(input.gameId);
      if (!restored) throw new NotFoundException(`Unknown game: ${input.gameId}`);
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

    // Detect game-over from submitted result events
    const gameEndedEvent = (result as { ok: true; events?: ReadonlyArray<{ type: string; payload: unknown }> }).events?.find(
      (e) => e.type === 'game-ended',
    );
    const victory = gameEndedEvent?.payload as { winner: string | null; reason: string } | undefined;

    // Update the view snapshot so page refreshes recover current state
    const players = [...instance.state.players.all()];
    const view = this.buildView(instance.state, players, victory ?? null);
    await this.store.saveView(input.gameId, view);

    if (gameEndedEvent) {
      instance.dispose();
      this.games.delete(input.gameId);
      this.logger.log(`game ended gameId=${input.gameId} winner=${victory?.winner ?? 'draw'}`);
    }

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
        ...(event.playerId  ? { playerId:  event.playerId  } : {}),
        ...(event.privateTo ? { privateTo: event.privateTo } : {}),
      };
      this.bus.publish(Exchange.GameEvents, RoutingKey.gameEvent(instance.gameId, event.type), msg);
    }
  }

  /**
   * Builds a serialisable view snapshot that matches the frontend DemoView.
   * Updated after every mutation so the /init REST endpoint always returns
   * current state (tile claims, VPs, active player, game over info).
   */
  private buildView(
    state: GameState,
    players: Player[],
    victory: { winner: string | null; reason: string } | null,
  ): Record<string, unknown> {
    // Map tileId → owner from pieces on tiles
    const claimMap = new Map<string, string>();
    for (const [, piece] of state.pieces) {
      if (piece.location.kind === 'tile') {
        const tileLocation = piece.location as { kind: 'tile'; tileId: string };
        claimMap.set(tileLocation.tileId, piece.owner);
      }
    }

    const activePlayer = state.rounds.turn().activePlayer;

    return {
      status: state.status as string,
      tiles: [...state.map.tiles()].map((t) => ({
        id: t.id,
        q: t.coord.q,
        r: t.coord.r,
        terrain: t.terrain,
        claimedBy: claimMap.get(t.id) ?? null,
      })),
      players: players.map((p) => ({
        id: p.id,
        displayName: p.displayName,
        color: p.color,
        seat: p.seat,
        vp:    state.inventories.get(p.id)?.get('vp')    ?? 0,
        wood:  state.inventories.get(p.id)?.get('wood')  ?? 0,
        stone: state.inventories.get(p.id)?.get('stone') ?? 0,
        isActive: p.id === activePlayer,
      })),
      currentActivePlayer: activePlayer,
      winner: victory?.winner ?? null,
      winReason: victory?.reason ?? null,
      homeTiles: (state.extras['homeTiles'] as Record<string, string>) ?? {},
      fortifications: (state.extras['fortifications'] as Record<string, string>) ?? {},
      tradeOffers: (state.extras['tradeOffers'] as unknown[]) ?? [],
      round: state.rounds.round(),
    };
  }
}
