import { beforeEach, describe, expect, it } from "vitest";
import {
  clearMetadataCompatibilityFallbacks,
  readMetadataCompatibilityFallbacks,
  reportMetadataCompatibilityFallback,
} from "../compatibility-fallback";

describe("metadata compatibility fallback telemetry", () => {
  beforeEach(() => clearMetadataCompatibilityFallbacks());

  it("records every invocation for a fallback key", () => {
    const event = {
      area: "test",
      fieldName: "legacy_field",
      convention: "legacy convention",
      expectedMetadata: "explicit metadata",
    };

    reportMetadataCompatibilityFallback(event);
    reportMetadataCompatibilityFallback(event);

    expect(readMetadataCompatibilityFallbacks()).toEqual([
      expect.objectContaining({ ...event, count: 2 }),
    ]);
  });
});
