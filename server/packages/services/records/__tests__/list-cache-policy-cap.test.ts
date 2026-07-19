import { describe, expect, it } from "vitest";
import { capEntityListCacheTtlSeconds } from "../cache/list-cache.js";

describe("entity list cache policy ceiling", () => {
  it("allows descriptor metadata to shorten the service cache window", () => {
    expect(capEntityListCacheTtlSeconds(45, "stale_while_revalidate", "20")).toBe(20);
  });

  it("never allows request metadata to widen the service cache window", () => {
    expect(capEntityListCacheTtlSeconds(45, "stale_while_revalidate", "300")).toBe(45);
  });

  it("disables page and count caching for a disabled descriptor policy", () => {
    expect(capEntityListCacheTtlSeconds(120, "disabled", "300")).toBe(0);
  });

  it("ignores malformed cache ceilings", () => {
    expect(capEntityListCacheTtlSeconds(45, "memory", "not-a-number")).toBe(45);
    expect(capEntityListCacheTtlSeconds(45, "memory", "-1")).toBe(45);
  });
});
