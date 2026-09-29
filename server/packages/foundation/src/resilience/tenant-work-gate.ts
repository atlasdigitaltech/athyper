/** Round-robin admission for bounded, capacity-limited work such as native parsers.
 * At most one active item per tenant; waiting work is abortable and bounded.
 */
export type TenantWorkGate = <T>(
  tenant: string,
  signal: AbortSignal,
  work: () => Promise<T>,
) => Promise<T>;

interface WaitingEntry {
  start(): void;
  cancel(): void;
}

export function createTenantWorkGate(limit = 1, maxWaiting = 64): TenantWorkGate {
  const queues = new Map<string, WaitingEntry[]>();
  const active = new Set<string>();
  let waiting = 0;

  function drain(): void {
    for (const [tenant, queue] of queues) {
      if (active.size >= limit) break;
      if (active.has(tenant)) continue;
      const entry = queue.shift()!;
      queues.delete(tenant);
      if (queue.length) queues.set(tenant, queue);
      waiting--;
      active.add(tenant);
      entry.start();
    }
  }

  return <T>(tenant: string, signal: AbortSignal, work: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      if (signal.aborted) {
        reject(signal.reason);
        return;
      }
      if (waiting >= maxWaiting) {
        reject(new Error("Tenant work capacity is busy; retry later"));
        return;
      }
      const entry: WaitingEntry = {
        cancel() {
          const queue = queues.get(tenant);
          const index = queue?.indexOf(entry) ?? -1;
          if (queue && index >= 0) {
            queue.splice(index, 1);
            waiting--;
            if (!queue.length) queues.delete(tenant);
          }
          reject(signal.reason ?? new Error("Tenant work cancelled"));
        },
        start() {
          signal.removeEventListener("abort", entry.cancel);
          Promise.resolve()
            .then(work)
            .then(resolve, reject)
            .finally(() => {
              active.delete(tenant);
              drain();
            });
        },
      };
      const queue = queues.get(tenant) ?? [];
      queue.push(entry);
      queues.set(tenant, queue);
      waiting++;
      signal.addEventListener("abort", entry.cancel, { once: true });
      drain();
    });
}
