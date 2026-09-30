import { expect, it, vi } from "vitest";
import type {
  AuthenticationRequest,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import { restrictAuthenticationToPlanes } from "./plane-admission.js";
import { createRegistrationPlan } from "../../../kernel/registration-plan.js";
import { readDeploymentProfile } from "../../../config/deployment-profile.js";

it.each(["studio", "neon", "mesh"] as const)(
  "admits only %s even when review has extra databases",
  async (plane) => {
    const plan = createRegistrationPlan(
      readDeploymentProfile(
        {
          MODE: "worker",
          HOST_DEPLOYMENT_PROFILE: plane,
          ENTITY_RELEASE_REVIEW_CONFIG_PATH: "/review",
        },
        "worker",
      ),
    );
    const authenticate = vi.fn(async (request: AuthenticationRequest) => ({
      ok: true as const,
      context: { planeKey: request.planeKey } as VerifiedRequestContext,
    }));
    const restricted = restrictAuthenticationToPlanes(
      { authenticate },
      plan.servedPlanes,
    );
    for (const requested of ["studio", "neon", "mesh"] as const) {
      const result = await restricted.authenticate({
        planeKey: requested,
      } as AuthenticationRequest);
      expect(result.ok).toBe(requested === plane);
    }
    expect(authenticate).toHaveBeenCalledOnce();
  },
);
it("rejects a successful authenticator that changes the requested plane", async () => {
  const restricted = restrictAuthenticationToPlanes(
    {
      authenticate: async () => ({
        ok: true,
        context: { planeKey: "studio" } as VerifiedRequestContext,
      }),
    },
    ["neon", "studio"],
  );
  expect(
    await restricted.authenticate({
      planeKey: "neon",
    } as AuthenticationRequest),
  ).toMatchObject({ ok: false, status: 403 });
});
it("snapshots admission and preserves underlying authentication denials", async () => {
  const planes: Array<"neon" | "mesh"> = ["neon"];
  const failure = {
    ok: false as const,
    status: 401 as const,
    code: "AUTH_TOKEN_INVALID" as const,
    message: "invalid",
  };
  const authenticate = vi.fn(async () => failure);
  const restricted = restrictAuthenticationToPlanes({ authenticate }, planes);
  planes.push("mesh");
  expect(
    await restricted.authenticate({
      planeKey: "mesh",
    } as AuthenticationRequest),
  ).toMatchObject({ status: 403 });
  expect(authenticate).not.toHaveBeenCalled();
  expect(
    await restricted.authenticate({
      planeKey: "neon",
    } as AuthenticationRequest),
  ).toBe(failure);
});

it("installs the served-plane boundary on both the host and returned IAM service", async () => {
  const { registerIdentityAuthority } = await import("./authority.js");
  const { createContainer } = await import("../../../kernel/container.js");
  const { loadConfig } = await import("../../../config/environment.js");
  const container = createContainer();
  const authenticate = vi.fn(async () => ({
    ok: false as const,
    status: 401 as const,
    code: "AUTH_TOKEN_INVALID" as const,
    message: "invalid",
  }));
  const authority = registerIdentityAuthority(container, loadConfig({}), {
    servedPlanes: ["mesh"],
    tokenVerifier: { verify: vi.fn() },
    createIam: () => ({ authenticate }),
    auditSink: { append: vi.fn() } as never,
  });
  expect(authority?.iam).toBe(container.platform.iam);
  expect(
    await container.platform.iam!.authenticate({
      planeKey: "studio",
    } as AuthenticationRequest),
  ).toMatchObject({ status: 403 });
  expect(authenticate).not.toHaveBeenCalled();
});
