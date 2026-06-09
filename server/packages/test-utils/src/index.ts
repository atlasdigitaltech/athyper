export * from "./fixtures.js";
export * from "./mock-db.js";

import { vi } from "vitest";
export { vi };

/** Minimal Redis/cache mock matching the CacheClient interface used in svc-iam. */
export function makeMockCache(cached: string | null = null): {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  set: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  del: any;
} {
  return {
    get: vi.fn().mockResolvedValue(cached),
    set: vi.fn().mockResolvedValue("OK"),
    del: vi.fn().mockResolvedValue(1),
  };
}

/** Minimal logger mock — captures calls so tests can assert on log output. */
export function makeMockLogger(): {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  info: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  warn: any;
} {
  return {
    error: vi.fn(),
    info:  vi.fn(),
    warn:  vi.fn(),
  };
}
