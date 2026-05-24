import type { GamePhaseStatus } from './game-state.js';

/**
 * Top-level lifecycle transitions. Phases *within* `playing` are handled by
 * RoundManager; this machine only governs the outer envelope.
 *
 *   lobby ──▶ setup ──▶ playing ──▶ ended
 *     │         │           │
 *     └─────────┴───────────┴──▶ ended  (forfeit / cancel)
 */
const TRANSITIONS: Record<GamePhaseStatus, ReadonlyArray<GamePhaseStatus>> = {
  lobby: ['setup', 'ended'],
  setup: ['playing', 'ended'],
  playing: ['ended'],
  ended: [],
};

export class GameStateMachine {
  constructor(private current: GamePhaseStatus = 'lobby') {}

  get status(): GamePhaseStatus {
    return this.current;
  }

  canTransitionTo(next: GamePhaseStatus): boolean {
    return TRANSITIONS[this.current].includes(next);
  }

  transitionTo(next: GamePhaseStatus): void {
    if (!this.canTransitionTo(next)) {
      throw new Error(`Illegal game status transition: ${this.current} → ${next}`);
    }
    this.current = next;
  }
}
