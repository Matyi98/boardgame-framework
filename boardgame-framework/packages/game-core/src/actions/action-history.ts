import type { Action } from './action.js';
import type { GameEvent } from '../events/game-event.js';

export interface ActionHistoryEntry {
  readonly seq: number;
  readonly at: number; // epoch ms
  readonly action: Action;
  readonly events: ReadonlyArray<GameEvent>;
}

/**
 * Append-only journal of accepted actions and their emitted events. The
 * persistence service in the engine app snapshots this periodically so games
 * can be reconstructed deterministically from a snapshot + tail of entries.
 */
export class ActionHistory {
  private readonly entries: ActionHistoryEntry[] = [];

  append(action: Action, events: ReadonlyArray<GameEvent>): ActionHistoryEntry {
    const entry: ActionHistoryEntry = {
      seq: this.entries.length + 1,
      at: Date.now(),
      action,
      events,
    };
    this.entries.push(entry);
    return entry;
  }

  get length(): number {
    return this.entries.length;
  }

  since(seq: number): ReadonlyArray<ActionHistoryEntry> {
    return this.entries.filter((e) => e.seq > seq);
  }

  all(): ReadonlyArray<ActionHistoryEntry> {
    return this.entries;
  }
}
