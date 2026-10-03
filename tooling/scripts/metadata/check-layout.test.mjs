import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  readFileSync,
  writeFileSync,
  mkdtempSync,
  mkdirSync,
  copyFileSync,
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
      readFileSync(join(repo, "metadata/relocation-map.json"), "utf8"),
    );
    for (const path of [
      "metadata/relocation-map.json",
      "metadata/manifest.json",
      ...inventory.files.map((e) => e.to),
    ]) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      copyFileSync(join(repo, path), join(root, path));
    }
    // Each synthetic fixture owns its baseline; later legitimate feature edits
    // must not be blocked by the historical relocation evidence.
    for (const item of inventory.files)
      item.sha256 = createHash("sha256")
        .update(readFileSync(join(root, item.to)))
        .digest("hex");
    writeFileSync(
      join(root, "metadata/relocation-map.json"),
      JSON.stringify(inventory),
    );
    work(root, inventory);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
test("current layout retains all mapped files and logical references", () => {
  assert.equal(checkLayout(repo).relocatedFiles, 132);
});
test("missing files and duplicate old source copies fail", () =>
  fixture((root, inventory) => {
    const item = inventory.files.find((e) =>
      e.to.endsWith("business_partner/core.json"),
    );
    mkdirSync(dirname(join(root, item.from)), { recursive: true });
    copyFileSync(join(root, item.to), join(root, item.from));
    assert.throws(() => checkLayout(root), /Duplicate old definition/);
    rmSync(join(root, item.from));
    rmSync(join(root, item.to));
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
