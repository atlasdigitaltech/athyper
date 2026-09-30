import { readFileSync } from "node:fs";
import { S3Client } from "@aws-sdk/client-s3";
export function secret(
  name,
  root = process.env.SECRETS_ROOT ?? "/run/secrets",
) {
  const value = readFileSync(`${root}/${name}`, "utf8").replace(/\n+$/, "");
  if (!value || /[\0\r\n]/.test(value))
    throw new Error(`Invalid secret: ${name}`);
  return value;
}
export function client(
  identity = "admin",
  endpoint = process.env.S3_ENDPOINT ?? "http://objectstorage:9000",
  root,
  signing = false,
) {
  const prefix =
    identity === "writer"
      ? "objectstorage-artifacts-writer"
      : "objectstorage-app";
  const credentials =
    identity === "admin"
      ? {
          accessKeyId: "athyper-admin",
          secretAccessKey: secret("minio-root-password", root),
        }
      : {
          accessKeyId: secret(`${prefix}-access-key`, root),
          secretAccessKey: secret(`${prefix}-secret-key`, root),
        };
  return new S3Client({
    endpoint,
    region: "us-east-1",
    forcePathStyle: true,
    credentials,
    ...(signing ? { requestChecksumCalculation: "WHEN_REQUIRED" } : {}),
  });
}
export const buckets = [
  "athyper-documents",
  "athyper-artifacts",
  "athyper-transfers",
];
