import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sourceCompose,
  resumeSourceCompose,
  APPLICATIONS,
} from "./dev-workspace.mjs";
const originals = () =>
  APPLICATIONS.map((name) => ({
    Config: {
      Labels: {
        "com.docker.compose.project": "athyper-dev",
        "com.docker.compose.service": name,
      },
      Env: [
        "ATHYPER_DOMAIN_SUFFIX=dev.athyper.test",
        "EXISTING_SETTING=preserved",
      ],
      Entrypoint: ["/bin/sh", "/athyper/bin/start-runtime.sh"],
      Cmd: null,
    },
    Mounts: [
      {
        Type: "bind",
        Source: "/private/password",
        Destination: "/run/secrets/password",
        RW: false,
      },
    ],
    NetworkSettings: { Networks: { "athyper-dev_app": {} } },
    HostConfig: {},
  }));
test("source mode preserves network service identities, secrets and environment without publishing new URLs", () => {
  const plan = sourceCompose(
    originals(),
    "/checkout",
    "sha256:" + "a".repeat(64),
    1000,
    1000,
  );
  assert.equal(Object.keys(plan.services).length, 6);
  for (const [name, c] of Object.entries(plan.services)) {
    assert.deepEqual(c.networks["athyper-dev_app"].aliases, [name]);
    assert.equal(c.environment.EXISTING_SETTING, "preserved");
    assert.equal(c.environment.ATHYPER_LOCAL_SOURCE, "1");
    assert.equal(
      c.environment.AUTH_SESSION_IDLE_TTL_SECONDS,
      ["studio-web", "neon-web"].includes(name) ? "7200" : undefined,
    );
    assert.equal(
      c.environment.AUTH_SESSION_ABSOLUTE_TTL_SECONDS,
      ["studio-web", "neon-web"].includes(name) ? "43200" : undefined,
    );
    assert.equal(c.ports, undefined);
    assert.equal(c.volumes[0].read_only, true);
    assert.equal(c.user, "1000:1000");
  }
  assert.equal(plan.networks["athyper-dev_app"].external, true);
});
test("refuses incomplete, foreign and mutable source inputs", () => {
  assert.throws(
    () =>
      sourceCompose(
        originals().slice(1),
        "/checkout",
        "sha256:" + "a".repeat(64),
        1,
        1,
      ),
    /Existing DEV api/,
  );
  const qa = originals();
  qa[0].Config.Env = ["ATHYPER_DOMAIN_SUFFIX=qa.athyper.test"];
  assert.throws(
    () => sourceCompose(qa, "/checkout", "sha256:" + "a".repeat(64), 1, 1),
    /local DEV/,
  );
  assert.throws(
    () => sourceCompose(originals(), "/checkout", "node:latest", 1, 1),
    /immutable/,
  );
});

test("legacy runtime search mounts use the scoped DEV key volume without exposing the master key", () => {
  const input = originals();
  input[0].Mounts.push({
    Type: "bind",
    Source: "/private/search-master-key",
    Destination: "/run/secrets/search-master-key",
    RW: false,
  });
  const plan = sourceCompose(
    input,
    "/checkout",
    "sha256:" + "a".repeat(64),
    1000,
    1000,
  );
  const mounts = plan.services[APPLICATIONS[0]].volumes;
  assert.ok(!mounts.some((m) => m.target === "/run/secrets/search-master-key"));
  assert.ok(mounts.some((m) => m.target === "/run/searchcore" && m.read_only));
  assert.deepEqual(plan.volumes["searchcore-key"], {
    external: true,
    name: "athyper-dev_searchcore-key",
  });
  input[0].Mounts.push({
    Type: "volume",
    Name: "unrelated-key",
    Destination: "/run/searchcore",
    RW: false,
  });
  assert.throws(
    () =>
      sourceCompose(input, "/checkout", "sha256:" + "a".repeat(64), 1000, 1000),
    /Unexpected DEV search key/,
  );
});

test("resumes all source applications without legacy containers and preserves their configuration", () => {
  const saved = sourceCompose(
    originals(),
    "/checkout",
    "sha256:" + "a".repeat(64),
    1000,
    1000,
    "/private/preview",
  );
  const before = structuredClone(saved);
  const resumed = resumeSourceCompose(
    saved,
    { checkout: "/checkout" },
    "/checkout",
    "sha256:" + "b".repeat(64),
  );
  assert.deepEqual(saved, before);
  assert.deepEqual(Object.keys(resumed.services), APPLICATIONS);
  for (const name of APPLICATIONS) {
    assert.equal(resumed.services[name].image, "sha256:" + "b".repeat(64));
    assert.deepEqual(
      resumed.services[name].volumes,
      saved.services[name].volumes,
    );
    assert.deepEqual(
      resumed.services[name].networks,
      saved.services[name].networks,
    );
    assert.deepEqual(
      resumed.services[name].environment,
      saved.services[name].environment,
    );
  }
  delete resumed.services["studio-web"];
  delete resumed.services["mesh-web"];
  assert.equal(
    Object.keys(
      resumeSourceCompose(
        saved,
        { checkout: "/checkout" },
        "/checkout",
        "sha256:" + "b".repeat(64),
      ).services,
    ).length,
    6,
  );
});

test("resume refuses foreign, incomplete, and non-source saved configurations", () => {
  const saved = sourceCompose(
    originals(),
    "/checkout",
    "sha256:" + "a".repeat(64),
    1000,
    1000,
  );
  const resume = (
    config,
    baseline = { checkout: "/checkout" },
    image = "sha256:" + "b".repeat(64),
  ) => resumeSourceCompose(config, baseline, "/checkout", image);
  assert.throws(
    () => resume(saved, { checkout: "/other" }),
    /another checkout/,
  );
  assert.throws(() => resume(saved, undefined, "node:latest"), /immutable/);
  for (const change of [
    (c) => {
      c.name = "athyper-qa";
    },
    (c) => {
      delete c.services.api;
    },
    (c) => {
      c.services.api.labels["io.athyper.dev-workspace.checkout"] = "/other";
    },
    (c) => {
      c.services.api.environment.ATHYPER_LOCAL_SOURCE = "0";
    },
    (c) => {
      c.services.api.environment.ATHYPER_DOMAIN_SUFFIX = "qa.athyper.test";
    },
    (c) => {
      c.services.api.volumes = [];
    },
  ]) {
    const invalid = structuredClone(saved);
    change(invalid);
    assert.throws(() => resume(invalid), /saved DEV|another checkout/);
  }
});
