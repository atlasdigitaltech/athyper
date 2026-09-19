import assert from "node:assert/strict";
import test from "node:test";
import { promoteImageSet, REQUIRED_IMAGES } from "./promote-image-set.mjs";

const revision = "a".repeat(40),
  ids = REQUIRED_IMAGES;
const candidate = () => ({
  apiVersion: "athyper.io/v1alpha1",
  kind: "ImageSet",
  metadata: { id: "candidate", channel: "candidate" },
  spec: {
    sourceRevision: revision,
    images: ids.map((id, index) => ({
      id,
      reference: `ghcr.io/atlasdigitaltech/${id}@sha256:${(index + 1).toString(16).padStart(64, "0")}`,
    })),
  },
});
test("promotes exact immutable candidate digests without rebuilding", () => {
  const result = promoteImageSet(candidate());
  assert.equal(result.metadata.channel, "release");
  assert.equal(result.spec.sourceRevision, revision);
  assert.deepEqual(result.spec.images, candidate().spec.images);
});
test("rejects incomplete, mutable, or placeholder candidates", () => {
  const incomplete = candidate();
  incomplete.spec.images.pop();
  assert.throws(() => promoteImageSet(incomplete), /absent/u);
  const mutable = candidate();
  mutable.spec.images[0].reference = "ghcr.io/example:latest";
  assert.throws(() => promoteImageSet(mutable), /not immutable/u);
  const placeholder = candidate();
  placeholder.spec.sourceRevision = "0".repeat(40);
  assert.throws(() => promoteImageSet(placeholder), /non-zero/u);
});

test("rejects the old application-only inventory", () => {
  const old = candidate();
  old.spec.images = old.spec.images.filter((image) =>
    ["iam", "mesh-web", "neon-web", "runtime-server", "studio-web"].includes(
      image.id,
    ),
  );
  assert.throws(() => promoteImageSet(old), /absent/u);
});
