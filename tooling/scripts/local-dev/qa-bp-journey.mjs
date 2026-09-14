/** Exercise the real QA BP command boundary using existing, separate accounts. */
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";
import { verifyCandidate, sha } from "./candidate.mjs";
import { readQaBrowserSession } from "./qa-browser-session.mjs";
import { qaProject } from "./qa-runtime.mjs";
process.umask(0o077);
if (!process.argv[2]) throw Error("Frozen candidate directory required");
const candidate = verifyCandidate(resolve(process.argv[2])),
  hash = sha(candidate.manifest),
  project = qaProject();
if (!/^athyper-qa-candidate-[0-9]{13}$/.test(project))
  throw Error("Isolated QA required");
const evidence = join(
  homedir(),
  ".athyper/qualification/qa-bp",
  String(Date.now()),
);
mkdirSync(evidence, { recursive: true, mode: 0o700 });
const receipt = {
  schema: "athyper.qa-bp-journey/1",
  project,
  candidateHash: hash,
  sourceRevision: candidate.manifest.sourceRevision,
  checks: [],
  releaseQualified: false,
};
const browser = await chromium.launch({
  args: ["--host-resolver-rules=MAP *.qa.athyper.test 127.0.0.1"],
});
async function actor(name) {
  const c = await browser.newContext({
    ignoreHTTPSErrors: true,
    storageState: join(
      homedir(),
      ".athyper/qualification/sessions/qa/neon",
      name + ".json",
    ),
  });
  const p = await c.newPage();
  await p.goto("https://neon.qa.athyper.test/api/auth/session");
  const s = await readQaBrowserSession(p, "neon", name);
  receipt.checks.push({
    check: "session",
    actor: name,
    assurance: s.assurance,
    passed: true,
  });
  return p;
}
async function call(p, path, body, method = body ? "POST" : "GET") {
  return p.evaluate(
    async ({ path, body, method }) => {
      const raw = document.cookie
        .split("; ")
        .find((c) => c.startsWith("__Host-athyper-csrf="));
      const r = await fetch("/api/relay/neon/" + path, {
        method,
        headers: {
          ...(body?.idempotencyKey
            ? { "idempotency-key": body.idempotencyKey }
            : {}),
          "content-type": "application/json",
          "x-csrf-token": raw
            ? decodeURIComponent(raw.slice(raw.indexOf("=") + 1))
            : "",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return { status: r.status, body: await r.json() };
    },
    { path, body, method },
  );
}
function expect(check, r, statuses) {
  const passed = statuses.includes(r.status);
  receipt.checks.push({
    check,
    status: r.status,
    passed,
    ...(!passed ? { failure: r.body } : {}),
  });
  if (!passed) throw Error(`${check}: HTTP ${r.status}`);
  return r.body;
}
try {
  const maker = await actor("catl.admin"),
    checker = await actor("catl.owner");
  const form = expect(
    "active-form",
    await call(
      maker,
      "business-partner-definitions/active-request-form?kind=new_partner&sourceKind=manual&requestedRole=supplier",
    ),
    [200],
  ).requestForm;
  receipt.definition = form.definition;
  const name = `QA Candidate ${hash.slice(0, 12)}`;
  const payload = {
    idempotencyKey: `qa-bp:${hash}`,
    kind: "new_partner",
    source: { kind: "manual" },
    registrationMode: "direct",
    requestedRole: "supplier",
    operatingOrganizationId: "a478f9c0-8226-5d22-9599-b8fb27a45180",
    companyCodeId: "793b6cb3-3c61-57c0-9562-2cbc288bd4cf",
    expectedForm: form.definition,
    proposedPayload: {
      name,
      legalName: name,
      displayName: name,
      partnerCategory: "organization",
      ownershipClass: "external",
      supplierType: "general",
      qualificationTypeCode: "compliance",
      registrationCountryCode: "MY",
    },
    extensions: {
      addresses: [
        {
          clientItemKey: "address-1",
          definitionFieldCode: "address.primary",
          purpose: "default",
          addressKind: "street",
          line1: "1 QA Test Street",
          city: "Kuala Lumpur",
          postalCode: "50000",
          countryCode: "MY",
          isPrimary: true,
          normalizedHash: sha("1 QA Test Street"),
        },
      ],
      contactPersons: [
        {
          clientItemKey: "contact-1",
          definitionFieldCode: "contact.primary",
          contactName: "QA Test Contact",
          isPrimary: true,
        },
      ],
      contactChannels: [
        {
          clientItemKey: "channel-1",
          definitionFieldCode: "contact.channel.email",
          contactClientItemKey: "contact-1",
          channelType: "email",
          value: "qa-candidate@example.test",
          purpose: "default",
          isPrimary: true,
        },
      ],
    },
  };
  expect(
    "checker-cannot-create",
    await call(checker, "business-partner-cases", payload),
    [403],
  );
  expect(
    "wrong-organization-denied",
    await call(maker, "business-partner-cases", {
      ...payload,
      idempotencyKey: payload.idempotencyKey + ":wrong-org",
      operatingOrganizationId: "11111111-1111-4111-8111-111111111111",
    }),
    [403],
  );
  expect(
    "stale-form-denied",
    await call(maker, "business-partner-cases", {
      ...payload,
      idempotencyKey: payload.idempotencyKey + ":stale",
      expectedForm: { ...form.definition, hash: "0".repeat(64) },
    }),
    [409],
  );
  const created = expect(
    "create",
    await call(maker, "business-partner-cases", payload),
    [200, 201],
  );
  receipt.requestId = created.request.id;
  const validated = expect(
    "validate",
    await call(maker, `business-partner-cases/${receipt.requestId}/validate`, {
      expectedVersion: created.request.rowVersion,
    }),
    [200],
  );
  receipt.validation = validated;
  const submitted = expect(
    "submit",
    await call(maker, `business-partner-cases/${receipt.requestId}/submit`, {
      expectedVersion: validated.request.rowVersion,
      idempotencyKey: payload.idempotencyKey + ":submit",
    }),
    [200, 201],
  );
  receipt.submission = submitted;
  console.log(
    JSON.stringify({
      evidence,
      requestId: receipt.requestId,
      submitted: true,
      releaseQualified: false,
    }),
  );
} catch (e) {
  receipt.failure = e.message;
  process.exitCode = 1;
  console.error(
    JSON.stringify({
      evidence,
      failure: e.message,
      lastCheck: receipt.checks.at(-1),
    }),
  );
} finally {
  writeFileSync(
    join(evidence, "receipt.json"),
    JSON.stringify(receipt, null, 2) + "\n",
    { mode: 0o600 },
  );
  await browser.close();
}
