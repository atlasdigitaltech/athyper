import { describe, expect, it } from "vitest";
import { decodeKeysetCursor, encodeKeysetCursor, InvalidKeysetCursorError } from "../keyset-cursor.js";

describe("keyset cursor", () => {
  it("round-trips a signed opaque tuple", () => {
    const payload = { v: 1 as const, entity: "supplier", descriptorHash: "hash", sort: ["name:asc:last"], values: ["Acme"] };
    const cursor = encodeKeysetCursor(payload, "secret");
    expect(cursor).not.toContain("Acme");
    expect(decodeKeysetCursor(cursor, "secret")).toEqual(payload);
  });

  it("rejects tampering", () => {
    const cursor = encodeKeysetCursor({ v: 1, entity: "supplier", descriptorHash: "hash", sort: [], values: [] }, "secret");
    expect(() => decodeKeysetCursor(`${cursor}x`, "secret")).toThrow(InvalidKeysetCursorError);
  });
});
