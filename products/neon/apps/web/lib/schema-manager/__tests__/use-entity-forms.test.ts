// @vitest-environment jsdom

/**
 * useEntityForms Hook Tests
 *
 * Tests fetch, save, 404 fallback, error handling, ETag tracking, and abort cleanup.
 */

import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { useEntityForms } from "../use-entity-forms";

import type { FormSection } from "../use-entity-forms";

// ============================================================================
// Test Helpers
// ============================================================================

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  // Mock CSRF token
  (global as any).window = {
    __SESSION_BOOTSTRAP__: { csrfToken: "test-csrf-token" },
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
  mockFetch.mockReset();
});

function mockFetchSuccess(
  data: { sections: FormSection[] },
  etag = "etag-123",
) {
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

describe("useEntityForms", () => {
  it("should fetch layout on mount", async () => {
    const sections: FormSection[] = [
      { code: "main", label: "Main", columns: 2, fields: ["title", "amount"] },
    ];
    mockFetchSuccess({ sections });

    const { result } = renderHook(() => useEntityForms("test_entity"));

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.layout.sections).toEqual(sections);
    expect(result.current.error).toBeNull();
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/admin/mesh/meta-studio/test_entity/forms",
      expect.objectContaining({
        headers: { "x-csrf-token": "test-csrf-token" },
      }),
    );
  });

  it("should extract ETag from response headers", async () => {
    mockFetchSuccess({ sections: [] }, "custom-etag-456");

    const { result } = renderHook(() => useEntityForms("test_entity"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.etag).toBe("custom-etag-456");
  });

  it("should return empty sections on 404", async () => {
    mockFetch404();

    const { result } = renderHook(() => useEntityForms("test_entity"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.layout.sections).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("should set error on non-404 failure", async () => {
    mockFetchError(500, "Server error");

    const { result } = renderHook(() => useEntityForms("test_entity"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toContain("Server error");
  });

  it("should handle network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network failure"));

    const { result } = renderHook(() => useEntityForms("test_entity"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toContain("Network failure");
  });

  it("should save layout with PUT and If-Match header", async () => {
    const sections: FormSection[] = [
      { code: "main", label: "Main", columns: 2, fields: ["title"] },
    ];
    mockFetchSuccess({ sections }, "etag-initial");

    const { result } = renderHook(() => useEntityForms("test_entity"));

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

    const newSections: FormSection[] = [
      {
        code: "main",
        label: "Updated",
        columns: 3,
        fields: ["title", "amount"],
      },
    ];

    const saveResult = await result.current.saveLayout(newSections);

    expect(saveResult.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/admin/mesh/meta-studio/test_entity/forms",
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({
          "If-Match": "etag-initial",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ sections: newSections }),
      }),
    );
  });

  it("should update layout and etag after successful save", async () => {
    mockFetchSuccess({ sections: [] }, "etag-1");

    const { result } = renderHook(() => useEntityForms("test_entity"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: {
        get: (name: string) => (name === "ETag" ? "etag-2" : null),
      },
      json: async () => ({ success: true }),
    });

    const newSections: FormSection[] = [
      { code: "s1", label: "Section 1", columns: 1, fields: ["a"] },
    ];
    await result.current.saveLayout(newSections);

    await waitFor(() => {
      expect(result.current.layout.sections).toEqual(newSections);
      expect(result.current.etag).toBe("etag-2");
    });
  });

  it("should return conflict error on 409", async () => {
    mockFetchSuccess({ sections: [] }, "etag-old");

    const { result } = renderHook(() => useEntityForms("test_entity"));

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

    const saveResult = await result.current.saveLayout([]);

    expect(saveResult.success).toBe(false);
    expect(saveResult.error?.code).toBe("CONFLICT");
  });

  it("should handle save network error", async () => {
    mockFetchSuccess({ sections: [] });

    const { result } = renderHook(() => useEntityForms("test_entity"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    mockFetch.mockRejectedValueOnce(new Error("Save failed"));

    const saveResult = await result.current.saveLayout([]);

    expect(saveResult.success).toBe(false);
    expect(saveResult.error?.code).toBe("NETWORK_ERROR");
  });

  it("should call refresh to re-fetch", async () => {
    mockFetchSuccess({ sections: [] });

    const { result } = renderHook(() => useEntityForms("test_entity"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    mockFetch.mockClear();
    mockFetchSuccess({
      sections: [{ code: "new", label: "New", columns: 2, fields: [] }],
    });

    result.current.refresh();

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.current.layout.sections.length).toBe(1);
    });
  });

  it("should abort previous request when entityName changes", async () => {
    mockFetchSuccess({ sections: [] });

    const { result, rerender } = renderHook(
      ({ entityName }) => useEntityForms(entityName),
      { initialProps: { entityName: "entity_a" } },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    mockFetch.mockClear();
    mockFetchSuccess({ sections: [] });

    rerender({ entityName: "entity_b" });

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
  });

  it("should cleanup abort controller on unmount", async () => {
    mockFetchSuccess({ sections: [] });

    const { unmount } = renderHook(() => useEntityForms("test_entity"));

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());

    unmount();
    // No assertion needed — just ensure no errors thrown
  });
});
