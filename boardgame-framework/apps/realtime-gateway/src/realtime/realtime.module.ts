import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { RealtimeGateway } from './realtime.gateway.js';
import { RoomRegistryService } from './room-registry.service.js';
import { EventRelayService } from './event-relay.service.js';

@Module({
  // JwtModule registered without a secret here — the gateway reads the secret
  // from ConfigService at runtime (verify() call passes the secret explicitly).
  imports: [JwtModule.register({})],
  providers: [RealtimeGateway, RoomRegistryService, EventRelayService],
})
export class RealtimeModule {}
