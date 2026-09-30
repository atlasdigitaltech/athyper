import { expect, it, vi } from "vitest";
import { createAuthorizationManagementService } from "@athyper/server-platform-control-admin";
import {
  createHostAuthorizationManagement,
  type AuthorizationManagementCompositionOptions,
  type AuthorizationManagementPolicy,
} from "./authorization-management.js";

// Exercise the composition policy while capturing the port passed to the service.
vi.mock("@athyper/server-platform-control-admin", async (original) => ({
  ...(await original<object>()),
  createAuthorizationManagementService: vi.fn(() => ({})),
}));
function options(
  policy: AuthorizationManagementPolicy = {},
): AuthorizationManagementCompositionOptions {
  return {
    policy,
    metadataDatabases: {},
    authorizer: {} as AuthorizationManagementCompositionOptions["authorizer"],
    audit: { record: vi.fn() },
  };
}
it("requires evidence and dedicated writers before enabling mutations", () => {
  expect(() =>
    createHostAuthorizationManagement(
      options({
        authorizationManagementRoutesEnabled: true,
        authorizationManagementMutationsEnabled: true,
      }),
    ),
  ).toThrow("writer-switch evidence");
  expect(() =>
    createHostAuthorizationManagement(
      options({
        authorizationManagementRoutesEnabled: true,
        authorizationManagementMutationsEnabled: true,
        authorizationManagementPolicyPath: "/not-read-before-writer-validation",
      }),
    ),
  ).toThrow("dedicated writer connections");
});
it.each(["legacy", "shadow", "enforce"] as const)(
  "honors the %s host ceiling and qualification gates",
  async (mode) => {
    const base = options({ authorizationManagementMode: mode });
    createHostAuthorizationManagement({
      ...base,
      supplied: {
        unitOfWork: {} as never,
        writerGate: { inspect: vi.fn() },
        rolloutPolicies: {
          loadExactPlane: async (planeKey) => ({
            planeKey,
            mode: "enforce",
            revision: "approved",
            approved: true,
            approvedAt: "2020-01-01T00:00:00Z",
          }),
        },
      },
    });
    const bound = vi
      .mocked(createAuthorizationManagementService)
      .mock.calls.at(-1)![0];
    const selection = bound.rollout.select({
      planeKey: "neon",
      principalId: "reviewed-principal",
    });
    if (mode === "enforce")
      await expect(selection).rejects.toMatchObject({
        code: "AUTHORIZATION_V2_ENFORCE_NOT_QUALIFIED",
      });
    else expect((await selection).mode).toBe(mode);
  },
);
it("keeps management absent when neither configured nor supplied", () => {
  expect(createHostAuthorizationManagement(options())).toBeUndefined();
});
