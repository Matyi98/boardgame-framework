import { Player, PlayerId } from '../players/player.js';

/** Strategy interface for determining who goes next. */
export interface TurnOrder {
  /** Initial turn order at game start. */
  initial(players: ReadonlyArray<Player>): ReadonlyArray<PlayerId>;
  /** Given current player + roster, who goes next? */
  next(currentId: PlayerId, players: ReadonlyArray<Player>): PlayerId;
}

export class ClockwiseTurnOrder implements TurnOrder {
  initial(players: ReadonlyArray<Player>): ReadonlyArray<PlayerId> {
    return [...players].sort((a, b) => a.seat - b.seat).map(p => p.id);
  }
  next(currentId: PlayerId, players: ReadonlyArray<Player>): PlayerId {
    const sorted = [...players].sort((a, b) => a.seat - b.seat);
    const idx = sorted.findIndex(p => p.id === currentId);
    if (idx < 0) throw new Error(`Unknown player: ${currentId}`);
    return sorted[(idx + 1) % sorted.length]!.id;
  }
}

/** Snake order: A B C C B A A B C ... (useful for setup phases). */
export class SnakeTurnOrder implements TurnOrder {
  private goingForward = true;
  initial(players: ReadonlyArray<Player>): ReadonlyArray<PlayerId> {
    return [...players].sort((a, b) => a.seat - b.seat).map(p => p.id);
  }
  next(currentId: PlayerId, players: ReadonlyArray<Player>): PlayerId {
    const sorted = [...players].sort((a, b) => a.seat - b.seat);
    const idx = sorted.findIndex(p => p.id === currentId);
    if (idx < 0) throw new Error(`Unknown player: ${currentId}`);
    if (this.goingForward && idx === sorted.length - 1) {
      this.goingForward = false;
      return sorted[idx]!.id; // same player goes again
    }
    if (!this.goingForward && idx === 0) {
      this.goingForward = true;
      return sorted[0]!.id;
    }
    return this.goingForward ? sorted[idx + 1]!.id : sorted[idx - 1]!.id;
  }
}
