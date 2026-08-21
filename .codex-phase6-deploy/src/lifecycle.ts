// server/src/lifecycle.ts
//
// LIFO (last-registered, first-stopped) shutdown handler manager.
// Phase 1.3 addition: onReady() hook — runs all registered callbacks once
// all infrastructure is live (called at end of startApi / startWorker).
//
// Usage:
//   const lifecycle = new Lifecycle();
//   lifecycle.onShutdown(() => outboxWorker.stop());   // stops first
//   lifecycle.onShutdown(() => redis.disconnect());     // stops second
//   lifecycle.onShutdown(() => dbAdapter.close());      // stops last
//   lifecycle.onReady(() => myService.warmUp());        // called once server is live
//
// This ordering matters: stop consumers before connections.

export type ShutdownHandler = () => void | Promise<void>;
export type ReadyHandler    = () => void | Promise<void>;

export class Lifecycle {
  private handlers: ShutdownHandler[] = [];
  private readyHandlers: ReadyHandler[] = [];
  private shuttingDown = false;
  private ready = false;

  onShutdown(fn: ShutdownHandler): void {
    this.handlers.push(fn);
  }

  /**
   * Phase 1.3: Register a callback to run once the runtime is fully started.
   * If the lifecycle is already in the ready state (e.g. registered late),
   * the callback fires immediately.
   */
  onReady(fn: ReadyHandler): void {
    if (this.ready) {
      void Promise.resolve().then(fn);
      return;
    }
    this.readyHandlers.push(fn);
  }

  /**
   * Signal that all infrastructure is live. Fires all onReady callbacks
   * in registration order (FIFO — ready callbacks are not LIFO).
   * Called once by each runtime's startXxx() after the server begins listening.
   */
  async signalReady(): Promise<void> {
    if (this.ready) return;
    this.ready = true;
    for (const fn of this.readyHandlers) {
      try {
        await fn();
      } catch {
        // Ready callbacks must not block startup
      }
    }
  }

  async shutdown(_reason: string): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;

    // Reverse order: last-registered stops first
    for (const fn of [...this.handlers].reverse()) {
      try {
        await fn();
      } catch {
        // Don't throw during shutdown — the logger/audit caller decides whether to log
      }
    }
  }
}
