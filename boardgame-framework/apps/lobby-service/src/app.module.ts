import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BusModule } from './bus/bus.module.js';
import { LobbyModule } from './lobby/lobby.module.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), BusModule, LobbyModule],
})
export class AppModule {}
