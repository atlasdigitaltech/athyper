export type ShutdownHandler = () => void | Promise<void>;
export type ReadyHandler = () => void | Promise<void>;

/** Coordinates process readiness and idempotent LIFO shutdown. */
export class LifecycleManager {
  private readonly shutdownHandlers: ShutdownHandler[] = [];
  private readonly readyHandlers: ReadyHandler[] = [];
  private shuttingDown = false;
  private ready = false;

  onShutdown(handler: ShutdownHandler): void {
    this.shutdownHandlers.push(handler);
  }

  onReady(handler: ReadyHandler): void {
    if (this.ready) {
      void Promise.resolve().then(handler).catch(() => undefined);
      return;
    }
    this.readyHandlers.push(handler);
  }

  /** Critical hosts can fail startup when an initialization hook fails. */
  async signalReady(options: { readonly failOnError?: boolean } = {}): Promise<void> {
    if (this.ready) return;
    this.ready = true;
    const failures: unknown[] = [];
    for (const handler of this.readyHandlers) {
      try {
        await handler();
      } catch (error) {
        failures.push(error);
      }
    }
    if (options.failOnError && failures.length) throw new AggregateError(failures, "Startup initialization failed");
  }

  async shutdown(_reason: string): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    for (const handler of [...this.shutdownHandlers].reverse()) {
      try {
        await handler();
      } catch {
        // The process-level caller owns shutdown logging and exit policy.
      }
    }
  }
}

export function createLifecycle(): LifecycleManager {
  return new LifecycleManager();
}
