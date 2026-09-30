const { createRequire } = require("node:module");
const { resolve } = require("node:path");
const { parseArgs } = require("node:util");
async function main() {
  const { values } = parseArgs({
    options: { actor: { type: "string" }, state: { type: "string" } },
  });
  if (!["catl.admin", "catl.owner"].includes(values.actor) || !values.state)
    throw Error("Explicit actor/state required");
  const { chromium } = createRequire(
    resolve(process.env.ATLAS_CAPTURE_PACKAGE_ROOT, "package.json"),
  )("playwright");
  const browser = await chromium.launch({ channel: "chrome", headless: false });
  const done = new Promise((r) => browser.on("disconnected", r));
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    proxy: { server: "http://127.0.0.1:13320" },
    storageState: values.state,
    viewport: null,
  });
  const page = await context.newPage();
  const origin = "https://neon.dev.athyper.test";
  const response = await page.goto(
    origin +
      "/mdg/business-partner/01a092d1-8242-7948-9ce9-6f19c38c4b27?operatingOrganizationId=a478f9c0-8226-5d22-9599-b8fb27a45180&companyCodeId=793b6cb3-3c61-57c0-9562-2cbc288bd4cf&tab=360&section=overview",
  );
  if (
    response.headers()["x-qualification-ui-image"] !==
    "sha256:0336cce9a4eb5b19c12c3f49f3ed2d5bbbfd05f456ce2132b5756348a72a4461"
  )
    throw Error("ISOLATED_UI_IMAGE_MISMATCH");
  console.log(
    "Opened isolated NEON manual testing: " +
      values.actor +
      ". Keep this Chrome window open.",
  );
  await done;
}
main().catch(() => {
  console.error("MANUAL_NEON_WINDOW_FAILED");
  process.exitCode = 1;
});
