import { EventEmitter } from "node:events";
import type pg from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPostgresNotificationListener } from "../index.js";

class FakeClient extends EventEmitter {
  readonly connect = vi.fn<() => Promise<void>>(async () => undefined);
  readonly query = vi.fn(async () => ({ rows: [] }));
  readonly end = vi.fn(async () => undefined);
}

afterEach(() => vi.useRealTimers());

describe("PostgreSQL invalidation listener",()=>{
  it("requires an explicit direct session and safe channel",()=>{expect(()=>createPostgresNotificationListener({connectionString:"postgres://localhost/db",channel:"bad-channel",connectionMode:"direct"})).toThrow("channel");expect(()=>createPostgresNotificationListener({connectionString:"postgres://localhost/db",channel:"athyper_invalidation",connectionMode:"transaction" as "direct"})).toThrow("direct PostgreSQL");});

  it("closes a failed client once across error/end races and repeated reconnects", async () => {
    vi.useFakeTimers();
    const clients: FakeClient[] = [];
    const reconnected = vi.fn();
    const listener = createPostgresNotificationListener({ connectionString: "postgres://localhost/db", channel: "athyper_invalidation", connectionMode: "direct", reconnectMinMs: 100, reconnectMaxMs: 100, createClient: () => { const client = new FakeClient(); clients.push(client); return client as unknown as pg.Client; } });
    await listener.start(vi.fn(), reconnected);
    clients[0]!.emit("error", new Error("lost"));
    clients[0]!.emit("end");
    await vi.advanceTimersByTimeAsync(100);
    expect(clients).toHaveLength(2);
    expect(clients[0]!.end).toHaveBeenCalledOnce();
    expect(reconnected).toHaveBeenCalledOnce();
    clients[1]!.emit("end");
    await vi.advanceTimersByTimeAsync(100);
    expect(clients).toHaveLength(3);
    await listener.close();
    clients[2]!.emit("error", new Error("late"));
    await vi.advanceTimersByTimeAsync(500);
    expect(clients).toHaveLength(3);
  });

  it("shuts down safely while connection establishment is in flight", async () => {
    let release!: () => void;
    const client = new FakeClient();
    client.connect.mockImplementation(() => new Promise<void>((resolve) => { release = resolve; }));
    const listener = createPostgresNotificationListener({ connectionString: "postgres://localhost/db", channel: "athyper_invalidation", connectionMode: "direct", createClient: () => client as unknown as pg.Client });
    const starting = listener.start(vi.fn(), vi.fn());
    const closing = listener.close();
    release();
    await Promise.all([starting, closing]);
    expect(client.query).not.toHaveBeenCalled();
    expect(client.end).toHaveBeenCalledOnce();
  });
});
