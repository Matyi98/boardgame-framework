import { Module, OnModuleInit } from '@nestjs/common';
import { demoScenario, kingdomsScenario } from '@bgf/game-core';
import { EngineService } from './engine.service.js';
import { GameRunnerService } from './game-runner.service.js';
import { ScenarioRegistry } from './scenario.registry.js';
import { PersistenceModule } from '../persistence/persistence.module.js';

@Module({
  imports: [PersistenceModule],
  providers: [EngineService, GameRunnerService, ScenarioRegistry],
  // Re-export PersistenceModule so MessagingModule (which imports EngineModule)
  // can also inject GameStoreService into GamesController without a separate import.
  exports: [EngineService, GameRunnerService, ScenarioRegistry, PersistenceModule],
})
export class EngineModule implements OnModuleInit {
  constructor(private readonly scenarios: ScenarioRegistry) {}

  /** Register built-in scenarios once NestJS has wired all providers. */
  onModuleInit(): void {
    this.scenarios.register(demoScenario);
    this.scenarios.register(kingdomsScenario);
  }
}
