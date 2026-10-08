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
  const bundle = buildNativeBootstrapProposalBundle(
    JSON.parse(bytes.toString("utf8")),
  );
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
