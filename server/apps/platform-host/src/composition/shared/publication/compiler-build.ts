import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

/** DEV source-build identity. Covers the compiler/authoring/contract inputs,
 * signing canonicalizer, host publication adapters and dependency lock. This is
 * a source fingerprint, not a binary attestation or an authorization grant. */
export function publicationCompilerIdentity() {
  const packages = [
    "@athyper/server-platform-ai",
    "@athyper/server-service-publication",
    "@athyper/server-service-records",
    "@athyper/server-plane-studio-meta-entity-authoring",
    "@athyper/server-platform-metadata",
    "@athyper/server-contract-publication",
    "@athyper/server-contract-meta-entity-authoring",
    "@athyper/server-contract-metadata",
    "@athyper/server-contract-ai",
    "@athyper/server-contract-records",
    "@athyper/contract-platform-ai",
    "@athyper/contract-platform-collection",
    "@athyper/server-adapter-publication-signing",
    "@athyper/contract-platform-entity-runtime",
    "@athyper/contract-platform-entity-list",
  ];
  const files: { key: string; bytes: Buffer }[] = [];
  function collect(root: string, label: string, path = root) {
    for (const entry of readdirSync(path, { withFileTypes: true }).sort(
      (a, b) => a.name.localeCompare(b.name),
    )) {
      if (
        entry.name === "__tests__" ||
        /\.(test|spec)\.[cm]?tsx?$/.test(entry.name)
      )
        continue;
      const file = join(path, entry.name);
      if (entry.isSymbolicLink())
        throw Error("PUBLICATION_COMPILER_BUILD_SYMLINK_DENIED");
      if (entry.isDirectory()) collect(root, label, file);
      else if (/\.(ts|json)$/.test(entry.name))
        files.push({
          key: `${label}/${relative(root, file)}`,
          bytes: readFileSync(file),
        });
    }
  }
  for (const name of packages) {
    const hostRequire = createRequire(import.meta.url);
    // Resolve these transitive compiler contracts through their declared owner,
    // not accidental workspace-root hoisting (which differs inside DEV hosts).
    const resolver =
      name === "@athyper/contract-platform-ai"
        ? createRequire(hostRequire.resolve("@athyper/server-contract-ai"))
        : name === "@athyper/contract-platform-entity-runtime" ||
            name === "@athyper/contract-platform-entity-list"
          ? createRequire(
              hostRequire.resolve("@athyper/server-platform-metadata"),
            )
          : hostRequire;
    const entry = realpathSync(resolver.resolve(name));
    let root = dirname(entry);
    while (!existsSync(join(root, "package.json"))) {
      const parent = dirname(root);
      if (parent === root)
        throw Error("PUBLICATION_COMPILER_BUILD_PACKAGE_MISSING");
      root = parent;
    }
    if (
      JSON.parse(readFileSync(join(root, "package.json"), "utf8")).name !== name
    )
      throw Error("PUBLICATION_COMPILER_BUILD_PACKAGE_MISMATCH");
    files.push({
      key: `${name}/package.json`,
      bytes: readFileSync(join(root, "package.json")),
    });
    collect(join(root, "src"), name);
  }
  const adapters = dirname(fileURLToPath(import.meta.url));
  collect(adapters, "platform-host/publication");
  // Native compilation also resolves controls, identities, component deployment
  // and provider/catalogue contracts through the control-plane shared assembly.
  const nativeComposition = join(dirname(dirname(adapters)), "control-plane");
  for (const file of [
    "native-review-source.ts",
    "native-bootstrap-components.ts",
    "native-bootstrap-compilation.ts",
    "native-bootstrap-authorization.ts",
    "native-bootstrap-provider.ts",
    "native-bootstrap-ai.ts",
  ])
    files.push({
      key: `platform-host/control-plane/${file}`,
      bytes: readFileSync(join(nativeComposition, file)),
    });
  // Source/registered-action admission is qualified in host composition. Pins
  // must cover these adapters and their registry, not only domain packages.
  collect(
    join(dirname(adapters), "entity-runtime"),
    "platform-host/entity-runtime",
  );
  files.push({
    key: "platform-host/register-services.ts",
    bytes: readFileSync(
      join(dirname(dirname(adapters)), "register-services.ts"),
    ),
  });
  let workspace = adapters;
  while (!existsSync(join(workspace, "pnpm-lock.yaml"))) {
    const parent = dirname(workspace);
    if (parent === workspace)
      throw Error("PUBLICATION_COMPILER_BUILD_LOCK_MISSING");
    workspace = parent;
  }
  files.push({
    key: "pnpm-lock.yaml",
    bytes: readFileSync(join(workspace, "pnpm-lock.yaml")),
  });
  const digest = createHash("sha256").update(
    `athyper.dev-compiler-source-build/1\nnode:${process.versions.node}\n`,
  );
  for (const file of files.sort((a, b) => a.key.localeCompare(b.key)))
    digest.update(`${file.key}\0${file.bytes.length}\0`).update(file.bytes);
  return Object.freeze({
    name: "athyper.compiled-entity-artifact",
    version: "1.1.0",
    buildHash: digest.digest("hex"),
  });
}

export function assertPublicationCompilerIdentity(pin: {
  name: string;
  version: string;
  buildHash: string;
}): void {
  const actual = publicationCompilerIdentity();
  if (
    pin.name !== actual.name ||
    pin.version !== actual.version ||
    pin.buildHash !== actual.buildHash
  )
    throw Error("ENTITY_SUCCESSOR_COMPILER_BUILD_CHANGED");
}
