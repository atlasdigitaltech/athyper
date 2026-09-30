// Normal interactive issuer login and MFA; fixed isolated NEON browser transport.
const { createRequire } = require("node:module");
const { resolve, dirname } = require("node:path");
const { mkdirSync, chmodSync, renameSync, rmSync } = require("node:fs");
const { parseArgs } = require("node:util");
const { startCaptureStepUp } = require("../auth-capture-step-up.cjs");
async function main() {
  const { values } = parseArgs({
    options: {
      plane: { type: "string" },
      actor: { type: "string" },
      output: { type: "string" },
      "step-up": { type: "boolean", default: false },
    },
  });
  const ids = {
    "catl.admin": "cca94907-7519-5871-8e3c-6b11aa545c93",
    "catl.owner": "645b6a55-3355-526a-9643-3900425bde47",
  };
  if (values.plane !== "neon" || !ids[values.actor] || !values.output)
    throw Error("Explicit NEON actor and output required");
  const playwright = createRequire(
    resolve(process.env.ATLAS_CAPTURE_PACKAGE_ROOT, "package.json"),
  )("playwright");
  const output = resolve(values.output),
    pending = output + "." + process.pid + ".pending",
    origin = "https://neon.dev.athyper.test";
  const browser = await playwright.chromium.launch({ headless: false });
  try {
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      proxy: { server: "http://127.0.0.1:13320" },
      ...(values["step-up"] ? { storageState: output } : {}),
    });
    const page = await context.newPage();
    console.log(
      `Sign in as ${values.actor}; select CirrusAtlantic and complete MFA. Leave the window open until Saved session successfully.`,
    );
    await page.goto(
      origin +
        (values["step-up"] ? "/home" : "/api/auth/login?returnTo=%2Fhome"),
    );
    async function wait(elevated) {
      const deadline = Date.now() + 30 * 60000;
      while (Date.now() < deadline) {
        const r = await context.request.get(origin + "/api/auth/session");
        if (r.ok()) {
          const s = await r.json();
          if (s.state === "authenticated") {
            if (
              s.plane !== "neon" ||
              s.principalId !== ids[values.actor] ||
              s.tenantId !== "44444444-4444-4444-8444-444444444444"
            )
              throw Error("CAPTURE_IDENTITY_MISMATCH");
            if (
              !elevated ||
              (s.assurance === "elevated" &&
                Date.parse(s.elevationExpiresAt) > Date.now() + 60000)
            )
              return s;
          }
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
      throw Error("CAPTURE_SESSION_TIMEOUT");
    }
    const session = await wait(false);
    if (
      values["step-up"] ||
      session.assurance !== "elevated" ||
      Date.parse(session.elevationExpiresAt) <= Date.now() + 60000
    ) {
      await startCaptureStepUp(context, page, origin);
      await page.waitForURL(
        (url) => url.origin === origin && url.pathname === "/home",
        { timeout: 30 * 60000 },
      );
    }
    await wait(true);
    mkdirSync(dirname(output), { recursive: true });
    await context.storageState({ path: pending });
    chmodSync(pending, 0o600);
    renameSync(pending, output);
    console.log(
      `Verified neon/${values.actor}: CirrusAtlantic, elevated. Saved session successfully.`,
    );
  } finally {
    rmSync(pending, { force: true });
    await browser.close();
  }
}
main().catch((e) => {
  console.error(
    ["CAPTURE_IDENTITY_MISMATCH", "CAPTURE_SESSION_TIMEOUT"].includes(e.message)
      ? e.message
      : "NORMAL_CAPTURE_FAILED",
  );
  process.exitCode = 1;
});
