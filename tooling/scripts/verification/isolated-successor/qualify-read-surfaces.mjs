import fs from "node:fs";
import os from "node:os";
import cp from "node:child_process";
import { createHash } from "node:crypto";
import { assertAuthorityUnchanged } from "./authority-check.mjs";
import { artifactHash, releaseId } from "./release-boundary.mjs";
const candidate = process.argv[2] === "--read-candidate";
if (process.argv.slice(2).some((x) => x !== "--read-candidate"))
  throw Error("Unknown option");
const readCandidate = candidate
  ? JSON.parse(
      fs.readFileSync(
        os.homedir() +
          "/.athyper/instances/dev/deployments/bp-release-19-successor-20260911/read-candidate.json",
      ),
    )
  : null;
const proposal = JSON.parse(
  fs.readFileSync(
    "governance/policy/reviews/business-partner-successor-execution-image.amendment.dev.json",
  ),
);
const execution = JSON.parse(
  cp.execFileSync(
    "docker",
    [
      "inspect",
      ...(candidate
        ? ["athyper-bp-r19s-read-api"]
        : ["athyper-bp-r19s-api", "athyper-bp-r19s-worker"]),
    ],
    { encoding: "utf8" },
  ),
).map((c) => ({ id: c.Id, image: c.Image, startedAt: c.State.StartedAt }));
if (
  execution.some(
    (c) => c.image !== (readCandidate?.image ?? proposal.runtimeImage),
  )
)
  throw Error("Image mismatch");
const record = "f7688c3d-8c92-5651-a469-da3f4f786375",
  org = "a478f9c0-8226-5d22-9599-b8fb27a45180",
  company = "793b6cb3-3c61-57c0-9562-2cbc288bd4cf";
const report = {
  schemaVersion: 1,
  kind: "successor_read_surface_inventory",
  capturedAt: new Date().toISOString(),
  releaseId,
  artifactHash,
  execution,
  checks: [],
  qualified: false,
  grantsChanged: false,
};
const send = (account, name, path) => {
  const before = assertAuthorityUnchanged("revoked");
  const r = JSON.parse(
    cp.execFileSync(
      "docker",
      [
        "exec",
        "-i",
        "athyper-bp-r19s-auth-client",
        "node",
        candidate
          ? "/app/server/qualification-client/read-session-client.mjs"
          : "/app/server/qualification-client/session-client.mjs",
        account,
        path,
        "GET",
      ],
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], maxBuffer: 3000000 },
    ),
  );
  if (assertAuthorityUnchanged("revoked").sha256 !== before.sha256)
    throw Error("Authority changed");
  const check = {
    account,
    name,
    status: r.status,
    code: r.body?.code,
    artifact: r.artifact,
    releaseBound: r.artifact === artifactHash,
    checkedAt: new Date().toISOString(),
    requestRef: createHash("sha256")
      .update(r.requestId ?? "")
      .digest("hex"),
    authorityHash: before.sha256,
  };
  report.checks.push(check);
  console.log(JSON.stringify(check));
  return r.body;
};
const aliases = {
  "identifiers-tax": "identifiers",
  "roles-scope": "roles",
  "supplier-company": "company-configuration?roleLens=supplier",
  "customer-company": "company-configuration?roleLens=customer",
  "qualifications-certificates": "qualifications",
};
try {
  for (const account of ["catl.admin", "catl.owner"]) {
    for (const [name, path] of [
      [
        "list_descriptor",
        "/api/entity-runtime/business_partner/list-descriptor",
      ],
      ["list", "/api/entity-runtime/business_partner/list?limit=10"],
      ["record", "/api/entity-runtime/business_partner/records/" + record],
    ])
      send(account, name, path);
    const base = "/api/neon/business-partners/" + record + "/360/";
    const summary = send(account, "summary", base + "summary");
    report[account] = {
      sections: (summary.sections ?? []).map((s) => ({
        code: s.code,
        authorization: s.authorization,
        reasonCode: s.reasonCode,
      })),
    };
    for (const section of summary.sections ?? []) {
      if (section.code === "overview") continue;
      const path = aliases[section.code] ?? section.code;
      send(account, "provider:" + section.code, base + path);
    }
    const coordinates =
      "operatingOrganizationId=" + org + "&companyCodeId=" + company;
    const scoped = send(
      account,
      "summary:selected_context",
      base + "summary?" + coordinates,
    );
    report[account].scopedSections = (scoped.sections ?? []).map((s) => ({
      code: s.code,
      authorization: s.authorization,
      reasonCode: s.reasonCode,
    }));
    const providerCodes = [
      "overview",
      "identity",
      "contacts",
      "addresses",
      "identifiers-tax",
      "governance",
      "roles-scope",
      "supplier-company",
      "customer-company",
      "banking",
      "qualifications-certificates",
      "credit",
      "requests",
      "activity",
      "business-activity",
      "network",
      "comments",
      "attachments",
    ];
    for (const code of providerCodes) {
      const path = aliases[code] ?? code;
      send(
        account,
        "provider:selected_context:" + code,
        base + path + (path.includes("?") ? "&" : "?") + coordinates,
      );
    }
    for (const role of ["supplier", "customer"])
      send(
        account,
        "company_configuration:" + role,
        base +
          "company-configuration?roleLens=" +
          role +
          "&operatingOrganizationId=" +
          org +
          "&companyCodeId=" +
          company,
      );
  }
} catch (e) {
  report.blocker = String(e.message).split("\n")[0].slice(0, 160);
  process.exitCode = 1;
} finally {
  fs.writeFileSync(
    "governance/policy/reports/business-partner-successor-read-surfaces" +
      (candidate ? ".candidate" : "") +
      ".dev.json",
    JSON.stringify(report, null, 2) + "\n",
  );
}
