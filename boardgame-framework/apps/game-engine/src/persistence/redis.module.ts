import { Global, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS = Symbol('REDIS');

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      useFactory: (config: ConfigService) => new Redis(config.get<string>('REDIS_URL') ?? 'redis://localhost:6379'),
      inject: [ConfigService],
    },
  ],
  exports: [REDIS],
})
export class RedisModule implements OnApplicationShutdown {
  // Nest can't inject a symbol via the constructor without a tag here; the
  // shutdown hook is provided by ioredis' own quit on process exit anyway.
  async onApplicationShutdown(): Promise<void> {
    // no-op; ioredis handles disconnect on SIGINT/SIGTERM
  }
}
