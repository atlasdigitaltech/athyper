import {
  CreateBucketCommand,
  PutBucketPolicyCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { client, buckets } from "./client.mjs";
const s3 = client();
try {
  for (const Bucket of buckets) {
    try {
      await s3.send(new CreateBucketCommand({ Bucket }));
    } catch (e) {
      if (!["BucketAlreadyOwnedByYou", "BucketAlreadyExists"].includes(e.name))
        throw e;
    }
  }
  // SeaweedFS Write includes delete. An explicit deny preserves the append-only
  // artifacts-writer contract, including multi-object and version deletion.
  await s3.send(
    new PutBucketPolicyCommand({
      Bucket: "athyper-artifacts",
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "WriterCannotDelete",
            Effect: "Deny",
            Principal: "*",
            Condition: {
              StringEquals: { "aws:username": "athyper-artifacts-writer" },
            },
            Action: ["s3:DeleteObject", "s3:DeleteObjectVersion"],
            Resource: "arn:aws:s3:::athyper-artifacts/*",
          },
        ],
      }),
    }),
  );
  const probe = {
    Bucket: "athyper-artifacts",
    Key: "_probes/artifacts-sentinel",
  };
  try {
    await s3.send(new HeadObjectCommand(probe));
  } catch (e) {
    if (e.$metadata?.httpStatusCode !== 404) throw e;
    await s3.send(
      new PutObjectCommand({ ...probe, Body: "ok", ContentType: "text/plain" }),
    );
  }
  console.log("Storage buckets, policy and sentinel reconciled");
} finally {
  s3.destroy();
}
