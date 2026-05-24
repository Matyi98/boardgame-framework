import amqp, { ChannelModel, Channel } from 'amqplib';
import { Exchange } from './topology.js';

/**
 * Manages the AMQP connection + channel lifecycle. One per process. NestJS
 * apps inject this as a provider and re-use the same channel for publish and
 * consume.
 */
export class RabbitMQClient {
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;

  constructor(private readonly url: string) {}

  async connect(): Promise<void> {
    if (this.connection) return;
    this.connection = await amqp.connect(this.url);
    this.channel = await this.connection.createChannel();
    await this.assertTopology(this.channel);

    this.connection.on('close', () => {
      this.connection = null;
      this.channel = null;
    });
  }

  getChannel(): Channel {
    if (!this.channel) throw new Error('RabbitMQ not connected — call connect() first');
    return this.channel;
  }

  async close(): Promise<void> {
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
    this.channel = null;
    this.connection = null;
  }

  private async assertTopology(channel: Channel): Promise<void> {
    await channel.assertExchange(Exchange.GameCommands, 'topic', { durable: true });
    await channel.assertExchange(Exchange.GameEvents, 'topic', { durable: true });
    await channel.assertExchange(Exchange.LobbyEvents, 'topic', { durable: true });
  }
}
