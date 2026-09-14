#!/bin/sh
set -eu

# Keep headroom for allocator fragmentation, AOF buffers and fork copy-on-write.
# Sessions and BullMQ share this server: arbitrary eviction is unsafe.
maxmemory_mb="${REDIS_MAXMEMORY_MB:-256}"
case "$maxmemory_mb" in
  ''|*[!0-9]*) echo "REDIS_MAXMEMORY_MB must be a positive integer" >&2; exit 1 ;;
esac
[ "$maxmemory_mb" -gt 0 ] && [ "$maxmemory_mb" -le 1048576 ] || {
  echo "REDIS_MAXMEMORY_MB must be between 1 and 1048576" >&2; exit 1
}

umask 077
password="$(cat "${REDIS_PASSWORD_FILE:-/run/secrets/redis-password}")"
if [ -z "$password" ]; then
  echo "Redis password file must not be empty" >&2
  exit 1
fi

# Encode every byte inside a Redis double-quoted string. This prevents quotes,
# backslashes or embedded newlines from becoming configuration directives.
# Secret bytes travel over stdin, never through an external command's argv.
config="$(mktemp /tmp/redis.conf.XXXXXX)"
trap 'rm -f "$config"' EXIT HUP INT TERM
{
  printf 'requirepass "'
  printf '%s' "$password" | od -An -v -tx1 | tr -d ' \n' | sed 's/../\\x&/g'
  printf '"\n'
} > "$config"
unset password
chmod 600 "$config"
# Support retained Redis rollback images as well as the qualified Valkey image.
server=redis-server
owner=redis
if command -v valkey-server >/dev/null 2>&1; then
  server=valkey-server
  owner=valkey
fi
if [ "$(id -u)" = 0 ]; then
  chown "$owner:$owner" "$config"
fi
# Preserve upstream volume ownership repair and privilege dropping. The config
# remains readable only by the Redis owner and disappears with the /tmp tmpfs.
exec /usr/local/bin/docker-entrypoint.sh "$server" "$config" --appendonly yes --appendfsync everysec --maxmemory "${maxmemory_mb}mb" --maxmemory-policy noeviction
