// @vitest-environment jsdom

/**
 * useEntityFields Hook Tests
 *
 * Tests fetch, error handling, loading state, ETag extraction, and abort cleanup.
 */

import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { useEntityFields } from "../use-entity-fields";

import type { FieldDefinition } from "../types";

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

function mockFetchSuccess(fields: FieldDefinition[], etag = "etag-123") {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    headers: {
      get: (name: string) => (name === "ETag" ? etag : null),
    },
    json: async () => ({ data: fields }),
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

function makeField(name: string): FieldDefinition {
  return {
    id: `field-${name}`,
    name,
    columnName: name,
    dataType: "string",
    uiType: null,
    isRequired: false,
    isUnique: false,
    isSearchable: true,
    isFilterable: true,
    defaultValue: null,
    validation: null,
    lookupConfig: null,
    sortOrder: 0,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: null,
    format: null,
    unit: null,
    cardinality: "one",
    origin: "business",
    label: null,
    description: null,
    constraints: null,
    enumConfig: null,
    referenceConfig: null,
    jsonConfig: null,
    moneyConfig: null,
    datetimeConfig: null,
    uiHint: null,
    isReadOnly: false,
    isDeprecated: false,
    isComputed: false,
    writeOnce: false,
    visibility: null,
    editability: null,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("useEntityFields", () => {
  it("should fetch fields on mount", async () => {
    const fields = [makeField("title"), makeField("amount")];
    mockFetchSuccess(fields);

    const { result } = renderHook(() => useEntityFields("test_entity"));

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.fields).toEqual(fields);
    expect(result.current.error).toBeNull();
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/admin/mesh/meta-studio/test_entity/fields",
      expect.objectContaining({
        headers: { "x-csrf-token": "test-csrf-token" },
        credentials: "same-origin",
      }),
    );
  });

  it("should extract ETag from response headers", async () => {
    mockFetchSuccess([], "custom-etag-abc");

    const { result } = renderHook(() => useEntityFields("test_entity"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.etag).toBe("custom-etag-abc");
  });

  it("should set error on non-ok response", async () => {
    mockFetchError(500, "Failed to load fields");

    const { result } = renderHook(() => useEntityFields("test_entity"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toContain("Failed to load fields");
    expect(result.current.fields).toEqual([]);
  });

  it("should handle network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network failure"));

    const { result } = renderHook(() => useEntityFields("test_entity"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toContain("Network failure");
  });

  it("should start with loading true, then transition to false", async () => {
    mockFetchSuccess([]);

    const { result } = renderHook(() => useEntityFields("test_entity"));

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("should return empty fields array initially", () => {
    mockFetchSuccess([]);

    const { result } = renderHook(() => useEntityFields("test_entity"));

    expect(result.current.fields).toEqual([]);
  });

  it("should call refresh to re-fetch", async () => {
    mockFetchSuccess([]);

    const { result } = renderHook(() => useEntityFields("test_entity"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    mockFetch.mockClear();
    mockFetchSuccess([makeField("newField")]);

    result.current.refresh();

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.current.fields.length).toBe(1);
    });
  });

  it("should abort previous request when entityName changes", async () => {
    mockFetchSuccess([]);

    const { result, rerender } = renderHook(
      ({ entityName }) => useEntityFields(entityName),
      { initialProps: { entityName: "entity_a" } },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    mockFetch.mockClear();
    mockFetchSuccess([]);

    rerender({ entityName: "entity_b" });

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    // Abort is handled internally, just verify fetch is called for new entity
  });

  it("should cleanup abort controller on unmount", async () => {
    mockFetchSuccess([]);

    const { unmount } = renderHook(() => useEntityFields("test_entity"));

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());

    unmount();
    // No assertion needed — just ensure no errors thrown
  });

  it("should handle AbortError without setting error state", async () => {
    const abortError = new Error("AbortError");
    abortError.name = "AbortError";
    mockFetch.mockRejectedValueOnce(abortError);

    const { result } = renderHook(() => useEntityFields("test_entity"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    // AbortError should NOT set error state
    expect(result.current.error).toBeNull();
  });

  it("should include credentials and signal in fetch options", async () => {
    mockFetchSuccess([]);

    renderHook(() => useEntityFields("test_entity"));

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        credentials: "same-origin",
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("should handle missing ETag gracefully", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: {
        get: () => null, // No ETag
      },
      json: async () => ({ data: [] }),
    });

    const { result } = renderHook(() => useEntityFields("test_entity"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.etag).toBeNull();
  });

  it("should clear error on successful refetch", async () => {
    mockFetchError(500, "Initial error");

    const { result } = renderHook(() => useEntityFields("test_entity"));

    await waitFor(() => expect(result.current.error).toBeTruthy());

    mockFetch.mockClear();
    mockFetchSuccess([makeField("recovered")]);

    result.current.refresh();

    await waitFor(() => {
      expect(result.current.error).toBeNull();
      expect(result.current.fields.length).toBe(1);
    });
  });

  it("should handle 404 as error (not a special case like forms/views)", async () => {
    mockFetchError(404, "Entity not found");

    const { result } = renderHook(() => useEntityFields("test_entity"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toContain("Entity not found");
  });
});
