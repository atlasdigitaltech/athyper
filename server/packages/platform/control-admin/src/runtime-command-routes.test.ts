import { describe, expect, it, vi } from "vitest";
import { registerRuntimeCommandRoutes } from "./runtime-command-routes.js";

describe("runtime command route composition", () => {
  it("registers dry-run, submission, approval, and immutable-history endpoints", () => {
    const routes: string[] = [];
    const application = {
      get: vi.fn((path: string) => { routes.push(`GET ${path}`); }),
      post: vi.fn((path: string) => { routes.push(`POST ${path}`); }),
    };
    registerRuntimeCommandRoutes(application as never, {
      authenticate: vi.fn() as never,
      readContext: vi.fn() as never,
      service: {} as never,
    });
    expect(routes).toEqual([
      "POST /api/control-admin/runtime-commands/dry-run",
      "POST /api/control-admin/runtime-commands",
      "POST /api/control-admin/runtime-approvals/:id/decisions",
      "GET /api/control-admin/runtime-history",
    ]);
  });
});
