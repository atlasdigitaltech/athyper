/** Authenticated QA publication. Saved sessions retain normal MFA and RBAC. */
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";
import { verifyCandidate, sha } from "./candidate.mjs";
import { readQaBrowserSession } from "./qa-browser-session.mjs";
import { qaProject } from "./qa-runtime.mjs";
process.umask(0o077);
if (!process.argv[2]) throw Error("Pass the frozen candidate directory");
const directory = resolve(process.argv[2]),
  { manifest, authoring } = verifyCandidate(directory),
  project = qaProject();
if (!/^athyper-qa-candidate-[0-9]{13}$/.test(project))
  throw Error("Isolated QA required");
const candidateHash = sha(manifest),
  key = `qa-candidate:${candidateHash}`;
const receipt = {
  schema: "athyper.qa-authenticated-publication/1",
  observedAt: new Date().toISOString(),
  project,
  candidateHash,
  sourceRevision: manifest.sourceRevision,
  checks: [],
  releaseQualified: false,
};
const evidence = join(
  homedir(),
  ".athyper/qualification/qa-publication",
  String(Date.now()),
);
mkdirSync(evidence, { recursive: true, mode: 0o700 });
const browser = await chromium.launch({
  args: ["--host-resolver-rules=MAP *.qa.athyper.test 127.0.0.1"],
});
async function actor(name) {
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    storageState: join(
      homedir(),
      ".athyper/qualification/sessions/qa/studio",
      `${name}.json`,
    ),
  });
  const page = await context.newPage();
  await page.goto("https://studio.qa.athyper.test/api/auth/session");
  const session = await readQaBrowserSession(page, "studio", name);
  receipt.checks.push({
    check: "session",
    actor: name,
    assurance: session.assurance,
    principalId: session.principalId,
    passed: true,
  });
  return page;
}
async function request(page, path, body, idempotencyKey) {
  return page.evaluate(
    async ({ path, body, idempotencyKey }) => {
      const raw = document.cookie
        .split("; ")
        .find((c) => c.startsWith("__Host-athyper-csrf="));
      const csrf = raw
        ? decodeURIComponent(raw.slice(raw.indexOf("=") + 1))
        : "";
      const r = await fetch(
        `/api/relay/studio/business-partner-definitions${path}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-csrf-token": csrf,
            ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
          },
          body: JSON.stringify(body),
        },
      );
      return { status: r.status, body: await r.json() };
    },
    { path, body, idempotencyKey },
  );
}
function expect(name, result, status) {
  const passed = result.status === status;
  receipt.checks.push({
    check: name,
    status: result.status,
    passed,
    ...(!passed ? { failure: result.body } : {}),
  });
  if (!passed) throw Error(`${name}: HTTP ${result.status}`);
  return result.body;
}
try {
  const maker = await actor("catl.admin"),
    checker = await actor("catl.owner");
  const payload = {
    bundle: authoring.revision.bundle,
    targetPlanes: authoring.revision.targetPlanes ?? ["neon"],
  };
  const simulation = expect(
    "maker-simulation",
    await request(maker, "/simulations", payload),
    200,
  );
  receipt.simulation = simulation;
  const revision = expect(
    "maker-import",
    await request(maker, "", payload, key + ":author"),
    201,
  );
  receipt.revisionId = revision.id;
  expect(
    "checker-cannot-author",
    await request(checker, "", payload, key + ":forbidden-author"),
    403,
  );
  expect(
    "maker-cannot-publish",
    await request(
      maker,
      `/${revision.id}/publish`,
      {},
      key + ":forbidden-publish",
    ),
    403,
  );
  const elevated =
    receipt.checks.find(
      (check) => check.check === "session" && check.actor === "catl.owner",
    )?.assurance === "elevated";
  receipt.checks.push({
    check: "reviewer-elevated-assurance",
    passed: elevated,
  });
  if (!elevated)
    throw Error(
      "Reviewer requires verified elevated capture; ordinary refreshed login is insufficient for release evidence",
    );
  const publication = await request(
    checker,
    `/${revision.id}/publish`,
    {},
    key + ":publish",
  );
  receipt.publication = publication;
  expect("checker-publish", publication, 202);
  console.log(
    JSON.stringify({
      evidence,
      revisionId: revision.id,
      publication: publication.body,
      releaseQualified: false,
    }),
  );
} catch (error) {
  receipt.failure = error.message;
  console.error(
    JSON.stringify({
      evidence,
      failure: error.message,
      publication: receipt.publication ?? null,
    }),
  );
  process.exitCode = 1;
} finally {
  writeFileSync(
    join(evidence, "receipt.json"),
    JSON.stringify(receipt, null, 2) + "\n",
    { mode: 0o600 },
  );
  await browser.close();
}
