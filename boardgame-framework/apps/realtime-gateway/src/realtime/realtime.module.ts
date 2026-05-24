import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway.js';
import { RoomRegistryService } from './room-registry.service.js';
import { EventRelayService } from './event-relay.service.js';

@Module({
  providers: [RealtimeGateway, RoomRegistryService, EventRelayService],
})
export class RealtimeModule {}
