import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import YAML from "yaml";
const config = YAML.parse(
  readFileSync(
    new URL("../../../deploy/compose/atlas/compose.yaml", import.meta.url),
    "utf8",
  ),
);
test("serving has no published ports or egress network", () => {
  const service = config.services["atlas-inference"];
  assert.equal(service.ports, undefined);
  assert.deepEqual(service.networks, ["inference"]);
  assert.equal(config.networks.inference.internal, true);
  assert.equal(service.environment.OLLAMA_NO_CLOUD, "1");
  assert.equal(
    service.deploy.resources.reservations.devices[0].driver,
    "nvidia",
  );
  assert.deepEqual(service.volumes, ["atlas-models:/root/.ollama"]);
});
test("process health does not depend on downloaded weights", () =>
  assert.deepEqual(config.services["atlas-inference"].healthcheck.test, [
    "CMD",
    "ollama",
    "list",
  ]));
test("bootstrap egress is an explicit separate overlay", () => {
  const bootstrap = YAML.parse(
    readFileSync(
      new URL(
        "../../../deploy/compose/atlas/compose.bootstrap.yaml",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.ok(bootstrap.services["atlas-inference"].networks.bootstrap);
  assert.equal(bootstrap.networks.bootstrap.internal, undefined);
});
