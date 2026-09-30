import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
export function qaPublicationDocument(root, refs, proxyImage, user) {
  if (
    refs.INFISICAL_ENVIRONMENT !== "qa" ||
    refs.INFISICAL_URL !== "https://secrets.qa.athyper.test:8443" ||
    !/^athyper-qa-[a-z0-9-]+$/.test(refs.PUBLICATION_SIGNING_KEY_ID) ||
    !/^PUBLICATION_QA_[A-Z0-9_]+$/.test(
      refs.PUBLICATION_PRIVATE_KEY_REFERENCE,
    ) ||
    !/^PUBLICATION_QA_[A-Z0-9_]+$/.test(
      refs.PUBLICATION_PUBLIC_KEY_REFERENCE,
    ) ||
    refs.PUBLICATION_TARGET_PLANES !== "neon" ||
    !/^[-0-9a-f]{36}$/.test(refs.INFISICAL_WORKSPACE_ID) ||
    refs.INFISICAL_SECRET_PATH !== "/" ||
    refs.PUBLICATION_RUNTIME_VERSION !== "1.0.0" ||
    refs.PUBLICATION_APPLIER_PRINCIPAL_CODE !==
      "seed.three-plane-provisioner" ||
    refs.PUBLICATION_INFISICAL_TOKEN_FILE !==
      join(root, "instances/qa/secrets/publication-infisical-token")
  )
    throw Error("Independent bounded QA signing references required");
  const keys = [
    "PUBLICATION_APPLIER_PRINCIPAL_CODE",
    "PUBLICATION_TARGET_PLANES",
    "PUBLICATION_RUNTIME_VERSION",
    "PUBLICATION_SIGNING_KEY_ID",
    "PUBLICATION_PRIVATE_KEY_REFERENCE",
    "PUBLICATION_PUBLIC_KEY_REFERENCE",
    "INFISICAL_URL",
    "INFISICAL_WORKSPACE_ID",
    "INFISICAL_ENVIRONMENT",
    "INFISICAL_SECRET_PATH",
    "PUBLICATION_INFISICAL_TOKEN_FILE",
  ];
  if (
    Object.keys(refs).some((k) => !keys.includes(k)) ||
    Object.keys(refs).length !== keys.length
  )
    throw Error("Unsupported QA signing references");
  if (!/^sha256:[a-f0-9]{64}$/.test(proxyImage) || !/^\d+:\d+$/.test(user))
    throw Error("Immutable QA TLS proxy and numeric user required");
  const directory = join(root, "instances/qa/config"),
    tlsConfig = join(directory, "publication-secretstore.yaml"),
    network = "athyper-local-publication-provider";
  const common = Object.fromEntries(
    Object.entries(refs).filter(
      ([k]) =>
        ![
          "PUBLICATION_INFISICAL_TOKEN_FILE",
          "PUBLICATION_APPLIER_PRINCIPAL_CODE",
        ].includes(k),
    ),
  );
  Object.assign(common, {
    INFISICAL_TOKEN_FILE: "/run/secrets/publication-infisical-token",
    NODE_EXTRA_CA_CERTS: "/run/secrets/publication-tls-certificate",
    PUBLICATION_REQUIRE_SIGNATURE: "true",
  });
  const secrets = [
    "publication-infisical-token",
    "publication-tls-certificate",
  ];
  return {
    services: {
      api: {
        environment: {
          ...common,
          PUBLICATION_API_ENABLED: "true",
          PUBLICATION_AUTHORING_ENABLED: "true",
        },
        secrets,
      },
      worker: {
        environment: {
          ...common,
          PUBLICATION_APPLIER_PRINCIPAL_CODE:
            refs.PUBLICATION_APPLIER_PRINCIPAL_CODE,
          PUBLICATION_COMPILE_ENABLED: "true",
          PUBLICATION_DISPATCH_ENABLED: "true",
          PUBLICATION_APPLY_ENABLED: "true",
        },
        secrets,
      },
      "publication-secretstore-tls": {
        user: user,
        image: proxyImage,
        command: [
          "--entrypoints.https.address=:8443",
          "--providers.file.filename=/etc/traefik/publication-secretstore.yaml",
          "--api.dashboard=false",
          "--log.level=ERROR",
        ],
        restart: "unless-stopped",
        read_only: true,
        cap_drop: ["ALL"],
        security_opt: ["no-new-privileges:true"],
        networks: {
          app: { aliases: ["secrets.qa.athyper.test"] },
          "publication-provider": {},
        },
        volumes: [`${tlsConfig}:/etc/traefik/publication-secretstore.yaml:ro`],
        secrets: ["publication-tls-certificate", "publication-tls-private-key"],
      },
    },
    networks: { "publication-provider": { external: true, name: network } },
    secrets: {
      "publication-infisical-token": {
        file: join(root, "instances/qa/secrets/publication-infisical-token"),
      },
      "publication-tls-certificate": {
        file: join(root, "platform/secrets/tls.crt"),
      },
      "publication-tls-private-key": {
        file: join(root, "platform/secrets/tls.key"),
      },
    },
  };
}
export function loadQaPublication(root, instance) {
  const path = join(root, "instances/qa/config/publication.compose.json");
  if (instance.metadata.id !== "qa" || !existsSync(path)) return null;
  if (
    instance.spec.domainSuffix !== "qa.athyper.test" ||
    !/^athyper-qa-candidate-[0-9]{13}$/.test(instance.spec.composeProject)
  )
    throw Error("Publication profile requires isolated local QA");
  const refsPath = join(
    root,
    "instances/qa/secrets/publication-environment.json",
  );
  for (const file of [path, refsPath])
    if ((statSync(file).mode & 0o077) !== 0)
      throw Error("QA publication configuration must be owner-only");
  const doc = JSON.parse(readFileSync(path, "utf8")),
    refs = JSON.parse(readFileSync(refsPath, "utf8"));
  const expected = qaPublicationDocument(
    root,
    refs,
    doc.services?.["publication-secretstore-tls"]?.image,
    doc.services?.["publication-secretstore-tls"]?.user,
  );
  if (JSON.stringify(doc) !== JSON.stringify(expected))
    throw Error("Unsupported QA publication override");
  return path;
}
