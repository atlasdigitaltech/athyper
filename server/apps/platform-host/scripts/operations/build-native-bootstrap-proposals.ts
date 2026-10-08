import { Kysely } from "kysely";
import {
  createPostgresPool,
  createPostgresDialect,
} from "@athyper/server-adapter-db-core";
import {
  buildNativeReferenceProduct,
  parseSharedReferenceProduct,
  readNativeStorageCatalogue,
  type NativeReferenceProductInput,
} from "@athyper/server-plane-studio-meta-entity-authoring";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { buildNativeBootstrapProposalBundle } from "../../src/composition/control-plane/native-bootstrap-bundle.js";

/** Offline authoring transport. This neither installs startup configuration nor
 * issues database commands or publication approvals. Existing output is never
 * overwritten; the manifest is written last so incomplete staging cannot load. */
async function main() {
  const [input, output, ...extra] = process.argv.slice(2);
  if (!input || !output || extra.length)
    throw Error(
      "Usage: tsx scripts/operations/build-native-bootstrap-proposals.ts <native-input.json> <new-output-directory>",
    );
  const source = resolve(input);
  const info = await stat(source);
  if (!info.isFile() || info.size > 16 * 1024 * 1024)
    throw Error("NATIVE_BOOTSTRAP_INPUT_BUDGET");
  const bytes = await readFile(source);
  if (bytes.length > 16 * 1024 * 1024)
    throw Error("NATIVE_BOOTSTRAP_INPUT_BUDGET");
  let candidate = JSON.parse(bytes.toString("utf8"));
  if (candidate.schema === "entity.native-reference-input/1") {
    const {
      schema: _schema,
      databaseUrlFile,
      products,
      maximumBytes,
      maximumMembers,
    } = candidate;
    if (
      Object.keys(candidate).sort().join() !==
        "databaseUrlFile,maximumBytes,maximumMembers,products,schema" ||
      !Array.isArray(products) ||
      !products.length ||
      products.length > 256
    )
      throw Error("NATIVE_REFERENCE_INPUT_INVALID");
    const secret = await stat(databaseUrlFile);
    if (!secret.isFile() || (secret.mode & 0o077) !== 0 || secret.size > 65536)
      throw Error("NATIVE_REFERENCE_DATABASE_FILE_INVALID");
    const database = new Kysely<Record<string, never>>({
      dialect: createPostgresDialect(
        createPostgresPool({
          connectionString: (await readFile(databaseUrlFile, "utf8")).trim(),
          max: 1,
        }),
      ),
    });
    try {
      const proposals = await database
        .transaction()
        .setAccessMode("read only")
        .execute(async (tx) => {
          const prepared = [];
          for (const entry of products) {
            if (
              Object.keys(entry).sort().join() !==
                "branchCode,definition,identity,title" ||
              !entry.identity
            )
              throw Error("NATIVE_REFERENCE_INPUT_INVALID");
            const product = parseSharedReferenceProduct(entry.definition);
            const catalogue = await readNativeStorageCatalogue(tx, "studio", {
              plane: "studio",
              schema: "shared",
              object: product.definition.storageObject,
            });
            const identity = entry.identity as Omit<
              NativeReferenceProductInput,
              "product" | "catalogue"
            >;
            const graph = buildNativeReferenceProduct({
              ...identity,
              product,
              catalogue,
            });
            prepared.push({
              authorId: identity.authorId,
              proposal: {
                graph,
                title: entry.title,
                branchCode: entry.branchCode,
                baseReleaseId: null,
              },
            });
          }
          return prepared;
        });
      candidate = { maximumBytes, maximumMembers, proposals };
    } finally {
      await database.destroy();
    }
  }
  const bundle = buildNativeBootstrapProposalBundle(candidate);
  const root = resolve(output);
  await mkdir(root, { mode: 0o700 });
  for (const [name, content] of Object.entries(bundle.files).filter(
    ([name]) => name !== "manifest.json",
  ))
    await writeFile(join(root, name), content, { flag: "wx", mode: 0o600 });
  await writeFile(join(root, "manifest.json"), bundle.files["manifest.json"], {
    flag: "wx",
    mode: 0o600,
  });
  process.stdout.write(
    JSON.stringify(
      {
        root,
        manifest: "manifest.json",
        manifestHash: bundle.manifestHash,
        commands: bundle.commands,
      },
      null,
      2,
    ) + "\n",
  );
}
main().catch((error) => {
  process.stderr.write(
    String(error instanceof Error ? error.message : error) + "\n",
  );
  process.exitCode = 1;
});
