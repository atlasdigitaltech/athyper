/**
 * Meta Event Bus Implementation
 *
 * In-process notification bus for META Engine events.
 * Supports typed event subscriptions and wildcard listeners.
 * Subscriber errors are logged but never propagate to emitters.
 */

import type {
  MetaEvent,
  MetaEventBus,
  MetaEventHandler,
  MetaEventType,
} from "@athyper/core/meta";

export class MetaEventBusService implements MetaEventBus {
  private readonly handlers = new Map<MetaEventType, Set<MetaEventHandler>>();
  private readonly wildcardHandlers = new Set<MetaEventHandler>();

  on(eventType: MetaEventType, handler: MetaEventHandler): () => void {
    let set = this.handlers.get(eventType);
    if (!set) {
      set = new Set();
      this.handlers.set(eventType, set);
    }
    set.add(handler);

    return () => {
      set!.delete(handler);
      if (set!.size === 0) {
        this.handlers.delete(eventType);
      }
    };
  }

  onAny(handler: MetaEventHandler): () => void {
    this.wildcardHandlers.add(handler);
    return () => {
      this.wildcardHandlers.delete(handler);
    };
  }

  emit(event: MetaEvent): void {
    // Typed handlers
    const typed = this.handlers.get(event.type);
    if (typed) {
      for (const handler of typed) {
        this.safeCall(handler, event);
      }
    }

    // Wildcard handlers
    for (const handler of this.wildcardHandlers) {
      this.safeCall(handler, event);
    }
  }

  private safeCall(handler: MetaEventHandler, event: MetaEvent): void {
    try {
      const result = handler(event);
      // If handler returns a promise, catch async errors
      if (result && typeof result.catch === "function") {
        result.catch((err: unknown) => {
          console.error(JSON.stringify({
            msg: "meta_event_handler_async_error",
            eventType: event.type,
            error: String(err),
          }));
        });
      }
    } catch (err) {
      console.error(JSON.stringify({
        msg: "meta_event_handler_error",
        eventType: event.type,
        error: String(err),
      }));
    }
  }
}
