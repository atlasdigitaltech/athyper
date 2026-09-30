import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { Upload } from "@aws-sdk/lib-storage";
import {
  ListBucketsCommand,
  ListObjectsV2Command,
  GetBucketVersioningCommand,
  GetObjectCommand,
  GetObjectTaggingCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { client, buckets } from "./client.mjs";
if (!process.env.SOURCE_ENDPOINT || !process.env.TARGET_ENDPOINT)
  throw new Error("Explicit source and target endpoints required");
const source = client(
  "admin",
  process.env.SOURCE_ENDPOINT,
  "/run/source-secrets",
);
const target = client("admin", process.env.TARGET_ENDPOINT);
const hash = async (body) => {
  const h = createHash("sha256");
  for await (const chunk of body) h.update(chunk);
  return h.digest("hex");
};
const inventory = async (s3, Bucket) => {
  const all = [];
  let ContinuationToken;
  do {
    const result = await s3.send(
      new ListObjectsV2Command({ Bucket, ContinuationToken }),
    );
    all.push(
      ...(result.Contents ?? []).map(({ Key, ETag, Size }) => ({
        Key,
        ETag,
        Size,
      })),
    );
    ContinuationToken = result.NextContinuationToken;
  } while (ContinuationToken);
  return all.sort((a, b) => a.Key.localeCompare(b.Key));
};
const evidence = [];
try {
  const actual = (await source.send(new ListBucketsCommand({}))).Buckets.map(
    (b) => b.Name,
  ).sort();
  assert.deepEqual(
    actual,
    [...buckets].sort(),
    "Unexpected source buckets require explicit migration coverage",
  );
  for (const Bucket of buckets) {
    const versioning = await source.send(
      new GetBucketVersioningCommand({ Bucket }),
    );
    assert.ok(
      !versioning.Status,
      "Versioned sources require a version-history migration; never flatten history",
    );
    const before = await inventory(source, Bucket);
    for (const { Key, ETag, Size } of before) {
      const original = await source.send(
        new GetObjectCommand({ Bucket, Key, IfMatch: ETag }),
      );
      const tags = await source.send(
        new GetObjectTaggingCommand({ Bucket, Key }),
      );
      const params = {
        Bucket,
        Key,
        Body: original.Body,
        ContentLength: Size,
        Metadata: original.Metadata,
      };
      for (const field of [
        "ContentType",
        "CacheControl",
        "ContentDisposition",
        "ContentEncoding",
        "ContentLanguage",
        "Expires",
      ])
        if (original[field] !== undefined) params[field] = original[field];
      if (tags.TagSet?.length)
        params.Tagging = new URLSearchParams(
          tags.TagSet.map((t) => [t.Key, t.Value]),
        ).toString();
      await new Upload({
        client: target,
        params,
        queueSize: 1,
        partSize: 5 * 1024 * 1024,
      }).done();
      const copied = await target.send(new GetObjectCommand({ Bucket, Key }));
      assert.equal(copied.ContentLength, Size);
      assert.deepEqual(copied.Metadata, original.Metadata);
      for (const field of [
        "ContentType",
        "CacheControl",
        "ContentDisposition",
        "ContentEncoding",
        "ContentLanguage",
      ])
        assert.equal(copied[field], original[field]);
      const sourceHash = await hash(
        (
          await source.send(
            new GetObjectCommand({ Bucket, Key, IfMatch: ETag }),
          )
        ).Body,
      );
      assert.equal(
        await hash(copied.Body),
        sourceHash,
        "Object content differs",
      );
      assert.deepEqual(
        (await target.send(new GetObjectTaggingCommand({ Bucket, Key })))
          .TagSet,
        tags.TagSet,
      );
      evidence.push({
        bucket: Bucket,
        key: Key,
        bytes: Size,
        sha256: sourceHash,
      });
    }
    assert.deepEqual(
      await inventory(source, Bucket),
      before,
      "Source changed during copy; repeat under a write pause",
    );
    assert.deepEqual(
      (await inventory(target, Bucket)).map(({ Key, Size }) => ({ Key, Size })),
      before.map(({ Key, Size }) => ({ Key, Size })),
      "Destination contains missing or unexpected objects",
    );
  }
  writeFileSync(
    "/evidence/migration.json",
    JSON.stringify({ verified: true, objects: evidence }, null, 2),
    { mode: 0o600 },
  );
  console.log(
    `Verified ${evidence.length} objects by SHA256, size, metadata, tags and stable source inventory`,
  );
} finally {
  source.destroy();
  target.destroy();
}
