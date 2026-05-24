import { Module } from '@nestjs/common';
import { GameStoreService } from './game-store.service.js';
import { SnapshotService } from './snapshot.service.js';
import { RedisModule } from './redis.module.js';

@Module({
  imports: [RedisModule],
  providers: [GameStoreService, SnapshotService],
  exports: [GameStoreService, SnapshotService],
})
export class PersistenceModule {}
