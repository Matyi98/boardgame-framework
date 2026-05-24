import { Player, PlayerId } from '../players/player.js';
import { Phase } from './phase.js';
import { Turn } from './turn.js';
import { TurnOrder } from './turn-order.js';

/**
 * Drives the round / phase state machine. Owned by the engine; mutated as the
 * game progresses. Independent of any specific game's rules — those live in
 * `rules/`.
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
    this.phases = new Map(phases.map(p => [p.id, p]));
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

  /** End the current player's turn and advance to the next. */
  endTurn(players: ReadonlyArray<Player>, initialPhaseId: string): { newActivePlayer: PlayerId; newRound: boolean } {
    const next = this.turnOrder.next(this.currentTurn.activePlayer, players);
    const wrappedAround = next === this.turnOrder.initial(players)[0];
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
