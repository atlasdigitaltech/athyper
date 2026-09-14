import { readAppEnvironment } from "./environment";
import { callInternalRoute } from "@athyper/platform-shell-app-foundation/server";
import { createAuthenticatedRoleReview } from "@athyper/platform-iam-governance-review/authenticated-role-review";
import { authRuntime } from "./auth";
import { platformRelay } from "./relay";

let handler: ReturnType<typeof createAuthenticatedRoleReview> | undefined;
export const namedRoleReview = (request: Request) => {
  handler ??= createAuthenticatedRoleReview({
    enabled: process.env.LOCAL_BP_ROLE_REVIEW_ENABLED === "true",
    origin: readAppEnvironment().appOrigin,
    inventoryPath: process.env.LOCAL_BP_ROLE_REVIEW_INVENTORY ?? "",
    packetPath: process.env.LOCAL_BP_ROLE_REVIEW_PACKET ?? "",
    packetSha256: process.env.LOCAL_BP_ROLE_REVIEW_PACKET_SHA256 ?? "",
    outputDirectory: process.env.LOCAL_BP_ROLE_REVIEW_OUTPUT ?? "",
    resolveSession: (request) => authRuntime.resolveRelaySession(request),
    async currentIdentity(request) {
      const response = await callInternalRoute(
        "/api/relay/iam/me",
        request,
        (input) =>
          platformRelay(input, {
            params: Promise.resolve({ path: ["iam", "me"] }),
          }),
      );
      if (!response.ok)
        throw Object.assign(new Error("IAM identity unavailable"), {
          status: response.status === 401 ? 401 : 503,
          code: "REVIEW_IDENTITY_UNAVAILABLE",
        });
      return response.json();
    },
  });
  return handler(request);
};
