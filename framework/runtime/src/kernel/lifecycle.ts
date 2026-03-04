// framework/runtime/kernel/lifecycle.ts
export type ShutdownHandler = () => void | Promise<void>;

export class Lifecycle {
    private shutdownHandlers: ShutdownHandler[] = [];
    private shuttingDown = false;

    onShutdown(fn: ShutdownHandler) {
        this.shutdownHandlers.push(fn);
    }

    async shutdown(_reason: string) {
        if (this.shuttingDown) return;
        this.shuttingDown = true;

        // Run in reverse order (LIFO) so last-started stops first
        for (const fn of [...this.shutdownHandlers].reverse()) {
            try {
                await fn();
            } catch {
                // Avoid throwing during shutdown; logger/audit will capture if available
            }
        }
    }
}