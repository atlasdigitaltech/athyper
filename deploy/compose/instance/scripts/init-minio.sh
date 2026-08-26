#!/bin/sh
set -eu

password="$(cat /run/secrets/minio-root-password)"
app_access_key="$(cat /run/secrets/objectstorage-app-access-key)"
app_secret_key="$(cat /run/secrets/objectstorage-app-secret-key)"
mc alias set local http://objectstorage:9000 athyper-admin "$password"
unset password
mc mb --ignore-existing local/athyper-documents
mc mb --ignore-existing local/athyper-exports
mc mb --ignore-existing local/athyper-imports
mc anonymous set none local/athyper-documents
mc anonymous set none local/athyper-exports
mc anonymous set none local/athyper-imports
cat > /tmp/athyper-app-policy.json <<'JSON'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetBucketLocation", "s3:ListBucket"],
      "Resource": ["arn:aws:s3:::athyper-documents", "arn:aws:s3:::athyper-exports", "arn:aws:s3:::athyper-imports"]
    },
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": ["arn:aws:s3:::athyper-documents/*", "arn:aws:s3:::athyper-exports/*", "arn:aws:s3:::athyper-imports/*"]
    }
  ]
}
JSON
mc admin policy create local athyper-app /tmp/athyper-app-policy.json
printf '%s\n%s\n' "$app_access_key" "$app_secret_key" | mc admin user add local
mc admin policy attach local athyper-app --user="$app_access_key"
unset app_access_key app_secret_key
