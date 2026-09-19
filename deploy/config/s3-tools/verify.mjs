import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  CopyObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { client } from "./client.mjs";
const admin = client(),
  app = client("app"),
  writer = client("writer"),
  signer = client("app", undefined, undefined, true);
const Key = `_qualification/${randomUUID()}`;
const body = "S3 permissions and metadata fixture";
try {
  for (const Bucket of ["athyper-documents", "athyper-transfers"]) {
    await app.send(
      new PutObjectCommand({
        Bucket,
        Key,
        Body: body,
        ContentType: "text/plain",
        Metadata: { qualification: "retained" },
      }),
    );
    const result = await app.send(new GetObjectCommand({ Bucket, Key }));
    assert.equal(await result.Body.transformToString(), body);
    assert.equal(result.Metadata.qualification, "retained");
    assert.equal(
      (
        await app.send(
          new GetObjectCommand({ Bucket, Key, Range: "bytes=0-1" }),
        )
      ).ContentLength,
      2,
    );
    const signedGet = await getSignedUrl(
      signer,
      new GetObjectCommand({ Bucket, Key }),
      { expiresIn: 60 },
    );
    assert.equal(await (await fetch(signedGet)).text(), body);
    const signedPut = await getSignedUrl(
      signer,
      new PutObjectCommand({ Bucket, Key: Key + "-signed" }),
      { expiresIn: 60 },
    );
    const response = await fetch(signedPut, { method: "PUT", body });
    assert.equal(response.status, 200, await response.text());
    await app.send(
      new CopyObjectCommand({
        Bucket,
        Key: Key + "-copy",
        CopySource: Bucket + "/" + Key,
      }),
    );
    assert.equal(
      await (
        await app.send(new GetObjectCommand({ Bucket, Key: Key + "-copy" }))
      ).Body.transformToString(),
      body,
    );
    await app.send(
      new DeleteObjectsCommand({
        Bucket,
        Delete: {
          Objects: [{ Key }, { Key: Key + "-signed" }, { Key: Key + "-copy" }],
        },
      }),
    );
  }
  const Bucket = "athyper-artifacts";
  await writer.send(new PutObjectCommand({ Bucket, Key, Body: body }));
  assert.equal(
    await (
      await app.send(new GetObjectCommand({ Bucket, Key }))
    ).Body.transformToString(),
    body,
  );
  await assert.rejects(
    app.send(new PutObjectCommand({ Bucket, Key, Body: "forbidden" })),
    (e) => e.$metadata?.httpStatusCode === 403,
  );
  await assert.rejects(
    writer.send(new DeleteObjectCommand({ Bucket, Key })),
    (e) => e.$metadata?.httpStatusCode === 403,
  );
  const batch = await writer.send(
    new DeleteObjectsCommand({ Bucket, Delete: { Objects: [{ Key }] } }),
  );
  assert.equal(batch.Errors?.[0]?.Code, "AccessDenied");
  await assert.rejects(
    writer.send(new ListObjectsV2Command({ Bucket: "athyper-documents" })),
    (e) => e.$metadata?.httpStatusCode === 403,
  );
  const { UploadId } = await writer.send(
    new CreateMultipartUploadCommand({ Bucket, Key: Key + "-multipart" }),
  );
  const { ETag } = await writer.send(
    new UploadPartCommand({
      Bucket,
      Key: Key + "-multipart",
      UploadId,
      PartNumber: 1,
      Body: Buffer.alloc(5 * 1024 * 1024, 42),
    }),
  );
  await writer.send(
    new CompleteMultipartUploadCommand({
      Bucket,
      Key: Key + "-multipart",
      UploadId,
      MultipartUpload: { Parts: [{ ETag, PartNumber: 1 }] },
    }),
  );
  await admin.send(
    new DeleteObjectsCommand({
      Bucket,
      Delete: { Objects: [{ Key }, { Key: Key + "-multipart" }] },
    }),
  );
  console.log(
    "PASS: application scopes, writer delete denials, presigned URLs, copy, ranges, metadata and multipart uploads",
  );
} finally {
  admin.destroy();
  app.destroy();
  writer.destroy();
  signer.destroy();
}
