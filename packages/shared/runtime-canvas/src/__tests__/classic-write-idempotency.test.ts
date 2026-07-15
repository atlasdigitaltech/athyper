import { describe, expect, it, vi } from "vitest";
import {
  completeClassicWriteAttempt,
  createClassicWriteSignature,
  resolveClassicWriteAttempt,
} from "../edit/classic-write-idempotency";

describe("classic PATCH idempotency", () => {
  it("reuses one stable key for an ambiguous retry of the same write", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "attempt-1" });
    const attempts = new Map();
    const signature = createClassicWriteSignature({
      entityCode: "supplier",
      recordId: "supplier-1",
      expectedVersion: "7",
      data: { name: "Updated", code: "S1" },
    });
    const reordered = createClassicWriteSignature({
      entityCode: "supplier",
      recordId: "supplier-1",
      expectedVersion: "7",
      data: { code: "S1", name: "Updated" },
    });

    expect(reordered).toBe(signature);
    expect(resolveClassicWriteAttempt(attempts, signature)).toEqual({
      idempotencyKey: "classic-patch:attempt-1",
    });
    expect(resolveClassicWriteAttempt(attempts, signature).idempotencyKey).toBe("classic-patch:attempt-1");
    vi.unstubAllGlobals();
  });

  it("creates a new attempt after a committed response", () => {
    const attempts = new Map();
    const signature = createClassicWriteSignature({
      entityCode: "supplier",
      recordId: "supplier-1",
      expectedVersion: "7",
      data: { name: "Updated" },
    });
    const first = resolveClassicWriteAttempt(attempts, signature);
    completeClassicWriteAttempt(attempts, signature);
    const second = resolveClassicWriteAttempt(attempts, signature);
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey);
  });

  it("uses a distinct signature when the version or mutation changes", () => {
    const base = {
      entityCode: "supplier",
      recordId: "supplier-1",
      expectedVersion: "7",
      data: { name: "Updated" },
    };
    expect(createClassicWriteSignature(base)).not.toBe(createClassicWriteSignature({
      ...base,
      expectedVersion: "8",
    }));
    expect(createClassicWriteSignature(base)).not.toBe(createClassicWriteSignature({
      ...base,
      data: { name: "Different" },
    }));
  });
});
