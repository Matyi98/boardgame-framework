import type { GameMap } from '../map/game-map.js';
import type { TerrainRegistry } from '../map/terrain.js';
import type { ResourceRegistry } from '../resources/resource-type.js';
import type { PieceRegistry } from '../pieces/piece-registry.js';
import type { Phase } from '../rounds/phase.js';
import type { TurnOrder } from '../rounds/turn-order.js';
import type { ActionValidator } from '../actions/action-validator.js';
import type { ActionExecutor } from '../actions/action-executor.js';
import type { Rule } from '../rules/rule.js';
import type { VictoryCondition } from '../rules/victory-condition.js';
import type { CardEffect } from '../cards/card-effect.js';

/**
 * A Scenario is the full declarative description of a game variant. Plug
 * different scenarios into the same engine to get different games.
 *
 * Nothing here is required to be hex-based, square-based, or resource-based —
 * a scenario picks the pieces it needs.
 */
export interface Scenario {
  readonly id: string;
  readonly name: string;
  readonly minPlayers: number;
  readonly maxPlayers: number;

  readonly terrains: TerrainRegistry;
  readonly resources: ResourceRegistry;
  readonly pieces: PieceRegistry;
  readonly cardEffects?: ReadonlyArray<CardEffect>;

  readonly phases: ReadonlyArray<Phase>;
  readonly initialPhaseId: string;
  readonly turnOrder: TurnOrder;

  readonly validators: ReadonlyArray<ActionValidator>;
  readonly executors: ReadonlyArray<ActionExecutor>;
  readonly rules: ReadonlyArray<Rule>;
  readonly victoryConditions: ReadonlyArray<VictoryCondition>;

  /** Build the starting map for this scenario (may be randomized via RNG). */
  buildMap(playerCount: number, seed: string): GameMap;
}
