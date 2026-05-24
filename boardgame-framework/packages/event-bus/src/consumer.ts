import type { ConsumeMessage } from 'amqplib';
import type { RabbitMQClient } from './rabbitmq.client.js';

export interface BusHandler<T = unknown> {
  (msg: T, raw: ConsumeMessage): Promise<void> | void;
}

export interface SubscribeOptions {
  exchange: string;
  routingKey: string;
  queue: string;
  /**
   * If true, the queue is exclusive to this consumer (good for per-process
   * fan-out where every gateway instance needs every message). If false, the
   * queue is shared (good for work-distribution between engine instances).
   */
  exclusive?: boolean;
}

export class BusConsumer {
  constructor(private readonly client: RabbitMQClient) {}

  async subscribe<T>(opts: SubscribeOptions, handler: BusHandler<T>): Promise<void> {
    const ch = this.client.getChannel();
    const q = await ch.assertQueue(opts.queue, {
      durable: !opts.exclusive,
      exclusive: !!opts.exclusive,
      autoDelete: !!opts.exclusive,
    });
    await ch.bindQueue(q.queue, opts.exchange, opts.routingKey);

    await ch.consume(q.queue, async (msg) => {
      if (!msg) return;
      try {
        const parsed = JSON.parse(msg.content.toString()) as T;
        await handler(parsed, msg);
        ch.ack(msg);
      } catch (err) {
        // Bad message — nack without requeue to avoid poison loops.
        // Real ops setups would route to a dead-letter exchange instead.
        ch.nack(msg, false, false);
        // eslint-disable-next-line no-console
        console.error('[bus-consumer] handler error', err);
      }
    });
  }
}
