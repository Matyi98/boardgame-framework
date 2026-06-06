import { Player, PlayerId } from '../players/player.js';
import { Phase } from './phase.js';
import { Turn } from './turn.js';
import { TurnOrder } from './turn-order.js';

/**
 * Drives the round / phase state machine. Owned by the engine; mutated as the
 * game progresses. Independent of any specific game's rules — those live in
 * `rules/`.
 *
 * Eliminated players are skipped automatically: endTurn() passes the full
 * roster to TurnOrder.next(), and TurnOrder implementations filter out
 * players whose status is 'eliminated'.
 */
export class RoundManager {
  private currentRound = 1;
  private currentTurn: Turn;
  private readonly phases: ReadonlyMap<string, Phase>;

  constructor(
    players: ReadonlyArray<Player>,
    private readonly turnOrder: TurnOrder,
    phases: ReadonlyArray<Phase>,
    initialPhaseId: string,
  ) {
    this.phases = new Map(phases.map((p) => [p.id, p]));
    if (!this.phases.has(initialPhaseId)) throw new Error(`Unknown initial phase: ${initialPhaseId}`);
    const order = turnOrder.initial(players);
    if (order.length === 0) throw new Error('No players in roster');
    this.currentTurn = {
      turnNumber: 1,
      activePlayer: order[0]!,
      currentPhaseId: initialPhaseId,
      flags: {},
    };
  }

  turn(): Turn { return this.currentTurn; }
  round(): number { return this.currentRound; }

  setPhase(phaseId: string): void {
    const phase = this.phases.get(this.currentTurn.currentPhaseId);
    if (!phase) throw new Error(`Bad current phase: ${this.currentTurn.currentPhaseId}`);
    if (!phase.nextPhases.includes(phaseId)) {
      throw new Error(`Illegal phase transition: ${phase.id} → ${phaseId}`);
    }
    this.currentTurn = { ...this.currentTurn, currentPhaseId: phaseId };
  }

  setFlag(name: string, value: boolean): void {
    this.currentTurn = { ...this.currentTurn, flags: { ...this.currentTurn.flags, [name]: value } };
  }

  /**
   * End the current player's turn and advance to the next active player.
   * Eliminated players are transparently skipped by the TurnOrder strategy.
   *
   * A new round begins when the next active player's seat is ≤ the current
   * active player's seat (i.e. the active player pool has wrapped around).
   * This is robust to mid-round eliminations.
   */
  endTurn(players: ReadonlyArray<Player>, initialPhaseId: string): { newActivePlayer: PlayerId; newRound: boolean } {
    const currentSeat = players.find((p) => p.id === this.currentTurn.activePlayer)?.seat ?? -1;
    const next = this.turnOrder.next(this.currentTurn.activePlayer, players);
    const nextSeat = players.find((p) => p.id === next)?.seat ?? 0;

    // Round advances when we wrap around: next player's seat ≤ current seat.
    const wrappedAround = nextSeat <= currentSeat;
    if (wrappedAround) this.currentRound += 1;

    this.currentTurn = {
      turnNumber: this.currentTurn.turnNumber + 1,
      activePlayer: next,
      currentPhaseId: initialPhaseId,
      flags: {},
    };
    return { newActivePlayer: next, newRound: wrappedAround };
  }
}
