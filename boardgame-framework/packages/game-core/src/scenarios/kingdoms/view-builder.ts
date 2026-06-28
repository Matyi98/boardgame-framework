/**
 * View builder for Kingdoms of Dominion.
 *
 * Converts raw GameState into a typed KingdomsView the frontend can consume
 * without accessing GameState directly. Called exclusively from scenario.buildView().
 *
 * Design principles:
 * - Single O(pieces) pass builds all intermediate maps; no quadratic tile scans
 * - Income preview uses the same pure functions as processRoundEnd() — what you
 *   see is what will run (no separate "preview" formula to diverge from reality)
 * - All turn-state extras are exposed so the UI can disable already-used actions
 * - The type is exported from kingdoms/index.ts so the frontend imports it from
 *   @bgf/game-core rather than maintaining a parallel definition
 *
 * Frontend usage
 * ──────────────
 * On game-started: cast event.payload to KingdomsView (it IS the full snapshot).
 * After other events: re-fetch /api/games/:id/init which returns the latest
 * serialized view. Cast the response to KingdomsView. (Step 9 strategy; Step 10
 * will replace this with proper client-side event application.)
 */

import type { GameState } from '../../state/game-state.js';
import type { Player } from '../../players/player.js';
import { UNIT_STATS, STRUCTURE_STATS, STRUCTURE_KINDS, UNIT_KINDS } from './pieces.js';
import { playerConnectedTiles } from './connectivity.js';
import { calculateTileIncome } from './economy.js';
import { computeIncome, computeFoodCost } from './income.js';

// ── Types ─────────────────────────────────────────────────────────────────────

/** A unit or structure token sitting on a tile. */
export interface KingdomsTilepiece {
  readonly id: string;
  readonly kind: string;
  readonly owner: string;
  readonly hp: number | null;
  // Unit fields (null for structures)
  readonly attack: number | null;
  readonly defense: number | null;
  readonly movement: number | null;
  readonly foodPerRound: number | null;
  // Structure field (null for units)
  readonly defenseMultiplier: number | null;
}

/** Per-tile income breakdown for a connected, owned tile. */
export interface KingdomsTileIncome {
  readonly gold: number;
  readonly resource: string | null;
  readonly resourceAmount: number;
}

export interface KingdomsTileView {
  readonly id: string;
  readonly q: number;
  readonly r: number;
  readonly terrain: string;
  readonly resourceType: string | null;
  readonly economicValue: number;
  readonly combatValue: number;
  readonly owner: string | null;
  /** Whether this tile has been developed via the develop-tile action. */
  readonly developed: boolean;
  readonly pieces: readonly KingdomsTilepiece[];
  /** Income this tile will produce next round-end. Null if not owned or disconnected. */
  readonly incomePreview: KingdomsTileIncome | null;
}

export interface KingdomsPlayerView {
  readonly id: string;
  readonly displayName: string;
  readonly color: string;
  readonly seat: number;
  readonly isActive: boolean;
  readonly isEliminated: boolean;
  readonly capitalTileId: string | null;
  // Current inventory
  readonly wood: number;
  readonly food: number;
  readonly iron: number;
  readonly gold: number;
  /** What this player will earn at the next round-end (from connected territory). */
  readonly incomePreview: { readonly wood: number; readonly food: number; readonly iron: number; readonly gold: number };
  /** incomePreview.food minus total food cost this round. Negative → recruiting units is blocked. */
  readonly foodBalance: number;
  /** Number of tiles reachable from the capital (for supply-line feedback). */
  readonly connectedTileCount: number;
}

/** Turn-state extras needed by the frontend to gate actions. */
export interface KingdomsTurnState {
  /** Piece IDs that have already moved this turn. */
  readonly movedThisTurn: readonly string[];
  /** Tile IDs that have already been used as attack origin this turn. */
  readonly attackedFrom: readonly string[];
  /**
   * Loyalty per unowned tile — the occupation mechanic. Tiles default to full
   * loyalty (100) implicitly and are absent from this map; an entry appears
   * once a Noble has attacked it. Loyalty reaching 0 captures the tile for
   * the last attacker; it recovers +10 every round-end otherwise.
   */
  readonly tileLoyalty: Readonly<Record<string, { loyalty: number; lastAttackerId: string }>>;
}

export interface KingdomsView {
  readonly scenarioId: 'kingdoms-v1';
  readonly status: 'playing' | 'ended';
  readonly round: number;
  readonly currentActivePlayer: string;
  readonly winner: string | null;
  readonly winReason: string | null;
  readonly tiles: readonly KingdomsTileView[];
  readonly players: readonly KingdomsPlayerView[];
  readonly turnState: KingdomsTurnState;
}

// ── Implementation ────────────────────────────────────────────────────────────

function getTileId(piece: { location: { kind: string } }): string | null {
  if (piece.location.kind !== 'tile') return null;
  return (piece.location as { kind: 'tile'; tileId: string }).tileId;
}

