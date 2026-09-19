/** Explicit user-authorized independent Studio review of one pinned change set.
 * No grant, publication, signing or activation endpoints are called. */
import { readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { request } from "@playwright/test";
// @ts-expect-error Tested review hashing helper.
import { combinedHash } from "./entity-authorization/combined-successor.mjs";
const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const proposal = read(
  "governance/policy/reviews/business-partner-canonical-v2-native.proposal.dev.json",
);
const { proposalRevision: reviewRevision, ...body } = proposal;
const expectedRevision =
  "0e44f59861fa5c2d7290909d2b41d366f39e3a856e7336fd0e9cf9b5ba4149f8";
const expectedContract =
  "3e860539e3892846d5fca4d24db1334a234ccd4820d6707f188a97423bebdd3a";
const id = "f533b3ec-934b-4bc0-8448-ee933847ddf2";
if (
  reviewRevision !== expectedRevision ||
  combinedHash(body) !== expectedRevision
)
  throw Error("COMBINED_APPROVED_PROPOSAL_CHANGED");
const path =
  "governance/policy/reports/business-partner-canonical-v2-approval.dev.json";
if (existsSync(path) && read(path).approved)
  throw Error(
    "Approval already recorded; inspect the durable state rather than resubmitting",
  );
const verify = () => {
  execFileSync(
    "pnpm",
    [
      "exec",
      "tsx",
      "tooling/scripts/verification/inspect-business-partner-canonical-v2-review.mts",
    ],
    { stdio: "inherit" },
  );
  const current = read(
    "governance/policy/reports/business-partner-canonical-v2-persisted-review.dev.json",
  );
  if (
    current.changeSetId !== id ||
    current.changeSetRevision !== 2 ||
    current.status !== "in_review" ||
    current.persistedNativeContractHash !== expectedContract ||
    current.proposalRevision !== expectedRevision
  )
    throw Error("COMBINED_REVIEW_COORDINATE_CHANGED");
};
const consent = read(
  "governance/policy/reviews/business-partner-canonical-v2-native.acceptance.dev.json",
);
if (
  consent.proposalRevision !== expectedRevision ||
  consent.nativeContractHash !== expectedContract ||
  consent.changeSetId !== id ||
  consent.expectedRevision !== 2 ||
  consent.reviewerAccount !== "catl.owner" ||
  !consent.authorizedActions.includes("independent_native_review")
)
  throw Error("EXACT_USER_AUTHORIZATION_REQUIRED");
verify();
execFileSync(
  "pnpm",
  [
    "exec",
    "tsx",
    "tooling/scripts/verification/capture-business-partner-combined-source.mts",
  ],
  { stdio: "inherit" },
);
const source = read(
  "governance/policy/reports/business-partner-combined-source.dev.json",
).source;
if (
  combinedHash(source.descriptor) !== proposal.predecessor.descriptorHash ||
  combinedHash(source.authored_contract) !==
    proposal.predecessor.authoredContractHash
)
  throw Error("COMBINED_PREDECESSOR_CHANGED");
const authPath = "tests/e2e/.auth/catl.owner-bp-combined-review.json",
  origin = "https://studio.dev.athyper.test";
const principal = "5cd6cf93-3fe4-500c-8066-3ebf14a9eb5d",
  tenant = "44444444-4444-4444-8444-444444444444";
const client = await request.newContext({
  baseURL: origin,
  ignoreHTTPSErrors: true,
  storageState: authPath,
});
try {
  const csrf = (await client.storageState()).cookies.find(
    (c) => c.name === "__Host-athyper-csrf",
  );
  if (!csrf) throw Error("STUDIO_REAUTHENTICATION_REQUIRED");
  const refreshed = await client.post("/api/auth/refresh", {
    headers: { origin, "x-csrf-token": decodeURIComponent(csrf.value) },
  });
  if (!refreshed.ok()) throw Error("STUDIO_REAUTHENTICATION_REQUIRED");
  const session = await (await client.get("/api/auth/session")).json();
  if (
    session.state !== "authenticated" ||
    session.principalId !== principal ||
    session.tenantId !== tenant
  )
    throw Error("INDEPENDENT_STUDIO_REVIEWER_REQUIRED");
  const identityResponse = await client.get("/api/relay/iam/me");
  const identity = await identityResponse.json();
  if (
    !identityResponse.ok() ||
    identity.principalId !== principal ||
    identity.tenantId !== tenant ||
    !identity.permissions?.includes("metadata.entity.review")
  )
    throw Error("CURRENT_REVIEW_AUTHORITY_REQUIRED");
  if (session.assurance !== "elevated")
    throw Error("STUDIO_REVIEW_STEP_UP_REQUIRED");
  verify();
  const token = (await client.storageState()).cookies.find(
    (c) => c.name === "__Host-athyper-csrf",
  )!;
  const response = await client.post(
    `/api/relay/meta-entity-authoring/change-sets/${id}/approve`,
    {
      headers: {
        origin,
        "x-csrf-token": decodeURIComponent(token.value),
        "if-match": "2",
      },
      data: { expectedRevision: 2 },
    },
  );
  const raw = await response.text();
  let result: any;
  try {
    result = JSON.parse(raw);
  } catch {
    result = { nonJson: true };
  }
  const approved =
    response.ok() &&
    result.id === id &&
    result.status === "approved" &&
    result.revision === 3 &&
    result.approvedBy === principal;
  const receipt = {
    schemaVersion: 1,
    kind: "bp_canonical_v2_independent_review",
    recordedAt: new Date().toISOString(),
    account: "catl.owner",
    principalId: principal,
    tenantId: tenant,
    reviewRevision: expectedRevision,
    persistedNativeContractHash: expectedContract,
    changeSetId: id,
    expectedRevision: 2,
    status: response.status(),
    response: result,
    approved,
    requestId: response.headers()["x-request-id"] ?? null,
    grantsChanged: false,
    published: false,
    activationAuthorized: false,
  };
  writeFileSync(path, JSON.stringify(receipt, null, 2) + "\n");
  console.log({
    path,
    status: response.status(),
    approved,
    state: result.status,
    revision: result.revision,
    code: result.code ?? result.error,
    assurance: session.assurance,
  });
  if (!approved)
    throw Error(`AUTHENTICATED_REVIEW_NOT_RECORDED:${response.status()}`);
} finally {
  await client.storageState({ path: authPath });
  chmodSync(authPath, 0o600);
  await client.dispose();
}
