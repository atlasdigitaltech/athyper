/** Round-robin admission for the worker's bounded native-parser capacity.
 * At most one active document per tenant; waiting work is abortable and bounded.
 */
export function createTenantWorkGate(limit = 1, maxWaiting = 64) {
  type Entry = { start: () => void; cancel: () => void };
  const queues = new Map<string, Entry[]>(), active = new Set<string>();
  let waiting = 0;
  function drain() {
    for (const [tenant, queue] of queues) {
      if (active.size >= limit) break;
      if (active.has(tenant)) continue;
      const entry = queue.shift()!;
      queues.delete(tenant);
      if (queue.length) queues.set(tenant, queue);
      waiting--; active.add(tenant); entry.start();
    }
  }
  return <T>(tenant: string, signal: AbortSignal, work: () => Promise<T>): Promise<T> => new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    if (waiting >= maxWaiting) { reject(new Error("Document processing capacity is busy; retry later")); return; }
    const entry: Entry = {
      cancel() {
        const queue = queues.get(tenant), index = queue?.indexOf(entry) ?? -1;
        if (index >= 0) { queue!.splice(index, 1); waiting--; if (!queue!.length) queues.delete(tenant); }
        reject(signal.reason ?? new Error("Document processing cancelled"));
      },
      start() {
        signal.removeEventListener("abort", entry.cancel);
        Promise.resolve().then(work).then(resolve, reject).finally(() => { active.delete(tenant); drain(); });
      },
    };
    const queue = queues.get(tenant) ?? []; queue.push(entry); queues.set(tenant, queue); waiting++;
    signal.addEventListener("abort", entry.cancel, { once: true }); drain();
  });
}
