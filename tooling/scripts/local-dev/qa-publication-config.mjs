/** Owner-only deployment configuration for signed, isolated local QA publication. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { qaPublicationDocument } from "../../../deploy/stackctl/src/qa-publication.mjs";
import { qaProject } from "./qa-runtime.mjs";
process.umask(0o077);
const project = qaProject();
if (!/^athyper-qa-candidate-[0-9]{13}$/.test(project))
  throw Error("Fresh isolated QA is required");
const root = join(homedir(), ".athyper");
const refs = JSON.parse(
  readFileSync(
    join(root, "instances/qa/secrets/publication-environment.json"),
    "utf8",
  ),
);
if (
  refs.INFISICAL_ENVIRONMENT !== "qa" ||
  refs.INFISICAL_URL !== "https://secrets.qa.athyper.test:8443" ||
  !refs.PUBLICATION_SIGNING_KEY_ID.startsWith("athyper-qa-")
)
  throw Error("Independent QA signing configuration required");
const directory = join(root, "instances/qa/config");
mkdirSync(directory, { recursive: true, mode: 0o700 });
const network = "athyper-local-publication-provider";
const docker = (args) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
const networks = JSON.parse(
  docker([
    "inspect",
    "athyper-dev-secretstore-1",
    "--format",
    "{{json .NetworkSettings.Networks}}",
  ]),
);
if (!networks[network]) {
  const names = docker(["network", "ls", "--format", "{{.Name}}"]).split("\n");
  if (!names.includes(network))
    docker(["network", "create", "--internal", network]);
  docker([
    "network",
    "connect",
    "--alias",
    "publication-provider",
    network,
    "athyper-dev-secretstore-1",
  ]);
}
const tlsConfig = join(directory, "publication-secretstore.yaml");
writeFileSync(
  tlsConfig,
  JSON.stringify(
    {
      http: {
        routers: {
          secretstore: {
            rule: "Host(`secrets.qa.athyper.test`)",
            entryPoints: ["https"],
            tls: {},
            service: "secretstore",
          },
        },
        services: {
          secretstore: {
            loadBalancer: {
              servers: [{ url: "http://publication-provider:8080" }],
            },
          },
        },
      },
      tls: {
        certificates: [
          {
            certFile: "/run/secrets/publication-tls-certificate",
            keyFile: "/run/secrets/publication-tls-private-key",
          },
        ],
      },
    },
    null,
    2,
  ) + "\n",
  { mode: 0o600 },
);
const document = qaPublicationDocument(
  root,
  refs,
  docker([
    "inspect",
    "athyper-dev-publication-secretstore-tls-1",
    "--format",
    "{{.Image}}",
  ]),
  `${process.getuid()}:${process.getgid()}`,
);
const path = join(directory, "publication.compose.json");
writeFileSync(path, JSON.stringify(document, null, 2) + "\n", { mode: 0o600 });
console.log(
  JSON.stringify({
    project,
    path,
    keyId: refs.PUBLICATION_SIGNING_KEY_ID,
    releaseQualified: false,
  }),
);
