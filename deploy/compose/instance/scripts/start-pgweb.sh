#!/bin/sh
set -eu

umask 077
bookmarks_dir="$(mktemp -d /tmp/pgweb-bookmarks.XXXXXX)"
# Percent-encode secret bytes before embedding the URI in TOML. This handles
# quotes, backslashes and URI delimiters without putting credentials in argv.
db_password="$(od -An -v -tx1 /run/secrets/runtime-db-password | tr -d ' \n' | sed 's/../%&/g')"
[ -n "$db_password" ] || { echo "runtime database password must not be empty" >&2; exit 1; }
for plane in neon mesh studio; do
  printf 'url = "postgres://athyper_runtime:%s@dbpool-session:5432/athyper_%s?sslmode=disable"\n' \
    "$db_password" "$plane" > "$bookmarks_dir/$plane.toml"
done
unset db_password
exec /usr/bin/pgweb --bind=0.0.0.0 --listen=8081 \
  --sessions --bookmarks-dir="$bookmarks_dir"
