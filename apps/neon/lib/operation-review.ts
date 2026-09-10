import { createAuthenticatedOperationReview } from "../../../tooling/scripts/verification/entity-authorization/authenticated-operation-review.mjs";
import { authRuntime } from "./auth";
import { platformRelay } from "./relay";

export const operationReview = createAuthenticatedOperationReview({
  enabled: process.env.LOCAL_BP_OPERATION_REVIEW_ENABLED === "true",
  origin: process.env.APP_ORIGIN ?? "http://localhost:3000",
  nominationPath: process.env.LOCAL_BP_OPERATION_REVIEW_NOMINATION ?? "",
  packetPath: process.env.LOCAL_BP_OPERATION_REVIEW_PACKET ?? "",
  packetSha256: process.env.LOCAL_BP_OPERATION_REVIEW_PACKET_SHA256 ?? "",
  outputDirectory: process.env.LOCAL_BP_OPERATION_REVIEW_OUTPUT ?? "",
  resolveSession: request => authRuntime.resolveRelaySession(request),
  async currentIdentity(request) {
    const response = await platformRelay(new Request(new URL("/api/relay/iam/me", request.url), {headers: {cookie: request.headers.get("cookie") ?? ""}}), {params: Promise.resolve({path: ["iam", "me"]})});
    if (!response.ok) throw Object.assign(new Error("IAM identity unavailable"), {status: response.status === 401 ? 401 : 503, code: "REVIEW_IDENTITY_UNAVAILABLE"});
    return response.json();
  },
});
