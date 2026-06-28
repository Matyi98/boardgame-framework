/**
 * kingdoms-v1 — "Kingdoms of Dominion"
 *
 * A turn-based military conquest game on a 61-tile (4-ring) hex map.
 *
 * Rules in brief
 * ──────────────
 * • 2–4 players, each starts with a Capital Base and 2 Spearmen on ring 4.
 * • On your turn: recruit, move units, attack adjacent tiles, build / demolish
 *   structures — any combination, any number of times.
 * • End your turn: collect income from connected structures, units eat food,
 *   starving units are disbanded.
 * • Win: capture every other player's Capital Base.
 *
 * Design notes → docs/kingdoms/00-overview.md
 * Data model   → docs/kingdoms/01-data-model.md
 * ADRs         → docs/kingdoms/02-adr.md
 * Actions      → docs/kingdoms/03-action-catalogue.md
 */

import type { Scenario } from '../../setup/scenario.js';
import type { GameState } from '../../state/game-state.js';
import type { Player } from '../../players/player.js';
import { ClockwiseTurnOrder } from '../../rounds/turn-order.js';
import { tileId } from '../../map/tile.js';
import { makeUnitFromRegistry } from '../../pieces/unit.js';
import { kingdomsTerrains } from './terrain.js';
import { kingdomsResources } from './resources.js';
import { kingdomsPieces, STRUCTURE_STATS } from './pieces.js';
import { buildKingdomsMap, KINGDOMS_STARTING_COORDS } from './map.js';
import {
  recruitUnitValidator,      recruitUnitExecutor,
  moveUnitValidator,         moveUnitExecutor,
  attackTileValidator,       attackTileExecutor,
  buildStructureValidator,   buildStructureExecutor,
  demolishStructureValidator, demolishStructureExecutor,
  developTileValidator,      developTileExecutor,
  endTurnValidator,          endTurnExecutor,
} from './actions/index.js';
import { lastPlayerStanding } from './victory.js';
import { buildKingdomsView } from './view-builder.js';

// ── Scenario object ───────────────────────────────────────────────────────────

export const kingdomsScenario: Scenario = {
  id: 'kingdoms-v1',
  name: 'Kingdoms of Dominion',
  minPlayers: 2,
  maxPlayers: 4,

  terrains: kingdomsTerrains,
  resources: kingdomsResources,
  pieces: kingdomsPieces,

  phases: [
    { id: 'command', displayName: 'Command', nextPhases: ['command'] },
  ],
  initialPhaseId: 'command',
  turnOrder: new ClockwiseTurnOrder(),

  validators: [
    recruitUnitValidator,
    moveUnitValidator,
    attackTileValidator,
    buildStructureValidator,
    demolishStructureValidator,
    developTileValidator,
    endTurnValidator,
  ],
  executors: [
    recruitUnitExecutor,
    moveUnitExecutor,
    attackTileExecutor,
    buildStructureExecutor,
    demolishStructureExecutor,
    developTileExecutor,
    endTurnExecutor,
  ],
  rules: [],
  victoryConditions: [lastPlayerStanding],

  buildMap: buildKingdomsMap,
  buildView: (state, players, victory) =>
    buildKingdomsView(state, players, victory) as unknown as Record<string, unknown>,

  onSetup(state: GameState, players: ReadonlyArray<Player>): void {
    const coords = KINGDOMS_STARTING_COORDS[players.length] ?? KINGDOMS_STARTING_COORDS[2]!;
    const ownership: Record<string, string> = {};
    const capitals:  Record<string, string> = {};

    players.forEach((player, i) => {
      const coord = coords[i];
      if (!coord) return;
      const tid = tileId(coord);

      // Place Capital Base — stats from registry (hp, defenseMultiplier);
      // state.hp tracks current mutable HP separately from stats.hp (max HP).
      const capitalId = `capital-${player.id}`;
      state.pieces.set(capitalId, makeUnitFromRegistry(kingdomsPieces, {
        id: capitalId,
        kind: 'capital-base',
        owner: player.id,
        tileId: tid,
        state: { hp: STRUCTURE_STATS['capital-base']!.hp },
      }));

      // Place 2 starting Spearmen — stats from registry (attack, foodPerRound, hp)
      const sp1 = `sp-${player.id}-1`;
      const sp2 = `sp-${player.id}-2`;
      state.pieces.set(sp1, makeUnitFromRegistry(kingdomsPieces, { id: sp1, kind: 'spearman', owner: player.id, tileId: tid }));
      state.pieces.set(sp2, makeUnitFromRegistry(kingdomsPieces, { id: sp2, kind: 'spearman', owner: player.id, tileId: tid }));

      // Place 1 starting Noble — enables early occupation without needing to buy one first
      const no1 = `noble-${player.id}-0`;
      state.pieces.set(no1, makeUnitFromRegistry(kingdomsPieces, { id: no1, kind: 'noble', owner: player.id, tileId: tid }));

      // Claim starting tile
      ownership[tid] = player.id;
      capitals[player.id] = tid;

      // Starting resources — enough to build a structure or two and recruit
      // a couple of units in the opening turns without waiting for income.
      const inv = state.inventories.get(player.id)!;
      inv.add('wood', 10);
      inv.add('food', 8);
      inv.add('iron', 6);
      inv.add('gold', 30);
    });

    state.extras['k:ownership']           = ownership;
    state.extras['k:capitals']            = capitals;
    state.extras['k:nextPieceId']         = 100;
    state.extras['k:movedThisTurn']       = [];
    state.extras['k:attackedFrom']        = [];
    state.extras['k:tileLoyalty']         = {};
    state.extras['k:mortgagedCities']     = [];
  },
};
