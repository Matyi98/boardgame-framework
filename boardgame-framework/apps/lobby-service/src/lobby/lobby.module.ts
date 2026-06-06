import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { LobbyController } from './lobby.controller.js';
import { LobbyService } from './lobby.service.js';
import { MatchmakingService } from './matchmaking.service.js';
import { JwtStrategy } from '../auth/jwt.strategy.js';

@Module({
  imports: [PassportModule],
  controllers: [LobbyController],
  providers: [LobbyService, MatchmakingService, JwtStrategy],
  exports: [LobbyService],
})
export class LobbyModule {}
