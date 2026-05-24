import type { GameMap } from '../map/game-map.js';
import type { PlayerManager } from '../players/player-manager.js';
import type { ResourcePool } from '../resources/resource-pool.js';
import type { Inventory } from '../resources/inventory.js';
import type { Deck } from '../cards/deck.js';
import type { Card } from '../cards/card.js';
import type { Hand } from '../cards/hand.js';
import type { Piece } from '../pieces/piece.js';
import type { RoundManager } from '../rounds/round-manager.js';
import type { RandomSource } from '../dice/random.js';
import type { ActionHistory } from '../actions/action-history.js';
import type { PlayerId } from '../players/player.js';

export type GamePhaseStatus = 'lobby' | 'setup' | 'playing' | 'ended';

/**
 * The complete, in-memory snapshot of a running game. The engine service
 * holds exactly one of these per active game and is the only writer.
 *
 * Anything that needs to survive a process restart must be reachable from
 * here so the persistence layer can serialize it.
 */
export interface GameState {
  /** Stable identifier for this game (UUID). */
  readonly gameId: string;
  /** Identifier of the variant being played (e.g. `'demo-v1'`). */
  readonly scenarioId: string;
  /** Lifecycle status. */
  status: GamePhaseStatus;

  readonly map: GameMap;
  readonly players: PlayerManager;
  /** Per-player inventories, keyed by player id. */
  readonly inventories: Map<PlayerId, Inventory>;
  /** Bank / shared resource pool. */
  readonly bank: ResourcePool;
  /** Decks of cards, keyed by deck id (e.g. `'development'`, `'event'`). */
  readonly decks: Map<string, Deck<Card>>;
  /** Per-player hands, keyed by deck id then player id. */
  readonly hands: Map<string, Map<PlayerId, Hand<Card>>>;
  /** All pieces currently in play, keyed by piece id. */
  readonly pieces: Map<string, Piece>;

  readonly rounds: RoundManager;
  readonly rng: RandomSource;
  readonly history: ActionHistory;

  /**
   * Free-form bag for variant-specific values (e.g. "robber position" for a
   * Catan-like, "card-of-the-round" for an event-driven game). Keep it small
   * and serializable.
   */
  readonly extras: Record<string, unknown>;
}
