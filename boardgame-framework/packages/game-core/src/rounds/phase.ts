/**
 * A phase within a turn. Each game defines its own phases (e.g.
 * 'roll' → 'trade' → 'build' → 'end' in a Catan-style turn).
 */
export interface Phase {
  readonly id: string;
  readonly displayName: string;
  /** Phases this one is allowed to transition to. Empty = terminal. */
  readonly nextPhases: ReadonlyArray<string>;
}
