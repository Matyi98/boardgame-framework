import { ResourceType } from './resource-type.js';

/** A bag of resources. Mutable — game-engine maintains one per player. */
export class Inventory {
  private readonly counts: Map<ResourceType, number>;

  constructor(initial?: Record<ResourceType, number>) {
    this.counts = new Map(Object.entries(initial ?? {}));
  }

  get(type: ResourceType): number { return this.counts.get(type) ?? 0; }
  has(type: ResourceType, qty: number): boolean { return this.get(type) >= qty; }

  add(type: ResourceType, qty: number): void {
    if (qty < 0) throw new Error('add() takes a non-negative quantity; use remove() instead');
    this.counts.set(type, this.get(type) + qty);
  }

  remove(type: ResourceType, qty: number): void {
    if (qty < 0) throw new Error('remove() takes a non-negative quantity');
    const current = this.get(type);
    if (current < qty) throw new Error(`Insufficient ${type}: have ${current}, need ${qty}`);
    this.counts.set(type, current - qty);
  }

  /** Snapshot. */
  toJSON(): Record<ResourceType, number> {
    return Object.fromEntries(this.counts);
  }

  total(): number {
    let sum = 0;
    for (const v of this.counts.values()) sum += v;
    return sum;
  }
}
