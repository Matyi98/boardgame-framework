/**
 * Registry of piece kinds a game supports. Games register here so other
 * modules can introspect ("what kinds of buildings can red player build?").
 */
export interface PieceKindDefinition {
  readonly kind: string;
  readonly category: 'building' | 'unit' | 'marker';
  readonly displayName: string;
  /** Cost as resource → amount. Empty = free. */
  readonly cost?: Readonly<Record<string, number>>;
  /** Max instances per player. Undefined = unlimited. */
  readonly limitPerPlayer?: number;
  /**
   * Default numeric stats merged into Piece.stats at creation time.
   * Scenarios declare these once here (e.g. attack: 3, foodPerRound: 1)
   * so every new piece of this kind starts with the right values without
   * the caller having to repeat them. Overrides are possible per-instance.
   * Balance tuning = one edit here, zero changes to validators/executors.
   */
  readonly defaultStats?: Readonly<Record<string, number>>;
  /** Arbitrary non-numeric metadata (display hints, category tags, etc.). */
  readonly meta?: Readonly<Record<string, unknown>>;
}

export class PieceRegistry {
  private readonly defs = new Map<string, PieceKindDefinition>();

  register(def: PieceKindDefinition): this {
    if (this.defs.has(def.kind)) {
      throw new Error(`Piece kind '${def.kind}' already registered`);
    }
    this.defs.set(def.kind, def);
    return this;
  }

  get(kind: string): PieceKindDefinition | undefined { return this.defs.get(kind); }
  require(kind: string): PieceKindDefinition {
    const def = this.defs.get(kind);
    if (!def) throw new Error(`Unknown piece kind: ${kind}`);
    return def;
  }
  all(): PieceKindDefinition[] { return [...this.defs.values()]; }
  byCategory(category: PieceKindDefinition['category']): PieceKindDefinition[] {
    return this.all().filter(d => d.category === category);
  }

  /** Returns the defaultStats for the given kind, or an empty object. */
  getDefaultStats(kind: string): Readonly<Record<string, number>> {
    return this.defs.get(kind)?.defaultStats ?? {};
  }
}
