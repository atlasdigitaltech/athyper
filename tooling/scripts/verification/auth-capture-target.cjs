const { homedir } = require("node:os");
const { resolve } = require("node:path");
const identities = {
  studio: {
    "catl.admin": "81cd1978-2df5-5c9a-938a-2f8c291aea13",
    "catl.owner": "5cd6cf93-3fe4-500c-8066-3ebf14a9eb5d",
  },
  neon: {
    "catl.admin": "cca94907-7519-5871-8e3c-6b11aa545c93",
    "catl.owner": "645b6a55-3355-526a-9643-3900425bde47",
    "athyper.admin": "d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c",
    "athyper.owner": "71667bf5-941b-5f6d-aab0-355e39c0bbde",
  },
  mesh: {
    "catl.admin": "dc4ef163-269a-5b83-90ef-5b71a56087c6",
    "catl.owner": "3dd93048-ac4b-54a7-b820-32d0c457691b",
  },
};
function captureTarget({
  environment = "dev",
  plane,
  actor,
  repo,
  "isolated-studio": isolatedStudio = false,
  "isolated-neon": isolatedNeon = false,
}) {
  if (
    !["dev", "qa"].includes(environment) ||
    !Object.hasOwn(identities, plane) ||
    !["catl.admin", "catl.owner", "athyper.admin", "athyper.owner"].includes(
      actor,
    )
  )
    throw Error(
      "Use environment dev|qa, plane studio|neon|mesh and a supported actor",
    );
  if (
    isolatedStudio &&
    (environment !== "dev" ||
      plane !== "studio" ||
      !["catl.admin", "catl.owner"].includes(actor))
  )
    throw Error(
      "Isolated Studio requires dev/studio and catl.admin or catl.owner",
    );
  if (
    isolatedNeon &&
    (isolatedStudio ||
      environment !== "dev" ||
      plane !== "neon" ||
      !["catl.admin", "catl.owner"].includes(actor))
  )
    throw Error("Isolated NEON requires dev/neon and catl.admin or catl.owner");
  const isolated = isolatedStudio || isolatedNeon;
  return {
    isolatedStudio,
    isolatedNeon,
    ...(isolated
      ? {
          proxy: {
            server: isolatedStudio
              ? "http://127.0.0.1:13330"
              : "http://127.0.0.1:13320",
          },
        }
      : {}),
    environment,
    plane,
    actor,
    origin: `https://${plane}.${environment}.athyper.test`,
    principalId: identities[plane][actor],
    tenantId: actor.startsWith("catl.")
      ? "44444444-4444-4444-8444-444444444444"
      : "11111111-1111-4111-8111-111111111111",
    statePath: isolated
      ? resolve(
          homedir(),
          `.athyper/instances/dev/deployments/bp-enter-isolated-20260911/ui-auth/dev/${plane}/${actor}.json`,
        )
      : resolve(repo, `tests/e2e/.auth/${environment}/${plane}/${actor}.json`),
  };
}
module.exports = { captureTarget, identities };
