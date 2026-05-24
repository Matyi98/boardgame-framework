/**
 * Terrain is pluggable. A concrete game registers its own terrains.
 * The framework treats terrain as an opaque string identifier.
 */

export type TerrainType = string;

export interface TerrainDefinition {
  readonly id: TerrainType;
  readonly name: string;
  /** Resource produced when this tile is activated, if any. */
  readonly produces?: string;
  /** Arbitrary metadata for game-specific rules (defence bonus, movement cost, etc.). */
  readonly meta?: Readonly<Record<string, unknown>>;
}

export class TerrainRegistry {
  private readonly defs = new Map<TerrainType, TerrainDefinition>();

  register(def: TerrainDefinition): this {
    if (this.defs.has(def.id)) {
      throw new Error(`Terrain '${def.id}' already registered`);
    }
    this.defs.set(def.id, def);
    return this;
  }

  get(id: TerrainType): TerrainDefinition | undefined {
    return this.defs.get(id);
  }

  require(id: TerrainType): TerrainDefinition {
    const def = this.defs.get(id);
    if (!def) throw new Error(`Unknown terrain: ${id}`);
    return def;
  }

  all(): TerrainDefinition[] {
    return [...this.defs.values()];
  }
}
