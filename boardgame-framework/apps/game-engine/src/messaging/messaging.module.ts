import { Module } from '@nestjs/common';
import { GamesController } from './games.controller.js';
import { EngineModule } from '../engine/engine.module.js';

@Module({
  imports: [EngineModule],
  controllers: [GamesController],
})
export class MessagingModule {}
