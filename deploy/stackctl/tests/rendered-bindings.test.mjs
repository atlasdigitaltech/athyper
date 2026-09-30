import assert from "node:assert/strict";
import test from "node:test";
import { assertRenderedBindings } from "../src/rendered-bindings.mjs";

for (const host_ip of [
  "0.0.0.0",
  "::",
  undefined,
  "192.168.1.2",
  "localhost",
]) {
  test(`reject public or implicit binding ${host_ip}`, () => {
    assert.throws(
      () =>
        assertRenderedBindings({
          services: {
            db: { ports: [{ target: 5432, published: "5432", host_ip }] },
          },
        }),
      /loopback/,
    );
  });
}
test("accept no publication and explicit IPv4/IPv6 loopback", () => {
  assertRenderedBindings({
    services: {
      db: {},
      local: { ports: [{ host_ip: "127.0.0.1" }, { host_ip: "::1" }] },
    },
  });
});
test("reject malformed config, unrendered ports and host network", () => {
  for (const config of [
    {},
    { services: { db: { ports: ["5432:5432"] } } },
    { services: { db: { network_mode: "host" } } },
  ]) {
    assert.throws(() => assertRenderedBindings(config));
  }
});

test("Docker interpolation cannot hide an unsafe environment override", async () => {
  const { spawnSync } = await import("node:child_process");
  const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const directory = mkdtempSync(join(tmpdir(), "bind-validation-"));
  try {
    const file = join(directory, "compose.yaml");
    writeFileSync(
      file,
      'services:\n  db:\n    image: postgres:16\n    ports: ["${ATHYPER_POSTGRES_BIND:-127.0.0.1:5432}:5432"]\n',
    );
    for (const binding of [
      "127.0.0.1:55432",
      "0.0.0.0:55432",
      "[::]:55432",
      "55432",
    ]) {
      const result = spawnSync(
        "docker",
        [
          "compose",
          "-p",
          "bind-validation",
          "-f",
          file,
          "config",
          "--format",
          "json",
        ],
        {
          encoding: "utf8",
          env: { ...process.env, ATHYPER_POSTGRES_BIND: binding },
        },
      );
      if (binding === "55432") {
        // This expands to a host IP omission/invalid three-part port.
        if (result.status !== 0) continue;
      }
      assert.equal(result.status, 0, result.stderr);
      if (binding.startsWith("127."))
        assertRenderedBindings(JSON.parse(result.stdout));
      else
        assert.throws(
          () => assertRenderedBindings(JSON.parse(result.stdout)),
          /loopback/,
        );
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
