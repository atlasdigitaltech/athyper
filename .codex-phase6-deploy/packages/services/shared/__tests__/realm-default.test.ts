// server/packages/services/shared/__tests__/realm-default.test.ts
//
// Phase D unit tests — set-once semantics.

import { afterEach, describe, expect, it } from "vitest";

import {
  RealmDefaultKeyConflictError,
  __resetDefaultRealmKeyForTests,
  getDefaultRealmKey,
  setDefaultRealmKey,
} from "../realm-default.js";

afterEach(() => {
  __resetDefaultRealmKeyForTests();
});

describe("realm-default set-once semantics", () => {
  it("default value is athyper before any setter call", () => {
    expect(getDefaultRealmKey()).toBe("athyper");
  });

  it("first setter call locks the value", () => {
    setDefaultRealmKey("mesh-buyers");
    expect(getDefaultRealmKey()).toBe("mesh-buyers");
  });

  it("repeat call with the same value is a no-op (HMR-safe)", () => {
    setDefaultRealmKey("mesh-buyers");
    // Should NOT throw — HMR / dev-server reload triggers this every save.
    expect(() => setDefaultRealmKey("mesh-buyers")).not.toThrow();
    expect(getDefaultRealmKey()).toBe("mesh-buyers");
  });

  it("repeat call with a DIFFERENT value throws RealmDefaultKeyConflictError", () => {
    setDefaultRealmKey("mesh-buyers");
    expect(() => setDefaultRealmKey("admin-control")).toThrow(RealmDefaultKeyConflictError);
    // Value did NOT change despite the throw — defensive.
    expect(getDefaultRealmKey()).toBe("mesh-buyers");
  });

  it("empty string is ignored (matches forgiving behaviour during early boot)", () => {
    setDefaultRealmKey("");
    expect(getDefaultRealmKey()).toBe("athyper");
    // A real value after the no-op should still lock cleanly.
    setDefaultRealmKey("mesh-buyers");
    expect(getDefaultRealmKey()).toBe("mesh-buyers");
  });

  it("non-string is ignored (defensive against env-driven type errors)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setDefaultRealmKey(undefined as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setDefaultRealmKey(123 as any);
    expect(getDefaultRealmKey()).toBe("athyper");
  });

  it("error message names both values for triage", () => {
    setDefaultRealmKey("mesh-buyers");
    try {
      setDefaultRealmKey("admin-control");
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(RealmDefaultKeyConflictError);
      const message = (err as Error).message;
      expect(message).toContain("mesh-buyers");
      expect(message).toContain("admin-control");
    }
  });
});
