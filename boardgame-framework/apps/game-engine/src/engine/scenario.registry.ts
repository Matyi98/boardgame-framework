import { Injectable, NotFoundException } from '@nestjs/common';
import type { Scenario } from '@bgf/game-core';

/**
 * Holds every Scenario the engine knows how to run. Game variants register
 * themselves at boot — see `engine.module.ts` for the registration point.
 *
 * Keeping the registry separate from the engine itself means new variants can
 * be added in their own packages without touching engine code.
 */
@Injectable()
export class ScenarioRegistry {
  private readonly scenarios = new Map<string, Scenario>();

  register(scenario: Scenario): void {
    if (this.scenarios.has(scenario.id)) {
      throw new Error(`Scenario already registered: ${scenario.id}`);
    }
    this.scenarios.set(scenario.id, scenario);
  }

  get(id: string): Scenario {
    const s = this.scenarios.get(id);
    if (!s) throw new NotFoundException(`Unknown scenario: ${id}`);
    return s;
  }

  list(): ReadonlyArray<Scenario> {
    return [...this.scenarios.values()];
  }
}
