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

/** Shape of a Noble occupation entry. */
export interface OccupationEntry {
  nobleId: string;
  playerId: string;
}

/**
 * Occupations initiated THIS turn (Noble just moved to unowned tile).
 * Promoted to confirmedOccupations at end-of-turn; not yet eligible for capture.
 */
export function getPendingOccupations(state: GameState): Record<string, OccupationEntry> {
  return (state.extras['k:pendingOccupations'] as Record<string, OccupationEntry>) ?? {};
}

/**
 * Occupations that were pending at the previous end-of-turn for this player.
 * Noble still on the tile at THIS end-of-turn → tile captured.
 */
export function getConfirmedOccupations(state: GameState): Record<string, OccupationEntry> {
  return (state.extras['k:confirmedOccupations'] as Record<string, OccupationEntry>) ?? {};
}

/**
 * Cancel any pending/confirmed occupation held by a specific Noble piece.
 * Called when a Noble moves away from an occupied tile.
 */
export function cancelOccupationByNoble(state: GameState, nobleId: string): void {
  const pending   = { ...getPendingOccupations(state) };
  const confirmed = { ...getConfirmedOccupations(state) };
  for (const tileId of Object.keys(pending)) {
    if (pending[tileId]?.nobleId === nobleId) delete pending[tileId];
  }
  for (const tileId of Object.keys(confirmed)) {
    if (confirmed[tileId]?.nobleId === nobleId) delete confirmed[tileId];
  }
  state.extras['k:pendingOccupations']   = pending;
  state.extras['k:confirmedOccupations'] = confirmed;
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
