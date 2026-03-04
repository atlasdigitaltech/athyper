/**
 * Graceful shutdown system
 * Ensures clean resource cleanup on termination
 */

export type ShutdownHook = () => Promise<void> | void;

export interface ShutdownOptions {
  /**
   * Timeout for graceful shutdown (milliseconds)
   */
  timeout: number;

  /**
   * Signals to handle
   */
  signals?: NodeJS.Signals[];
}

export const DEFAULT_SHUTDOWN_OPTIONS: ShutdownOptions = {
  timeout: 30000, // 30 seconds
  signals: ["SIGTERM", "SIGINT"],
};

/**
 * Graceful shutdown manager
 */
export class GracefulShutdown {
  private hooks: Array<{ name: string; hook: ShutdownHook; priority: number }> = [];
  private isShuttingDown = false;
  private shutdownPromise?: Promise<void>;

  /**
   * Register a shutdown hook
   * @param name - Hook name for logging
   * @param hook - Async function to execute on shutdown
   * @param priority - Lower numbers execute first (default: 100)
   */
  register(name: string, hook: ShutdownHook, priority: number = 100): void {
    this.hooks.push({ name, hook, priority });
    // Sort by priority (lower first)
    this.hooks.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Unregister a shutdown hook
   */
  unregister(name: string): void {
    this.hooks = this.hooks.filter((h) => h.name !== name);
  }

  /**
   * Execute shutdown sequence
   */
  async shutdown(reason: string, timeout: number = DEFAULT_SHUTDOWN_OPTIONS.timeout): Promise<void> {
    if (this.isShuttingDown) {
      console.log(JSON.stringify({ msg: "shutdown_already_in_progress" }));
      return this.shutdownPromise;
    }

    this.isShuttingDown = true;
    console.log(JSON.stringify({ msg: "shutdown_starting", reason, hooks: this.hooks.length }));

    this.shutdownPromise = this.executeShutdown(timeout);
    return this.shutdownPromise;
  }

  /**
   * Internal shutdown execution
   */
  private async executeShutdown(timeout: number): Promise<void> {
    const timeoutPromise = new Promise<void>((resolve) =>
      setTimeout(() => {
        console.error(JSON.stringify({ msg: "shutdown_timeout_exceeded", timeout }));
        resolve();
      }, timeout)
    );

    const shutdownPromise = (async () => {
      for (const { name, hook } of this.hooks) {
        try {
          const start = Date.now();
          console.log(JSON.stringify({ msg: "shutdown_hook_start", name }));

          await hook();

          const duration = Date.now() - start;
          console.log(JSON.stringify({ msg: "shutdown_hook_complete", name, duration }));
        } catch (error) {
          console.error(
            JSON.stringify({
              msg: "shutdown_hook_error",
              name,
              error: error instanceof Error ? error.message : String(error),
            })
          );
        }
      }
    })();

    await Promise.race([shutdownPromise, timeoutPromise]);

    console.log(JSON.stringify({ msg: "shutdown_complete" }));
  }

  /**
   * Check if shutdown is in progress
   */
  isShutdownInProgress(): boolean {
    return this.isShuttingDown;
  }

  /**
   * Install signal handlers
   */
  installSignalHandlers(options: ShutdownOptions = DEFAULT_SHUTDOWN_OPTIONS): void {
    const signals = options.signals ?? DEFAULT_SHUTDOWN_OPTIONS.signals ?? [];

    for (const signal of signals) {
      process.once(signal, () => {
        console.log(JSON.stringify({ msg: "shutdown_signal_received", signal }));
        void this.shutdown(signal, options.timeout).then(() => {
          process.exit(0);
        });
      });
    }
  }

  /**
   * Get registered hooks
   */
  getHooks(): Array<{ name: string; priority: number }> {
    return this.hooks.map((h) => ({ name: h.name, priority: h.priority }));
  }
}
