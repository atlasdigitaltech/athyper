import { describe, expect, it } from "vitest";

import { formatRecordsServiceError } from "../meta-entity-records";

describe("formatRecordsServiceError", () => {
  it("exposes the upstream authorization code and message", () => {
    expect(formatRecordsServiceError(403, {
      error: "AUTH_CONTEXT_MISMATCH",
      message: "The requested work context is outside the verified tenant scope.",
    })).toBe(
      "Records service returned 403 (AUTH_CONTEXT_MISMATCH): The requested work context is outside the verified tenant scope.",
    );
  });

  it("keeps a safe generic fallback for non-JSON failures", () => {
    expect(formatRecordsServiceError(403, null)).toBe("Records service returned 403.");
  });
});
