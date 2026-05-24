import type { RabbitMQClient } from './rabbitmq.client.js';

export class BusPublisher {
  constructor(private readonly client: RabbitMQClient) {}

  publish<T = unknown>(exchange: string, routingKey: string, message: T): boolean {
    const buf = Buffer.from(JSON.stringify(message));
    return this.client.getChannel().publish(exchange, routingKey, buf, {
      contentType: 'application/json',
      persistent: true,
    });
  }
}
