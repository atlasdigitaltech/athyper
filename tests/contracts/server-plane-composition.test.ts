import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { meshPlaneComposition } from "../../server/packages/planes/mesh/src/index";
import { neonPlaneComposition } from "../../server/packages/planes/neon/src/index";
import { studioPlaneComposition } from "../../server/packages/planes/studio/src/index";

type DeploymentProfile = {
  entryApplication: string;
  requiredServerServices: string[];
};

type Capability = {
  id: string;
  registration: "unconditional" | "conditional" | "not registered";
  profiles: Record<string, boolean>;
};

const profiles = (JSON.parse(readFileSync("governance/config/deployment/profiles.json", "utf8")) as {
  profiles: Record<string, DeploymentProfile>;
}).profiles;
const capabilities = (JSON.parse(readFileSync("governance/config/deployment/server-capabilities.json", "utf8")) as {
  capabilities: Capability[];
}).capabilities;
const hostManifest = JSON.parse(readFileSync("server/apps/platform-host/package.json", "utf8")) as {
  dependencies: Record<string, string>;
};

const compositions = [studioPlaneComposition, neonPlaneComposition, meshPlaneComposition];

describe("server plane composition", () => {
  it("keeps each plane's authority and dependencies explicit", () => {
    assert.deepEqual(compositions, [
      {
        planeKey: "studio",
        role: "control-authority",
        owns: ["onboarding", "metadata-authoring", "publication", "desired-state"],
        consumes: ["plane-reconciliation-receipts"],
      },
      {
        planeKey: "neon",
        role: "enterprise-runtime",
        owns: ["enterprise-business-records", "plane-authorization", "plane-audit", "plane-outbox"],
        consumes: ["signed-control-projections", "idempotent-provisioning-commands"],
      },
      {
        planeKey: "mesh",
        role: "network-runtime",
        owns: ["network-accounts", "relationships", "exchange-envelopes", "plane-authorization", "plane-audit", "plane-outbox"],
        consumes: ["signed-control-projections", "idempotent-provisioning-commands"],
      },
    ]);
    assert.equal(new Set(compositions.map(({ planeKey }) => planeKey)).size, compositions.length);
  });

  for (const [planeKey, application, serverPackage] of [
    ["studio", "@athyper/studio", "@athyper/server-plane-studio"],
    ["neon", "@athyper/neon", "@athyper/server-plane-neon"],
    ["mesh", "@athyper/mesh", "@athyper/server-plane-mesh"],
  ] as const) {
    it(`${planeKey} is represented by its application and server composition packages`, () => {
      assert.equal(profiles[`athyper-${planeKey}`]?.entryApplication, application);
      assert.ok(profiles["athyper-server"]?.requiredServerServices.includes(serverPackage));
      assert.equal(hostManifest.dependencies[serverPackage], "workspace:*");
    });
  }

  it("publishes an explicit availability assertion for every deployment profile", () => {
    const profileNames = Object.keys(profiles).sort();
    assert.ok(capabilities.length > 0);

    for (const capability of capabilities) {
      assert.deepEqual(Object.keys(capability.profiles).sort(), profileNames, `${capability.id} profile coverage`);
      for (const availability of Object.values(capability.profiles)) assert.equal(typeof availability, "boolean");
      if (capability.registration === "not registered") {
        assert.ok(Object.values(capability.profiles).every((availability) => !availability));
      }
    }
  });
});
