/**
 * Shared state-access helpers and common validation guard for all Kingdom actions.
 *
 * All action files import from here. Keeping shared logic in one place means:
 *   - A key rename (e.g. 'k:ownership') is a one-line change
 *   - The guardActivePlayer logic is never duplicated
 *   - TypeScript narrows the any-typed extras in one authoritative location
 */

import type { GameState } from '../../../state/game-state.js';
import { actionError } from '../../../actions/action.js';
import type { ActionError } from '../../../actions/action.js';
import { playerConnectedTiles, isConnected } from '../connectivity.js';

// ── Extras accessors ──────────────────────────────────────────────────────────

export function getOwnership(state: GameState): Record<string, string> {
  return (state.extras['k:ownership'] as Record<string, string>) ?? {};
}

export function getCapitals(state: GameState): Record<string, string> {
  return (state.extras['k:capitals'] as Record<string, string>) ?? {};
}

export function getMovedThisTurn(state: GameState): string[] {
  return (state.extras['k:movedThisTurn'] as string[]) ?? [];
}

export function getAttackedFrom(state: GameState): string[] {
  return (state.extras['k:attackedFrom'] as string[]) ?? [];
}

export function getDeveloped(state: GameState): Set<string> {
  const raw = state.extras['k:developed'] as string[] | undefined;
  return raw ? new Set(raw) : new Set();
}

/**
 * Loyalty per tile the attacker doesn't already own (unowned OR enemy-owned)
 * — the occupation mechanic. Tiles start at full loyalty (100) implicitly;
 * entries here only exist for tiles a Noble has successfully attacked at
 * least once. A surviving Noble's attack reduces loyalty by 45 (see
 * actions/attack.ts); reaching 0 grants the tile to the attacker (and can
 * trigger capital capture / elimination if it was an enemy capital). Loyalty
 * recovers +10 every round-end, unconditionally, capped at 100 (entries are
 * deleted once they reach 100 again).
 */
export interface TileLoyalty {
  loyalty: number;         // 1-99 while contested; entries at 100 are deleted
  lastAttackerId: string;  // playerId whose Noble last reduced it (for UI color)
}

export function getTileLoyalty(state: GameState): Record<string, TileLoyalty> {
  return (state.extras['k:tileLoyalty'] as Record<string, TileLoyalty>) ?? {};
}

export function getMortgagedCityIds(state: GameState): Set<string> {
  const raw = state.extras?.['k:mortgagedCities'] as string[] | undefined;
  return raw ? new Set(raw) : new Set<string>();
}

/** Monotonically increasing piece ID generator. Never reuse IDs even after pieces die. */
export function nextId(state: GameState): string {
  const n = ((state.extras['k:nextPieceId'] as number) ?? 0) + 1;
  state.extras['k:nextPieceId'] = n;
  return `kp-${n}`;
}

// ── Piece query helpers ───────────────────────────────────────────────────────

export function unitsOnTile(
  state: GameState,
  tileId: string,
  ownerFilter?: string,
  unitKindSet?: Set<string>,
): string[] {
  const ids: string[] = [];
  for (const [id, piece] of state.pieces) {
    if (unitKindSet && !unitKindSet.has(piece.kind)) continue;
    if (piece.location.kind !== 'tile') continue;
    if ((piece.location as { kind: 'tile'; tileId: string }).tileId !== tileId) continue;
    if (ownerFilter !== undefined && piece.owner !== ownerFilter) continue;
    ids.push(id);
  }
  return ids;
}

export function structureOnTile(
  state: GameState,
  tileId: string,
  structureKindSet: Set<string>,
): { id: string; kind: string; owner: string } | null {
  for (const [id, piece] of state.pieces) {
    if (!structureKindSet.has(piece.kind)) continue;
    if (piece.location.kind !== 'tile') continue;
    if ((piece.location as { kind: 'tile'; tileId: string }).tileId !== tileId) continue;
    return { id, kind: piece.kind, owner: piece.owner };
  }
  return null;
}

export function countPlayerPiecesOfKind(
  state: GameState,
  playerId: string,
  kind: string,
): number {
  let count = 0;
  for (const [, piece] of state.pieces) {
    if (piece.owner === playerId && piece.kind === kind) count++;
  }
  return count;
}

export function isAdjacent(
  map: GameState['map'],
  tileIdA: string,
  tileIdB: string,
): boolean {
  const tileA = map.tileById(tileIdA);
  if (!tileA) return false;
  return map.neighboursOf(tileA.coord).some((t) => t.id === tileIdB);
}

/**
 * Build the set of tiles reachable from a player's capital (Gate bridges included).
 * Called fresh on every validation — never cached (ADR-005).
 */
export function connectedTiles(state: GameState, playerId: string): Set<string> {
  return playerConnectedTiles(state.map, state, playerId);
}

export { isConnected };

// ── Common validation guard ───────────────────────────────────────────────────

/**
 * Returns an ActionError if the player is not allowed to act, null otherwise.
 * Every action validator calls this first.
 */
export function guardActivePlayer(
  state: GameState,
  playerId: string | null | undefined,
): ActionError | null {
  if (!playerId) return actionError('no-player', 'No player ID on action');
  if (state.rounds.turn().activePlayer !== playerId)
    return actionError('not-your-turn', 'It is not your turn');
  if (state.players.isEliminated(playerId))
    return actionError('eliminated', 'You have been eliminated');
  return null;
}
