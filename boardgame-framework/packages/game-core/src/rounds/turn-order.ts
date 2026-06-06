import { Player, PlayerId } from '../players/player.js';

/** Strategy interface for determining who goes next. */
export interface TurnOrder {
  /** Initial turn order at game start (excludes eliminated players). */
  initial(players: ReadonlyArray<Player>): ReadonlyArray<PlayerId>;
  /**
   * Given the current active player and the full roster (including eliminated),
   * return the next active player's ID.
   * Implementations MUST skip players whose status is 'eliminated'.
   */
  next(currentId: PlayerId, players: ReadonlyArray<Player>): PlayerId;
}

/** Returns only non-eliminated players sorted by seat. */
function activeSortedByseat(players: ReadonlyArray<Player>): Player[] {
  return [...players]
    .filter((p) => p.status !== 'eliminated')
    .sort((a, b) => a.seat - b.seat);
}

export class ClockwiseTurnOrder implements TurnOrder {
  initial(players: ReadonlyArray<Player>): ReadonlyArray<PlayerId> {
    return activeSortedByseat(players).map((p) => p.id);
  }

  next(currentId: PlayerId, players: ReadonlyArray<Player>): PlayerId {
    const active = activeSortedByseat(players);
    if (active.length === 0) throw new Error('No active players remain');
    if (active.length === 1) return active[0]!.id;
    const idx = active.findIndex((p) => p.id === currentId);
    // If the current player was just eliminated, idx will be -1.
    // Fall through to seat 0 in that case (safe — victory should fire first).
    return active[(Math.max(idx, 0) + 1) % active.length]!.id;
  }
}

/** Snake order: A B C C B A A B C … (useful for setup phases). */
export class SnakeTurnOrder implements TurnOrder {
  private goingForward = true;

  initial(players: ReadonlyArray<Player>): ReadonlyArray<PlayerId> {
    return activeSortedByseat(players).map((p) => p.id);
  }

  next(currentId: PlayerId, players: ReadonlyArray<Player>): PlayerId {
    const active = activeSortedByseat(players);
    if (active.length === 0) throw new Error('No active players remain');
    const idx = active.findIndex((p) => p.id === currentId);
    if (idx < 0) return active[0]!.id;
    if (this.goingForward && idx === active.length - 1) {
      this.goingForward = false;
      return active[idx]!.id;
    }
    if (!this.goingForward && idx === 0) {
      this.goingForward = true;
      return active[0]!.id;
    }
    return this.goingForward ? active[idx + 1]!.id : active[idx - 1]!.id;
  }
}
