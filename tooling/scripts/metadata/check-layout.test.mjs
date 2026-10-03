import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  readFileSync,
  writeFileSync,
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  cpSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkLayout } from "./check-layout.mjs";
const repo = fileURLToPath(new URL("../../../", import.meta.url));
function fixture(work) {
  const root = mkdtempSync(join(tmpdir(), "metadata-layout-"));
  try {
    const inventory = JSON.parse(
      readFileSync(join(repo, "docs/reviews/entity-metadata-checkpoint-inventory-20261003.json"), "utf8"),
    );
    for (const path of [
      "docs/reviews/entity-metadata-checkpoint-inventory-20261003.json",
      "metadata/manifest.json",
      ...inventory.deletedMetadataDisposition.flatMap((e) => e.byteIdenticalDestinations),
    ]) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      copyFileSync(join(repo, path), join(root, path));
    }
    cpSync(join(repo, "metadata"), join(root, "metadata"), { recursive: true });
    // Each synthetic fixture owns its baseline; later legitimate feature edits
    // must not be blocked by the historical relocation evidence.
    for (const item of inventory.deletedMetadataDisposition)
      item.sha256 = createHash("sha256")
        .update(readFileSync(join(root, item.byteIdenticalDestinations[0])))
        .digest("hex");
    writeFileSync(
      join(root, "docs/reviews/entity-metadata-checkpoint-inventory-20261003.json"),
      JSON.stringify(inventory),
    );
    work(root, inventory);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
test("current layout retains all mapped files and logical references", () => {
  assert.equal(checkLayout(repo).relocatedFiles, 175);
});
test("missing files and duplicate old source copies fail", () =>
  fixture((root, inventory) => {
    const item = inventory.deletedMetadataDisposition.find((e) =>
      e.byteIdenticalDestinations[0].endsWith("business_partner/core.json"),
    );
    mkdirSync(dirname(join(root, item.source)), { recursive: true });
    copyFileSync(join(root, item.byteIdenticalDestinations[0]), join(root, item.source));
    assert.throws(() => checkLayout(root), /Duplicate old definition/);
    rmSync(join(root, item.source));
    rmSync(join(root, item.byteIdenticalDestinations[0]));
    assert.throws(() => checkLayout(root), /Missing relocated file/);
  }));
test("relocation baseline detects content changes without prohibiting future edits", () =>
  fixture((root) => {
    const path = join(
      root,
      "metadata/entities/business_partner/core.json",
    );
    writeFileSync(path, readFileSync(path, "utf8") + "\n");
    assert.doesNotThrow(() => checkLayout(root));
    assert.throws(
      () => checkLayout(root, { baseline: true }),
      /differs from relocation baseline/,
    );
  }));
test("unresolved logical refs fail even when the original files remain present", () =>
  fixture((root) => {
    const path = join(
      root,
      "metadata/entities/business_partner/core.json",
    );
    const value = JSON.parse(readFileSync(path, "utf8"));
    value.exampleRef = "missing/core.json";
    writeFileSync(path, JSON.stringify(value));
    assert.throws(() => checkLayout(root), /Unresolved logical reference/);
  }));
