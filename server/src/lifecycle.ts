// server/src/lifecycle.ts
//
// LIFO (last-registered, first-stopped) shutdown handler manager.
//
// Usage:
//   const lifecycle = new Lifecycle();
//   lifecycle.onShutdown(() => outboxWorker.stop());   // stops first
//   lifecycle.onShutdown(() => redis.disconnect());     // stops second
//   lifecycle.onShutdown(() => dbAdapter.close());      // stops last
//
// This ordering matters: stop consumers before connections.

export type ShutdownHandler = () => void | Promise<void>;

export class Lifecycle {
  private handlers: ShutdownHandler[] = [];
  private shuttingDown = false;

  onShutdown(fn: ShutdownHandler): void {
    this.handlers.push(fn);
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
