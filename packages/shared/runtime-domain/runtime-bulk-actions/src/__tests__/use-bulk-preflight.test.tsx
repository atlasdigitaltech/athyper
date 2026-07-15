import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { RuntimeBulkActionsProvider } from "../provider";
import { useBulkPreflight } from "../use-bulk-preflight";
import type { BulkClient } from "../types";
import type { BulkPreflightResult } from "@athyper/api-contracts/entity-list";

function makeClient(): BulkClient & { preflightSpy: ReturnType<typeof vi.fn> } {
  const preflightSpy = vi.fn(async (_entity: string, body: { action: string }) => {
    const result: BulkPreflightResult = {
      action: body.action,
      total: 3,
      eligible: 3,
      skipped: 0,
      denied: 0,
      requiresWorkflow: 0,
      canProceed: true,
      records: [],
    };
    return result;
  });
  return {
    preflight: preflightSpy,
    action:    vi.fn(),
    preflightSpy,
  };
}

function wrap(client: BulkClient, overrides?: { maxIds?: number; preflightCap?: number }) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <RuntimeBulkActionsProvider
        config={{
          bulkClient: client,
          preflightDebounce: 0,
          maxIds:       overrides?.maxIds,
          preflightCap: overrides?.preflightCap,
        }}
      >
        {children}
      </RuntimeBulkActionsProvider>
    );
  };
}

describe("useBulkPreflight", () => {
  it("returns INITIAL state when ids is empty", () => {
    const client = makeClient();
    const { result } = renderHook(
      () => useBulkPreflight({ entityCode: "po", ids: [], actionCodes: ["submit"] }),
      { wrapper: wrap(client) },
    );
    expect(result.current.loading).toBe(false);
    expect(client.preflightSpy).not.toHaveBeenCalled();
  });

  it("sets overCap when ids exceeds maxIds and makes NO network call", async () => {
    const client = makeClient();
    const ids = Array.from({ length: 6 }, (_, i) => String(i));
    const { result } = renderHook(
      () => useBulkPreflight({ entityCode: "po", ids, actionCodes: ["submit"] }),
      { wrapper: wrap(client, { maxIds: 5 }) },
    );
    await waitFor(() => expect(result.current.overCap).toBe(true));
    expect(result.current.loading).toBe(false);
    expect(client.preflightSpy).not.toHaveBeenCalled();
  });

  it("sets deferred when ids exceeds preflightCap and makes NO network call", async () => {
    const client = makeClient();
    const ids = Array.from({ length: 50 }, (_, i) => String(i));
    const { result } = renderHook(
      () => useBulkPreflight({ entityCode: "po", ids, actionCodes: ["submit"] }),
      { wrapper: wrap(client, { preflightCap: 20 }) },
    );
    await waitFor(() => expect(result.current.deferred).toBe(true));
    expect(client.preflightSpy).not.toHaveBeenCalled();
  });

  it("fires one request per actionCode and populates preflightMap", async () => {
    const client = makeClient();
    const { result } = renderHook(
      () => useBulkPreflight({
        entityCode: "po",
        ids: ["a", "b"],
        actionCodes: ["submit", "approve"],
      }),
      { wrapper: wrap(client) },
    );
    await waitFor(() => {
      expect(result.current.preflightMap.submit).toBeTruthy();
      expect(result.current.preflightMap.approve).toBeTruthy();
    });
    expect(client.preflightSpy).toHaveBeenCalledTimes(2);
  });

  it("hits cache on second render with same ids — no second network call", async () => {
    const client = makeClient();
    const { result, rerender } = renderHook(
      ({ ids }: { ids: string[] }) =>
        useBulkPreflight({ entityCode: "po", ids, actionCodes: ["submit"] }),
      { wrapper: wrap(client), initialProps: { ids: ["a", "b"] } },
    );
    await waitFor(() => {
      expect(result.current.preflightMap.submit).toBeTruthy();
    });
    expect(client.preflightSpy).toHaveBeenCalledTimes(1);

    // Force a re-render with the same ids reference value (different array).
    rerender({ ids: ["b", "a"] }); // different order — same sorted key
    await waitFor(() => {
      expect(result.current.preflightMap.submit).toBeTruthy();
    });
    expect(client.preflightSpy).toHaveBeenCalledTimes(1); // cache hit
  });

  it("refires when ids actually change", async () => {
    const client = makeClient();
    const { result, rerender } = renderHook(
      ({ ids }: { ids: string[] }) =>
        useBulkPreflight({ entityCode: "po", ids, actionCodes: ["submit"] }),
      { wrapper: wrap(client), initialProps: { ids: ["a"] } },
    );
    await waitFor(() => expect(result.current.preflightMap.submit).toBeTruthy());
    expect(client.preflightSpy).toHaveBeenCalledTimes(1);

    rerender({ ids: ["a", "b", "c"] });
    await waitFor(() => expect(client.preflightSpy).toHaveBeenCalledTimes(2));
  });

  it("drops stale responses when selection changes mid-flight", async () => {
    let resolveFirst: (v: BulkPreflightResult) => void = () => {};
    const slowClient: BulkClient = {
      preflight: vi.fn((_entity, body) => {
        if (body.action === "submit") {
          return new Promise<BulkPreflightResult>((r) => { resolveFirst = r; });
        }
        return Promise.resolve({
          action: body.action, total: 1, eligible: 1, skipped: 0, denied: 0,
          requiresWorkflow: 0, canProceed: true, records: [],
        } as BulkPreflightResult);
      }),
      action: vi.fn(),
    };

    const { result, rerender } = renderHook(
      ({ ids }: { ids: string[] }) =>
        useBulkPreflight({ entityCode: "po", ids, actionCodes: ["submit"] }),
      { wrapper: wrap(slowClient), initialProps: { ids: ["a"] } },
    );

    // Switch selection while the first request is still in flight.
    rerender({ ids: ["b"] });

    // Now resolve the first (stale) request with a marker value.
    await act(async () => {
      resolveFirst({
        action: "submit", total: 999, eligible: 999, skipped: 0, denied: 0,
        requiresWorkflow: 0, canProceed: true, records: [],
      });
      await new Promise((r) => setTimeout(r, 10));
    });

    // The stale total=999 must NOT appear in state.
    expect(result.current.preflightMap.submit?.total).not.toBe(999);
  });
});
