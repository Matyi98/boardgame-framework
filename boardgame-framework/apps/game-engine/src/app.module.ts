import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BusModule } from './bus/bus.module.js';
import { EngineModule } from './engine/engine.module.js';
import { PersistenceModule } from './persistence/persistence.module.js';
import { MessagingModule } from './messaging/messaging.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BusModule,
    PersistenceModule,
    EngineModule,
    MessagingModule,
  ],
})
export class AppModule {}
