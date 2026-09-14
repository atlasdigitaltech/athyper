import assert from "node:assert/strict";
import test from "node:test";
import { summarizeImage } from "../src/image-inventory.mjs";
test("image inventory detects mutable-tag drift and excludes credentials", () => {
  const container = {
    Name: "/test-api-1",
    Image: "sha256:old",
    Config: {
      Image: "test/api:dev",
      Env: ["PASSWORD=sensitive"],
      Labels: { "com.docker.compose.service": "api" },
    },
    State: { Status: "running", Health: { Status: "healthy" } },
  };
  const image = {
    RepoDigests: ["test/api@sha256:old"],
    Config: {
      Env: ["SECRET=sensitive"],
      Labels: {
        "org.opencontainers.image.revision": "old-revision",
        secret: "sensitive",
      },
    },
  };
  const result = summarizeImage(container, image, "test/api:dev", "sha256:new");
  assert.equal(result.referenceMatches, true);
  assert.equal(result.matchesLocallyResolvedDesiredImage, false);
  assert.equal(result.sourceRevision, "old-revision");
  assert.doesNotMatch(JSON.stringify(result), /sensitive|PASSWORD|SECRET/);
  assert.equal(
    summarizeImage(container, image).matchesLocallyResolvedDesiredImage,
    null,
  );
});
