/**
 * Capability-neutral pub/sub port.
 * Implementations: adapters/cache/redis.
 * Use for descriptor-cache invalidation signals and real-time fan-out.
 */
export type MessageHandler = (channel: string, message: string) => void;

export interface PubSub {
  publish(channel: string, message: string): Promise<number>;
  subscribe(channel: string, handler: MessageHandler): Promise<void>;
  unsubscribe(channel: string): Promise<void>;
  /**
   * Pattern-based subscription (PSUBSCRIBE semantics).
   * Pattern may contain * and ? glob wildcards.
   */
  psubscribe(pattern: string, handler: MessageHandler): Promise<void>;
  punsubscribe(pattern: string): Promise<void>;
}
