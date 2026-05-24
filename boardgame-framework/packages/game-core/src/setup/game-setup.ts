import type { Scenario } from './scenario.js';
import type { Player } from '../players/player.js';
import { PlayerManager } from '../players/player-manager.js';
import { ResourcePool } from '../resources/resource-pool.js';
import { Inventory } from '../resources/inventory.js';
import { SeededRandom } from '../dice/random.js';
import { RoundManager } from '../rounds/round-manager.js';
import { ActionHistory } from '../actions/action-history.js';
import type { GameState } from '../state/game-state.js';

export interface GameSetupOptions {
  readonly gameId: string;
  readonly scenario: Scenario;
  readonly players: ReadonlyArray<Player>;
  readonly seed: string;
}

/**
 * Pure factory that turns a Scenario + a roster of Players into a fresh
 * GameState. No side effects, no I/O — the engine app calls this and then
 * persists the result.
 */
export function createGameState(opts: GameSetupOptions): GameState {
  const { gameId, scenario, players, seed } = opts;

  if (players.length < scenario.minPlayers || players.length > scenario.maxPlayers) {
    throw new Error(
      `Scenario ${scenario.id} requires ${scenario.minPlayers}–${scenario.maxPlayers} players, got ${players.length}`,
    );
  }

  const rng = new SeededRandom(seed);
  const playerManager = new PlayerManager(players);
  const map = scenario.buildMap(players.length, seed);

  const inventories = new Map(players.map((p) => [p.id, new Inventory()]));

  return {
    gameId,
    scenarioId: scenario.id,
    status: 'setup',
    map,
    players: playerManager,
    inventories,
    bank: new ResourcePool(),
    decks: new Map(),
    hands: new Map(),
    pieces: new Map(),
    rounds: new RoundManager(players, scenario.turnOrder, scenario.phases, scenario.initialPhaseId),
    rng,
    history: new ActionHistory(),
    extras: {},
  };
}
