import { Inventory } from './inventory.js';

/**
 * A shared pool of resources, e.g. the bank / supply. Different from a player
 * inventory only in name; same semantics. Modelled separately for clarity.
 */
export class ResourcePool extends Inventory {}
