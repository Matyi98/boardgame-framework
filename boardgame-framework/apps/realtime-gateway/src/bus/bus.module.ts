import { Global, Module, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BusConsumer, BusPublisher, RabbitMQClient } from '@bgf/event-bus';

@Global()
@Module({
  providers: [
    {
      provide: RabbitMQClient,
      useFactory: (config: ConfigService) => new RabbitMQClient(config.get<string>('RABBITMQ_URL') ?? 'amqp://localhost:5672'),
      inject: [ConfigService],
    },
    {
      provide: BusPublisher,
      useFactory: (client: RabbitMQClient) => new BusPublisher(client),
      inject: [RabbitMQClient],
    },
    {
      provide: BusConsumer,
      useFactory: (client: RabbitMQClient) => new BusConsumer(client),
      inject: [RabbitMQClient],
    },
  ],
  exports: [RabbitMQClient, BusPublisher, BusConsumer],
})
export class BusModule implements OnModuleInit, OnApplicationShutdown {
  constructor(private readonly client: RabbitMQClient) {}
  async onModuleInit(): Promise<void> { await this.client.connect(); }
  async onApplicationShutdown(): Promise<void> { await this.client.close(); }
}
