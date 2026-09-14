import assert from "node:assert/strict";
import test from "node:test";
import { assertReviewPorts } from "../../../tooling/scripts/verification/review-port-contract.mjs";
for (const kind of ["operation", "role"]) {
  test(`${kind} generated review service must match its Traefik port`, () => {
    const compose = {
      services: { [`bp-${kind}-review`]: { environment: { PORT: "3000" } } },
    };
    assert.doesNotThrow(() => assertReviewPorts(compose));
    compose.services[`bp-${kind}-review`].environment.PORT = "4000";
    assert.throws(() => assertReviewPorts(compose), /must match/);
    delete compose.services[`bp-${kind}-review`].environment.PORT;
    assert.throws(() => assertReviewPorts(compose), /explicit PORT/);
  });
}
