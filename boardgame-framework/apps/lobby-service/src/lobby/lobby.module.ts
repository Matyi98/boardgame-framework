import { Module } from '@nestjs/common';
import { LobbyController } from './lobby.controller.js';
import { LobbyService } from './lobby.service.js';
import { MatchmakingService } from './matchmaking.service.js';

@Module({
  controllers: [LobbyController],
  providers: [LobbyService, MatchmakingService],
  exports: [LobbyService],
})
export class LobbyModule {}
