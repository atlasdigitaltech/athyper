import { expect, it, vi } from "vitest";
import { createRevisionAuthorizer } from "../shared/entity-runtime/revision-authorizer.js";
it("passes the authenticated principal to the persisted revision lookup", async () => {
  const get = vi.fn(async () => ({ createdBy: "maker" }));
  const authorizer = createRevisionAuthorizer({ permissions: { read: "test.read", author: "test.author", publish: "test.publish" }, get });
  const result = await authorizer.authorize({ context: { tenantId: "tenant", principalId: "checker", planeKey: "studio",
    permissions: { tenantId: "tenant", principalId: "checker", planeKey: "studio", allowed: ["test.publish"], denied: [], planLocked: [], planeExcluded: [], authorizationScopes: [] },
  } as never, permissionCode: "test.publish", resource: { tenantId: "tenant", revisionId: "revision" } });
  expect(result.allowed).toBe(true);
  expect(get).toHaveBeenCalledWith("tenant", "revision", "checker");
});
