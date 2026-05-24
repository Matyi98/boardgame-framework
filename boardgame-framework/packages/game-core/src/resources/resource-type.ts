/** Resources are pluggable. Each game registers its own (money, wood, ore, ...). */
export type ResourceType = string;

export interface ResourceDefinition {
  readonly id: ResourceType;
  readonly name: string;
  readonly symbol?: string;
  readonly meta?: Readonly<Record<string, unknown>>;
}

export class ResourceRegistry {
  private readonly defs = new Map<ResourceType, ResourceDefinition>();

  register(def: ResourceDefinition): this {
    if (this.defs.has(def.id)) throw new Error(`Resource '${def.id}' already registered`);
    this.defs.set(def.id, def);
    return this;
  }

  get(id: ResourceType): ResourceDefinition | undefined { return this.defs.get(id); }
  require(id: ResourceType): ResourceDefinition {
    const def = this.defs.get(id);
    if (!def) throw new Error(`Unknown resource: ${id}`);
    return def;
  }
  all(): ResourceDefinition[] { return [...this.defs.values()]; }
  ids(): ResourceType[] { return [...this.defs.keys()]; }
}
