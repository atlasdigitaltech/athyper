import type { DomainEvent, EventHandler } from "./domainEvent.js";

/**
 * In-memory event bus for domain events.
 * Supports pub/sub pattern within the runtime.
 */
export interface EventBus {
  publish<T>(event: DomainEvent<T>): Promise<void>;
  subscribe<T>(eventType: string, handler: EventHandler<T>): () => void;
}

export class InMemoryEventBus implements EventBus {
  private handlers = new Map<string, Set<EventHandler<any>>>();

  async publish<T>(event: DomainEvent<T>): Promise<void> {
    const handlers = this.handlers.get(event.eventType);
    if (!handlers) return;

    await Promise.all(
      Array.from(handlers).map((handler) => handler(event))
    );
  }

  subscribe<T>(eventType: string, handler: EventHandler<T>): () => void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }

    this.handlers.get(eventType)!.add(handler as EventHandler<any>);

    // Return unsubscribe function
    return () => {
      this.handlers.get(eventType)?.delete(handler as EventHandler<any>);
    };
  }
}
