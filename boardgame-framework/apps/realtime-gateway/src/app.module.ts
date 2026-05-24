import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BusModule } from './bus/bus.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), BusModule, RealtimeModule],
})
export class AppModule {}
