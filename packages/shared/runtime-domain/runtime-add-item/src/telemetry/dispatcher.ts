import type { AddItemTelemetryEvent, TelemetryListener } from "./events";

// ─────────────────────────────────────────────────────────────────────────────
// TelemetryDispatcher — central fan-out so the registry and controller don't
// reference each other for event delivery. Listeners are added/removed
// explicitly; apps wire one listener that bridges to GlitchTip / Sentry.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Distributive Omit — preserves the discriminated-union shape so callers can
 * pass `{ type: "adapter.register", adapterId, version }` without TS
 * collapsing the union to its common keys.
 */
type DistributiveOmit<T, K extends keyof never> = T extends unknown
  ? Omit<T, K>
  : never;

export type TelemetryEventInput = DistributiveOmit<AddItemTelemetryEvent, "seq" | "at">;

export class TelemetryDispatcher {
  private listeners = new Set<TelemetryListener>();
  private seq = 0;

  /** Add a listener. Returns an unsubscribe function. */
  subscribe(listener: TelemetryListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Emit an event. Auto-stamps `seq` and `at`. */
  emit(event: TelemetryEventInput): void {
    this.seq += 1;
    const stamped = {
      ...event,
      seq: this.seq,
      at: Date.now(),
    } as AddItemTelemetryEvent;
    for (const listener of this.listeners) {
      try {
        listener(stamped);
      } catch (err) {
        // Telemetry listeners must never throw upstream — log and move on.
        // eslint-disable-next-line no-console
        console.error("[runtime-add-item] telemetry listener threw", err);
      }
    }
  }

  /** Total events emitted since construction. Useful for test assertions. */
  get count(): number {
    return this.seq;
  }
}
