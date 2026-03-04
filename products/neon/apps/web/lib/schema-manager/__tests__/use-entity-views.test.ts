// @vitest-environment jsdom

/**
 * useEntityViews Hook Tests
 *
 * Tests fetch, save, default config fallback, error handling, and ETag tracking.
 */

import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { useEntityViews } from "../use-entity-views";

import type { ViewPreset } from "../use-entity-views";

// ============================================================================
// Test Helpers
// ============================================================================

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  (global as any).window = {
    __SESSION_BOOTSTRAP__: { csrfToken: "test-csrf-token" },
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
  mockFetch.mockReset();
});

function mockFetchSuccess(data: { views: ViewPreset[] }, etag = "etag-123") {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    headers: {
      get: (name: string) => (name === "ETag" ? etag : null),
    },
    json: async () => ({ data }),
  });
}

function mockFetch404() {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status: 404,
    headers: { get: () => null },
    json: async () => ({ error: { message: "Not found" } }),
  });
}

function mockFetchError(status = 500, message = "Internal error") {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    headers: { get: () => null },
    json: async () => ({ error: { message } }),
  });
}

// ============================================================================
// Tests
// ============================================================================

describe("useEntityViews", () => {
  it("should fetch config on mount", async () => {
    const views: ViewPreset[] = [
      {
        id: "view1",
        name: "All Fields",
        isDefault: true,
        columns: [],
        defaultSortDirection: "asc",
      },
    ];
    mockFetchSuccess({ views });

    const { result } = renderHook(() => useEntityViews("test_entity"));

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.config.views).toEqual(views);
    expect(result.current.error).toBeNull();
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/admin/mesh/meta-studio/test_entity/views",
      expect.objectContaining({
        headers: { "x-csrf-token": "test-csrf-token" },
      }),
    );
  });

  it("should extract ETag from response headers", async () => {
    mockFetchSuccess({ views: [] }, "custom-etag-789");

    const { result } = renderHook(() => useEntityViews("test_entity"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.etag).toBe("custom-etag-789");
  });

  it("should return default config on 404", async () => {
    mockFetch404();

    const { result } = renderHook(() => useEntityViews("test_entity"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.config.views.length).toBe(1);
    expect(result.current.config.views[0].id).toBe("default");
    expect(result.current.config.views[0].name).toBe("All Columns");
    expect(result.current.config.views[0].isDefault).toBe(true);
    expect(result.current.config.views[0].columns).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("should set error on non-404 failure", async () => {
    mockFetchError(500, "Server error");

    const { result } = renderHook(() => useEntityViews("test_entity"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toContain("Server error");
  });

  it("should handle network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network failure"));

    const { result } = renderHook(() => useEntityViews("test_entity"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toContain("Network failure");
  });

  it("should save config with PUT and If-Match header", async () => {
    const views: ViewPreset[] = [
      {
        id: "v1",
        name: "Default",
        isDefault: true,
        columns: [],
        defaultSortDirection: "asc",
      },
    ];
    mockFetchSuccess({ views }, "etag-initial");

    const { result } = renderHook(() => useEntityViews("test_entity"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Mock save response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: {
        get: (name: string) => (name === "ETag" ? "etag-updated" : null),
      },
      json: async () => ({ success: true }),
    });

    const newViews: ViewPreset[] = [
      {
        id: "v1",
        name: "Updated View",
        isDefault: true,
        columns: [
          { fieldName: "title", width: "medium", visible: true, sortOrder: 0 },
        ],
        defaultSortField: "title",
        defaultSortDirection: "desc",
      },
    ];

    const saveResult = await result.current.saveConfig(newViews);

    expect(saveResult.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/admin/mesh/meta-studio/test_entity/views",
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({
          "If-Match": "etag-initial",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ views: newViews }),
      }),
    );
  });

  it("should update config and etag after successful save", async () => {
    mockFetchSuccess({ views: [] }, "etag-1");

    const { result } = renderHook(() => useEntityViews("test_entity"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: {
        get: (name: string) => (name === "ETag" ? "etag-2" : null),
      },
      json: async () => ({ success: true }),
    });

    const newViews: ViewPreset[] = [
      {
        id: "preset1",
        name: "Preset 1",
        isDefault: true,
        columns: [],
        defaultSortDirection: "asc",
      },
    ];
    await result.current.saveConfig(newViews);

    await waitFor(() => {
      expect(result.current.config.views).toEqual(newViews);
      expect(result.current.etag).toBe("etag-2");
    });
  });

  it("should return conflict error on 409", async () => {
    mockFetchSuccess({ views: [] }, "etag-old");

    const { result } = renderHook(() => useEntityViews("test_entity"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      headers: { get: () => null },
      json: async () => ({
        success: false,
        error: { code: "CONFLICT", message: "Concurrent modification" },
      }),
    });

    const saveResult = await result.current.saveConfig([]);

    expect(saveResult.success).toBe(false);
    expect(saveResult.error?.code).toBe("CONFLICT");
  });

  it("should handle save network error", async () => {
    mockFetchSuccess({ views: [] });

    const { result } = renderHook(() => useEntityViews("test_entity"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    mockFetch.mockRejectedValueOnce(new Error("Save failed"));

    const saveResult = await result.current.saveConfig([]);

    expect(saveResult.success).toBe(false);
    expect(saveResult.error?.code).toBe("NETWORK_ERROR");
  });

  it("should call refresh to re-fetch", async () => {
    mockFetchSuccess({ views: [] });

    const { result } = renderHook(() => useEntityViews("test_entity"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    mockFetch.mockClear();
    mockFetchSuccess({
      views: [
        {
          id: "new",
          name: "New View",
          isDefault: true,
          columns: [],
          defaultSortDirection: "asc",
        },
      ],
    });

    result.current.refresh();

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.current.config.views.length).toBe(1);
    });
  });

  it("should abort previous request when entityName changes", async () => {
    mockFetchSuccess({ views: [] });

    const { result, rerender } = renderHook(
      ({ entityName }) => useEntityViews(entityName),
      { initialProps: { entityName: "entity_a" } },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    mockFetch.mockClear();
    mockFetchSuccess({ views: [] });

    rerender({ entityName: "entity_b" });

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
  });

  it("should cleanup abort controller on unmount", async () => {
    mockFetchSuccess({ views: [] });

    const { unmount } = renderHook(() => useEntityViews("test_entity"));

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());

    unmount();
    // No assertion needed — just ensure no errors thrown
  });
});
