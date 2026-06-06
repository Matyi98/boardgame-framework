/**
 * demo-v1 — "Frontier"
 *
 * A territory-expansion game on a 19-tile two-ring hex map.
 *
 * Rules in brief
 * ──────────────
 * • 2–4 players. Each starts with one pre-claimed home tile on the outer ring.
 * • On your turn you may claim ONE tile adjacent to your existing territory,
 *   then end your turn (or just end your turn right away).
 * • You cannot jump to unconnected tiles — expansion must be continuous.
 * • Terrain values: Plains 1 VP, Forest 2 VP, Mountain 3 VP.
 * • First player to 12 VP wins. If the board fills before that, highest VP wins.
 */

import type { Scenario } from '../../setup/scenario.js';
import type { GameState } from '../../state/game-state.js';
import type { Player } from '../../players/player.js';
import { TerrainRegistry } from '../../map/terrain.js';
import { ResourceRegistry } from '../../resources/resource-type.js';
import { PieceRegistry } from '../../pieces/piece-registry.js';
import { ClockwiseTurnOrder } from '../../rounds/turn-order.js';
import { tileId } from '../../map/tile.js';
import { makeUnit } from '../../pieces/unit.js';
import { buildDemoMap } from './map.js';
import {
  TERRAIN_VP,
  claimTileValidator,
  claimTileExecutor,
  endTurnValidator,
  endTurnExecutor,
  tradeValidator,
  tradeExecutor,
  fortifyValidator,
  fortifyExecutor,
  postOfferValidator,
  postOfferExecutor,
  acceptOfferValidator,
  acceptOfferExecutor,
  cancelOfferValidator,
  cancelOfferExecutor,
} from './actions.js';
import { firstToEighteenVP, allTilesClaimed } from './victory.js';

// ── registries ───────────────────────────────────────────────────────────────

const terrains = new TerrainRegistry()
  .register({ id: 'grass',    name: 'Plains',   produces: 'vp', meta: { vp: 1 } })
  .register({ id: 'forest',   name: 'Forest',   produces: 'vp', meta: { vp: 2 } })
  .register({ id: 'mountain', name: 'Mountain', produces: 'vp', meta: { vp: 3 } });

const resources = new ResourceRegistry()
  .register({ id: 'vp',    name: 'Victory Points', symbol: '★' })
  .register({ id: 'wood',  name: 'Wood',           symbol: '🪵' })
  .register({ id: 'stone', name: 'Stone',          symbol: '🪨' });

const pieces = new PieceRegistry()
  .register({
    kind: 'flag',
    category: 'unit',
    displayName: 'Settlement',
    limitPerPlayer: 19,
  });

// ── starting positions ────────────────────────────────────────────────────────

/**
 * Pre-assigned home tile coords per player count.
 * All positions are on ring 2 so players start well separated.
 *
 * 2P: opposite sides of the map
 * 3P: equilateral triangle on ring 2
 * 4P: four cardinal points on ring 2
 */
const STARTING_COORDS: Record<number, ReadonlyArray<{ q: number; r: number }>> = {
  2: [{ q:  3, r: -2 }, { q: -3, r:  2 }],
  3: [{ q:  3, r:  0 }, { q: -1, r: -2 }, { q: -2, r:  3 }],
  4: [{ q:  3, r:  0 }, { q: -3, r:  0 }, { q:  0, r: -3 }, { q:  0, r:  3 }],
};

// ── scenario object ───────────────────────────────────────────────────────────

export const demoScenario: Scenario = {
  id: 'demo-v1',
  name: 'Frontier',
  minPlayers: 2,
  maxPlayers: 4,

  terrains,
  resources,
  pieces,

  phases: [{ id: 'turn', displayName: 'Your Turn', nextPhases: ['turn'] }],
  initialPhaseId: 'turn',
  turnOrder: new ClockwiseTurnOrder(),

  validators: [claimTileValidator, endTurnValidator, tradeValidator, fortifyValidator, postOfferValidator, acceptOfferValidator, cancelOfferValidator],
  executors:  [claimTileExecutor,  endTurnExecutor,  tradeExecutor,  fortifyExecutor,  postOfferExecutor,  acceptOfferExecutor,  cancelOfferExecutor],
  rules: [],
  victoryConditions: [firstToEighteenVP, allTilesClaimed],

  buildMap: buildDemoMap,

  /**
   * Pre-claim one home tile per player on the outer ring. Also stores a
   * homeTiles map in state.extras so the view can render home markers.
   */
  onSetup(state: GameState, players: ReadonlyArray<Player>): void {
    const coords = STARTING_COORDS[players.length] ?? STARTING_COORDS[2]!;
    const homeTiles: Record<string, string> = {};

    players.forEach((player, i) => {
      const coord = coords[i];
      if (!coord) return;

      const id = tileId(coord);
      const tile = state.map.tileById(id);
      if (!tile) return;

      const vp = TERRAIN_VP[tile.terrain] ?? 1;
      const pieceId = `flag-${player.id}-${id}`;
      state.pieces.set(
        pieceId,
        makeUnit({ id: pieceId, kind: 'flag', owner: player.id, tileId: id }),
      );
      state.inventories.get(player.id)?.add('vp', vp);
      homeTiles[player.id] = id;
    });

    state.extras['homeTiles'] = homeTiles;
  },
};
