#!/bin/sh
set -eu
umask 077
export LC_ALL=C

fail() { echo "pgbouncer: $*" >&2; exit 1; }

# Secrets are single-line, nonempty byte strings, at most 1024 bytes.
# Check the file before command substitution, which would discard trailing LF.
read_secret() {
  path="/run/secrets/$1"
  [ -r "$path" ] || fail "required secret is unreadable: $1"
  size=$(wc -c < "$path")
  [ "$size" -gt 0 ] && [ "$size" -le 1024 ] || fail "secret must contain 1..1024 bytes: $1"
  clean_size=$(tr -d '\000\r\n' < "$path" | wc -c)
  [ "$size" -eq "$clean_size" ] || fail "secret contains NUL, CR or LF: $1"
  cat "$path"
}

runtime_password=$(read_secret runtime-db-password)
worker_password=$(read_secret worker-db-password)
auth_file=/tmp/userlist.txt
config_file=/tmp/pgbouncer.ini

# Static allowlist only. Do not enable auth_user/auth_query fallback.
write_auth() {
  escaped=$(printf '%s' "$2" | sed 's/"/""/g')
  printf '"%s" "%s"\n' "$1" "$escaped"
}
write_auth athyper_runtime "$runtime_password" > "$auth_file"
write_auth athyper_worker "$worker_password" >> "$auth_file"
unset escaped

case "${ATHYPER_POOL_MODE:-}" in
  transaction) health_user=athyper_runtime; health_password=$runtime_password ;;
  session) health_user=athyper_worker; health_password=$worker_password ;;
  *) fail "ATHYPER_POOL_MODE must be transaction or session" ;;
esac
# libpq password files escape backslashes and colons, unlike auth_file.
escaped=$(printf '%s' "$health_password" | sed 's/\\/\\\\/g; s/:/\\:/g')
printf '127.0.0.1:5432:*:%s:%s\n' "$health_user" "$escaped" > /tmp/pgbouncer-health.pgpass
unset health_password escaped runtime_password worker_password

validate_integer() {
  case "$2" in ''|*[!0-9]*) fail "$1 must be an integer" ;; esac
  [ "${#2}" -le 7 ] && [ "$2" -ge "$3" ] && [ "$2" -le 1000000 ] || fail "$1 is outside the supported range"
}
max_client_conn=${ATHYPER_PGBOUNCER_MAX_CLIENT_CONN:-200}
default_pool_size=${ATHYPER_PGBOUNCER_DEFAULT_POOL_SIZE:-20}
reserve_pool_size=${ATHYPER_PGBOUNCER_RESERVE_POOL_SIZE:-5}
max_db_connections=${ATHYPER_PGBOUNCER_MAX_DB_CONNECTIONS:-0}
max_user_connections=${ATHYPER_PGBOUNCER_MAX_USER_CONNECTIONS:-0}
validate_integer MAX_CLIENT_CONN "$max_client_conn" 1
validate_integer DEFAULT_POOL_SIZE "$default_pool_size" 1
validate_integer RESERVE_POOL_SIZE "$reserve_pool_size" 0
validate_integer MAX_DB_CONNECTIONS "$max_db_connections" 0
validate_integer MAX_USER_CONNECTIONS "$max_user_connections" 0
cat > "$config_file" <<CONFIG
[databases]
* = host=db port=5432

[pgbouncer]
listen_addr = 0.0.0.0
listen_port = 5432
unix_socket_dir = /tmp
auth_file = $auth_file
auth_type = scram-sha-256
pool_mode = $ATHYPER_POOL_MODE
max_client_conn = $max_client_conn
default_pool_size = $default_pool_size
reserve_pool_size = $reserve_pool_size
max_db_connections = $max_db_connections
max_user_connections = $max_user_connections
ignore_startup_parameters = extra_float_digits
server_reset_query = DISCARD ALL
CONFIG
chown 70:70 "$auth_file" "$config_file" /tmp/pgbouncer-health.pgpass
exec /bin/su postgres -c "exec /usr/bin/pgbouncer '$config_file'"
