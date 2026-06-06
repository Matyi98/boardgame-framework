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

// ── View builder ──────────────────────────────────────────────────────────────

function buildView(
  state: GameState,
  players: ReadonlyArray<Player>,
  victory: { winner: string | null; reason: string } | null,
): Record<string, unknown> {
  const ownership = (state.extras['k:ownership'] as Record<string, string>) ?? {};
  const capitals  = (state.extras['k:capitals']  as Record<string, string>) ?? {};
  const activePlayer = state.rounds.turn().activePlayer;

  const tiles = [...state.map.tiles()].map((t) => {
    const piecesOnTile: Record<string, unknown>[] = [];
    for (const [, piece] of state.pieces) {
      if (piece.location.kind !== 'tile') continue;
      if ((piece.location as { kind: 'tile'; tileId: string }).tileId !== t.id) continue;
      piecesOnTile.push({
        id: piece.id,
        kind: piece.kind,
        owner: piece.owner,
        hp: (piece.state as Record<string, unknown> | undefined)?.['hp'] ?? null,
      });
    }
    return {
      id: t.id,
      q: t.coord.q,
      r: t.coord.r,
      terrain: t.terrain,
      owner: ownership[t.id] ?? null,
      pieces: piecesOnTile,
    };
  });

  const viewPlayers = players.map((p) => {
    const inv = state.inventories.get(p.id);
    return {
      id: p.id,
      displayName: p.displayName,
      color: p.color,
      seat: p.seat,
      isActive: p.id === activePlayer,
      isEliminated: state.players.isEliminated(p.id),
      capitalTileId: capitals[p.id] ?? null,
      wood:  inv?.get('wood')  ?? 0,
      food:  inv?.get('food')  ?? 0,
      iron:  inv?.get('iron')  ?? 0,
      gold:  inv?.get('gold')  ?? 0,
    };
  });

  return {
    scenarioId: 'kingdoms-v1',
    status: state.status as string,
    round: state.rounds.round(),
    currentActivePlayer: activePlayer,
    winner: victory?.winner ?? null,
    winReason: victory?.reason ?? null,
    tiles,
    players: viewPlayers,
  };
}

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
  buildView,

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

      // Claim starting tile
      ownership[tid] = player.id;
      capitals[player.id] = tid;

      // Starting resources
      const inv = state.inventories.get(player.id)!;
      inv.add('wood', 5);
      inv.add('food', 3);
      inv.add('iron', 2);
      inv.add('gold', 2);
    });

    state.extras['k:ownership']            = ownership;
    state.extras['k:capitals']             = capitals;
    state.extras['k:nextPieceId']          = 100; // start above setup piece IDs
    state.extras['k:movedThisTurn']        = [];
    state.extras['k:attackedFrom']         = [];
    state.extras['k:pendingOccupations']   = {};
    state.extras['k:confirmedOccupations'] = {};
    state.extras['k:mortgagedCities']      = []; // piece IDs of deactivated cities
  },
};
