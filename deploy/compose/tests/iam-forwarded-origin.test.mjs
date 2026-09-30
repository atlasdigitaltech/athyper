import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "yaml";

test("DEV IAM pins the TLS-terminated public origin only on its own router", () => {
  const config = parse(readFileSync(new URL("../instance/config/traefik/dev.yaml", import.meta.url), "utf8"));
  assert.deepEqual(config.http.routers.iam.middlewares, ["iam-public-origin"]);
  assert.equal(config.http.routers.iam.rule, "Host(`iam.dev.athyper.test`)");
  assert.deepEqual(config.http.middlewares["iam-public-origin"].headers.customRequestHeaders, {
    "X-Forwarded-Proto": "https", "X-Forwarded-Port": "443", "X-Forwarded-Host": "iam.dev.athyper.test",
  });
  for (const [name, router] of Object.entries(config.http.routers)) {
    if (name !== "iam") assert.ok(!router.middlewares?.includes("iam-public-origin"));
  }
  const compose = parse(readFileSync(new URL("../instance/compose.yaml", import.meta.url), "utf8"));
  assert.equal(compose.services.gateway.ports, undefined, "Internal scheme pin requires a non-public gateway");
  assert.ok(!compose.services.gateway.command.some(command => command.includes("forwardedheaders.insecure")));
});