export function buildKingdomsView(
  state: GameState,
  players: ReadonlyArray<Player>,
  victory: { winner: string | null; reason: string } | null,
): KingdomsView {
  const ownership = (state.extras['k:ownership'] as Record<string, string> | undefined) ?? {};
  const capitals  = (state.extras['k:capitals']  as Record<string, string> | undefined) ?? {};
  const developed = new Set<string>((state.extras['k:developed'] as string[] | undefined) ?? []);
  const activePlayer = state.rounds.turn().activePlayer;

  // ── O(pieces) pass: piece lists and structure map per tile ────────────────
  const piecesByTileId = new Map<string, KingdomsTilepiece[]>();
  const structuresByTileId = new Map<string, string[]>();

  for (const [, piece] of state.pieces) {
    const tid = getTileId(piece);
    if (!tid) continue;

    const isUnit      = UNIT_KINDS.has(piece.kind);
    const isStructure = STRUCTURE_KINDS.has(piece.kind);
    const unitStats   = isUnit ? UNIT_STATS[piece.kind] : undefined;
    const structStats = isStructure ? STRUCTURE_STATS[piece.kind] : undefined;
    const rawHp = (piece.state as Record<string, unknown> | undefined)?.['hp'];

    const tp: KingdomsTilepiece = {
      id: piece.id,
      kind: piece.kind,
      owner: piece.owner,
      hp: typeof rawHp === 'number' ? rawHp : null,
      attack:          unitStats?.attack          ?? null,
      defense:         unitStats?.defense         ?? null,
      movement:        unitStats?.movement        ?? null,
      foodPerRound:    unitStats?.foodPerRound    ?? null,
      defenseMultiplier: structStats?.defenseMultiplier ?? null,
    };

    const list = piecesByTileId.get(tid);
    if (list) list.push(tp);
    else piecesByTileId.set(tid, [tp]);

    if (isStructure) {
      const slist = structuresByTileId.get(tid);
      if (slist) slist.push(piece.kind);
      else structuresByTileId.set(tid, [piece.kind]);
    }
  }

  // ── Per-player connected tile sets (computed fresh — ADR-005) ────────────
  const connectedByPlayer = new Map<string, Set<string>>();
  for (const player of players) {
    connectedByPlayer.set(
      player.id,
      state.players.isEliminated(player.id)
        ? new Set<string>()
        : playerConnectedTiles(state.map, state, player.id),
    );
  }

  // ── Build owned-tile index for fast lookup of which player owns each tile ─
  const ownerConnectedSet = new Map<string, Set<string>>();
  for (const [playerId, connected] of connectedByPlayer) {
    ownerConnectedSet.set(playerId, connected);
  }

  // ── Tile views ────────────────────────────────────────────────────────────
  const tiles: KingdomsTileView[] = [];
  for (const t of state.map.tiles()) {
    const tileOwner     = ownership[t.id] ?? null;
    const resourceType  = (t.properties?.['resourceType']  as string | null | undefined) ?? null;
    const economicValue = (t.properties?.['economicValue'] as number | undefined) ?? 1;
    const combatValue   = (t.properties?.['combatValue']   as number | undefined) ?? 1;

    let incomePreview: KingdomsTileIncome | null = null;
    if (tileOwner) {
      const connected = ownerConnectedSet.get(tileOwner);
      if (connected?.has(t.id)) {
        const structureKinds = structuresByTileId.get(t.id) ?? [];
        const inc = calculateTileIncome(t, structureKinds);
        incomePreview = { gold: inc.gold, resource: inc.resource, resourceAmount: inc.resourceAmount };
      }
    }

    tiles.push({
      id: t.id,
      q:    t.coord.q,
      r:    t.coord.r,
      terrain:       t.terrain,
      resourceType,
      economicValue,
      combatValue,
      owner:    tileOwner,
      developed: developed.has(t.id),
      pieces:   piecesByTileId.get(t.id) ?? [],
      incomePreview,
    });
  }

  // ── Player views ──────────────────────────────────────────────────────────
  const viewPlayers: KingdomsPlayerView[] = players.map((p) => {
    const inv      = state.inventories.get(p.id);
    const dead     = state.players.isEliminated(p.id);
    const connected = connectedByPlayer.get(p.id) ?? new Set<string>();

    const incomePreview = dead
      ? { wood: 0, food: 0, iron: 0, gold: 0 }
      : computeIncome(state, p.id);
    const foodCost = dead ? 0 : computeFoodCost(state, p.id);

    return {
      id:            p.id,
      displayName:   p.displayName,
      color:         p.color,
      seat:          p.seat,
      isActive:      p.id === activePlayer,
      isEliminated:  dead,
      capitalTileId: capitals[p.id] ?? null,
      wood:  inv?.get('wood')  ?? 0,
      food:  inv?.get('food')  ?? 0,
      iron:  inv?.get('iron')  ?? 0,
      gold:  inv?.get('gold')  ?? 0,
      incomePreview,
      foodBalance:        incomePreview.food - foodCost,
      connectedTileCount: connected.size,
    };
  });

  // ── Turn-state extras ─────────────────────────────────────────────────────
  const tileLoyalty = (state.extras['k:tileLoyalty'] as Record<string, { loyalty: number; lastAttackerId: string }> | undefined) ?? {};

  const turnState: KingdomsTurnState = {
    movedThisTurn: (state.extras['k:movedThisTurn'] as string[] | undefined) ?? [],
    attackedFrom:  (state.extras['k:attackedFrom']  as string[] | undefined) ?? [],
    tileLoyalty,
  };

  return {
    scenarioId: 'kingdoms-v1',
    status: state.status as 'playing' | 'ended',
    round:  state.rounds.round(),
    currentActivePlayer: activePlayer,
    winner:    victory?.winner ?? null,
    winReason: victory?.reason ?? null,
    tiles,
    players: viewPlayers,
    turnState,
  };
}
