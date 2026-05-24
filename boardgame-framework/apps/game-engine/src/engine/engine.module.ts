import { Module } from '@nestjs/common';
import { EngineService } from './engine.service.js';
import { GameRunnerService } from './game-runner.service.js';
import { ScenarioRegistry } from './scenario.registry.js';

@Module({
  providers: [EngineService, GameRunnerService, ScenarioRegistry],
  exports: [EngineService, GameRunnerService, ScenarioRegistry],
})
export class EngineModule {}
