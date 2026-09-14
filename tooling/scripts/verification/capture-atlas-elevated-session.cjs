// Interactive DEV/QA capture. Passwords and MFA remain in the issuer's browser UI.
const { createRequire } = require("node:module");
const { resolve, dirname } = require("node:path");
const {
  existsSync,
  mkdirSync,
  chmodSync,
  renameSync,
  rmSync,
} = require("node:fs");
const { parseArgs } = require("node:util");
const { startCaptureStepUp } = require("./auth-capture-step-up.cjs");

let capturePhase = "arguments";
async function main() {
  const { values } = parseArgs({
    options: {
      environment: { type: "string", default: "dev" },
      plane: { type: "string" },
      actor: { type: "string" },
      "isolated-studio": { type: "boolean", default: false },
      "isolated-neon": { type: "boolean", default: false },
      fresh: { type: "boolean", default: false },
      output: { type: "string" },
    },
  });
  const { captureTarget, identities } = require("./auth-capture-target.cjs");
  const { plane, actor } = values;
  const target = captureTarget({
    ...values,
    repo: resolve(__dirname, "../../.."),
  });
  if (!target.principalId)
    throw Error("No verified principal mapping for this plane and actor");
  const tenant = actor.startsWith("athyper.")
    ? {
        id: "11111111-1111-4111-8111-111111111111",
        label: "Athyper Group Holdings",
      }
    : { id: "44444444-4444-4444-8444-444444444444", label: "CirrusAtlantic" };
  const playwright = process.env.ATLAS_CAPTURE_PACKAGE_ROOT
    ? createRequire(
        resolve(process.env.ATLAS_CAPTURE_PACKAGE_ROOT, "package.json"),
      )("playwright")
    : require("@playwright/test");
  const output = resolve(values.output || target.statePath);
  const pending = `${output}.${process.pid}.pending`;
  const origin = target.origin;
  capturePhase = "browser-launch";
  const browser = await playwright.chromium.launch({ headless: false });
  try {
    capturePhase = "context-create";
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      ...(target.proxy ? { proxy: target.proxy } : {}),
      ...(!values.fresh && existsSync(output) ? { storageState: output } : {}),
    });
    capturePhase = "page-create";
    const page = await context.newPage();
    console.log(
      `Sign in as ${actor}; select ${tenant.label}. Then complete the MFA prompt. Do not close the browser until capture succeeds.`,
    );
    capturePhase = "login-navigation";
    await page.goto(`${origin}/api/auth/login?returnTo=%2Fhome`);
    async function waitSession(elevated) {
      const deadline = Date.now() + 10 * 60_000;
      while (Date.now() < deadline) {
        const response = await context.request.get(
          `${origin}/api/auth/session`,
        );
        if (response.ok()) {
          const s = await response.json();
          if (s.state === "authenticated") {
            if (
              s.plane !== plane ||
              s.principalId !== identities[plane][actor] ||
              s.tenantId !== tenant.id
            ) {
              throw Error(
                "Wrong actor or tenant. Existing saved state was not replaced.",
              );
            }
            if (!elevated || s.assurance === "elevated") return s;
          }
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
      throw Error(
        "Timed out waiting for authenticated elevated assurance. Existing saved state was not replaced.",
      );
    }
    capturePhase = "session-verification";
    const session = await waitSession(false);
    if (session.assurance !== "elevated") {
      capturePhase = "interactive-step-up";
      await startCaptureStepUp(context, page, origin);
    }
    capturePhase = "elevated-session-verification";
    await waitSession(true);
    mkdirSync(dirname(output), { recursive: true });
    await context.storageState({ path: pending });
    chmodSync(pending, 0o600);
    renameSync(pending, output);
    console.log(
      `Verified ${plane}/${actor}: ${tenant.label}, elevated. Saved session successfully.`,
    );
  } finally {
    rmSync(pending, { force: true });
    await browser.close();
  }
}
main().catch((error) => {
  console.error(
    JSON.stringify({
      phase: capturePhase,
      errorName: error?.name,
      errorCode: error?.code,
    }),
  );
  const message = String(error?.message || "");
  if (message.startsWith("Wrong actor or tenant."))
    console.error("CAPTURE_IDENTITY_MISMATCH");
  if (message.startsWith("Timed out waiting"))
    console.error("CAPTURE_SESSION_TIMEOUT");
  const networkCode = message.match(/net::ERR_[A-Z_]+/);
  if (networkCode) console.error(networkCode[0]);
  if (error?.message?.startsWith("Step-up capture:")) {
    console.error(error.message);
  }
  console.error(
    "Capture did not complete. Confirm the selected actor, tenant and interactive MFA; no session contents were printed.",
  );
  process.exitCode = 1;
});
