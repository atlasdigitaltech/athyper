#!/bin/sh
set -eu

read_secret() {
  path="/run/secrets/$1"
  [ -s "$path" ] || { echo "required secret is absent or empty: $path" >&2; exit 1; }
  value="$(cat "$path")"
  [ -n "$value" ] || { echo "required secret is empty: $path" >&2; exit 1; }
  printf '%s' "$value"
}

password="$(read_secret minio-root-password)"
app_access_key="$(read_secret objectstorage-app-access-key)"
app_secret_key="$(read_secret objectstorage-app-secret-key)"
mc alias set local http://objectstorage:9000 athyper-admin "$password"
unset password
mc mb --ignore-existing local/athyper-documents
mc mb --ignore-existing local/athyper-exports
mc mb --ignore-existing local/athyper-imports
mc anonymous set none local/athyper-documents
mc anonymous set none local/athyper-exports
mc anonymous set none local/athyper-imports
policy="$(mktemp /tmp/athyper-app-policy.XXXXXX.json)"
trap 'rm -f -- "$policy"' EXIT HUP INT TERM
cat > "$policy" <<'JSON'
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
mc admin policy info local athyper-app >/dev/null 2>&1 \
  || mc admin policy create local athyper-app "$policy"
printf '%s\n%s\n' "$app_access_key" "$app_secret_key" | mc admin user add local
mc admin policy attach local athyper-app --user="$app_access_key"
unset app_access_key app_secret_key
