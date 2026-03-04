import { describe, expect, it } from "vitest";

import { avatarColorFromUserId, AVATAR_FALLBACK } from "../avatar-color";

describe("avatarColorFromUserId", () => {
  it("returns consistent color for the same userId", () => {
    const a = avatarColorFromUserId("user-abc-123");
    const b = avatarColorFromUserId("user-abc-123");
    expect(a).toEqual(b);
  });

  it("returns different token indices for different userIds", () => {
    const ids = [
      "user-001",
      "user-002",
      "user-003",
      "user-004",
      "user-005",
      "user-006",
      "user-007",
      "user-008",
    ];
    const indices = ids.map((id) => avatarColorFromUserId(id).tokenIndex);
    // At least 3 distinct colors out of 8 different IDs
    const unique = new Set(indices);
    expect(unique.size).toBeGreaterThanOrEqual(3);
  });

  it("returns a valid tokenIndex between 0 and 11", () => {
    const testIds = ["a", "bb", "ccc", "dddd", "eeeee", "ffffff"];
    for (const id of testIds) {
      const { tokenIndex } = avatarColorFromUserId(id);
      expect(tokenIndex).toBeGreaterThanOrEqual(0);
      expect(tokenIndex).toBeLessThanOrEqual(11);
    }
  });

  it("returns bg and fg as OKLCH color strings", () => {
    const { bg, fg } = avatarColorFromUserId("test-user");
    expect(bg).toMatch(/^oklch\(/);
    expect(fg).toMatch(/^oklch\(/);
  });

  it("returns fallback for empty string", () => {
    expect(avatarColorFromUserId("")).toEqual(AVATAR_FALLBACK);
  });

  it("returns fallback with tokenIndex -1", () => {
    expect(AVATAR_FALLBACK.tokenIndex).toBe(-1);
  });
});
