import { Player, PlayerId } from './player.js';

/** In-memory roster. Backed by GameState; this is just a typed accessor. */
export class PlayerManager {
  private readonly bySeat: Player[];
  private readonly byId = new Map<PlayerId, Player>();

  constructor(players: ReadonlyArray<Player>) {
    this.bySeat = [...players].sort((a, b) => a.seat - b.seat);
    for (const p of this.bySeat) this.byId.set(p.id, p);
  }

  all(): ReadonlyArray<Player> { return this.bySeat; }
  count(): number { return this.bySeat.length; }
  get(id: PlayerId): Player | undefined { return this.byId.get(id); }
  require(id: PlayerId): Player {
    const p = this.byId.get(id);
    if (!p) throw new Error(`Unknown player: ${id}`);
    return p;
  }
  atSeat(seat: number): Player | undefined { return this.bySeat[seat]; }
}
