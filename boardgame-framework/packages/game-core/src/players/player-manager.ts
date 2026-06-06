import { Player, PlayerId } from './player.js';

/**
 * In-memory player roster. The only place that mutates Player.status —
 * everything else reads through this class.
 *
 * Players enter as 'active' (regardless of the status field on incoming data)
 * and transition to 'eliminated' via eliminate(). The RoundManager / TurnOrder
 * pick this up automatically, so scenarios only need to call eliminate() and
 * never manually manage turn skipping.
 */
export class PlayerManager {
  /** Players sorted by seat. All have status initialized to 'active'. */
  private readonly bySeat: Player[];
  private readonly byId = new Map<PlayerId, Player>();

  constructor(players: ReadonlyArray<Player>) {
    // Store owned copies with status always initialized to 'active'.
    // This ensures fresh games start correctly even if incoming Player objects
    // from the lobby service don't carry a status field.
    this.bySeat = [...players]
      .sort((a, b) => a.seat - b.seat)
      .map((p) => ({ ...p, status: 'active' as const }));
    for (const p of this.bySeat) this.byId.set(p.id, p);
  }

  /** All players (including eliminated) in seat order. */
  all(): ReadonlyArray<Player> { return this.bySeat; }

  /** Only players still in the game, in seat order. */
  active(): ReadonlyArray<Player> {
    return this.bySeat.filter((p) => p.status !== 'eliminated');
  }

  count(): number { return this.bySeat.length; }

  get(id: PlayerId): Player | undefined { return this.byId.get(id); }

  require(id: PlayerId): Player {
    const p = this.byId.get(id);
    if (!p) throw new Error(`Unknown player: ${id}`);
    return p;
  }

  atSeat(seat: number): Player | undefined { return this.bySeat[seat]; }

  isEliminated(id: PlayerId): boolean {
    return this.byId.get(id)?.status === 'eliminated';
  }

  /**
   * Mark a player as eliminated. After this call the player is skipped by
   * TurnOrder.next() and excluded from PlayerManager.active().
   */
  eliminate(id: PlayerId): void {
    const player = this.byId.get(id);
    if (!player) throw new Error(`Cannot eliminate unknown player: ${id}`);
    (player as { status: 'active' | 'eliminated' }).status = 'eliminated';
  }
}
