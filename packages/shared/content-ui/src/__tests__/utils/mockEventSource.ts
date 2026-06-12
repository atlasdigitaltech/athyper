/**
 * Mock implementation of EventSource for jsdom.
 *
 * jsdom does not ship an EventSource implementation, so any hook that
 * subscribes to Server-Sent Events fails with `EventSource is not defined`
 * inside tests. This module exposes an `installInspectableEventSource()`
 * factory that test files call in `beforeEach`, which replaces
 * `globalThis.EventSource` with a class whose instances are recorded in
 * a registry. Tests then call `registry.instances[0].emitOpen()`,
 * `.emitMessage(type, payload)`, `.emitError()` to drive the hook
 * deterministically.
 *
 * Mirrors the `installInspectable*` pattern from `./mockObservers.ts`
 * — install per test, drive synthetic events, cleanup via `afterEach`.
 *
 * The default global `EventSource` left after each test is `undefined`,
 * matching the no-SSE branch in `useDocumentChangeStream` (which
 * exits the effect cleanly). This is preferable to a global inert
 * EventSource because the hook's branch under test is the
 * reconnect-after-error path; an inert version would never error.
 */

import { vi } from "vitest";

export interface InspectableEventSource {
  readonly url: string;
  readonly readyState: number;
  /** Test-only: synthesize an `open` event on the EventSource. */
  emitOpen(): void;
  /** Test-only: synthesize an `error` event (auto-closes the stream). */
  emitError(): void;
  /** Test-only: synthesize a named event with a JSON payload string. */
  emitMessage(type: string, data: string): void;
  /** Test-only: indicates `close()` has been called on this instance. */
  readonly closed: boolean;
  close(): void;
}

export interface InspectableEventSourceRegistry {
  /** All instances created since install. */
  readonly instances: ReadonlyArray<InspectableEventSource>;
  /** Restore the previous global (typically `undefined`). */
  cleanup(): void;
}

const CONNECTING = 0;
const OPEN = 1;
const CLOSED = 2;

interface ListenerMap {
  [type: string]: Array<(ev: unknown) => void>;
}

export function installInspectableEventSource(): InspectableEventSourceRegistry {
  const instances: InspectableEventSource[] = [];

  class MockEventSource implements InspectableEventSource {
    static readonly CONNECTING = CONNECTING;
    static readonly OPEN = OPEN;
    static readonly CLOSED = CLOSED;

    readonly url: string;
    readyState = CONNECTING;
    closed = false;

    onopen: ((ev: unknown) => void) | null = null;
    onerror: ((ev: unknown) => void) | null = null;
    onmessage: ((ev: unknown) => void) | null = null;

    private listeners: ListenerMap = {};

    constructor(url: string) {
      this.url = url;
      instances.push(this);
    }

    addEventListener(type: string, listener: (ev: unknown) => void): void {
      (this.listeners[type] ??= []).push(listener);
    }

    removeEventListener(type: string, listener: (ev: unknown) => void): void {
      const list = this.listeners[type];
      if (!list) return;
      const idx = list.indexOf(listener);
      if (idx >= 0) list.splice(idx, 1);
    }

    close(): void {
      this.closed = true;
      this.readyState = CLOSED;
    }

    // ── Test-only emitters ───────────────────────────────────────────────────
    emitOpen(): void {
      this.readyState = OPEN;
      this.onopen?.({ type: "open" });
      this.listeners["open"]?.forEach((l) => l({ type: "open" }));
    }

    emitError(): void {
      // Real EventSource transitions to CLOSED on terminal errors. The hook's
      // reconnect path keys off `readyState === CLOSED`, so set it before
      // dispatching so the handler observes the right state.
      this.readyState = CLOSED;
      this.onerror?.({ type: "error" });
      this.listeners["error"]?.forEach((l) => l({ type: "error" }));
    }

    emitMessage(type: string, data: string): void {
      const ev = { type, data } as unknown;
      this.listeners[type]?.forEach((l) => l(ev));
      if (type === "message") this.onmessage?.(ev);
    }
  }

  const previous = (globalThis as { EventSource?: unknown }).EventSource;
  vi.stubGlobal("EventSource", MockEventSource);

  return {
    instances,
    cleanup: () => {
      if (previous === undefined) {
        vi.unstubAllGlobals();
      } else {
        vi.stubGlobal("EventSource", previous);
      }
    },
  };
}
