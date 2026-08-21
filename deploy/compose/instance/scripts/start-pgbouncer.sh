#!/bin/sh
set -eu

password="$(cat /run/secrets/postgres-password)"
runtime_password="$(cat /run/secrets/runtime-db-password)"
worker_password="$(cat /run/secrets/worker-db-password)"
auth_file=/tmp/userlist.txt
config_file=/tmp/pgbouncer.ini

printf '"postgres" "%.1024s"\n' "$password" > "$auth_file"
printf '"athyper_runtime" "%.1024s"\n' "$runtime_password" >> "$auth_file"
printf '"athyper_worker" "%.1024s"\n' "$worker_password" >> "$auth_file"
chmod 600 "$auth_file"
cat > "$config_file" <<EOF
[databases]
* = host=db port=5432 auth_user=postgres

[pgbouncer]
listen_addr = 0.0.0.0
listen_port = 5432
unix_socket_dir = /tmp
auth_file = $auth_file
auth_type = scram-sha-256
pool_mode = ${ATHYPER_POOL_MODE:?pool mode is required}
max_client_conn = 200
default_pool_size = 20
reserve_pool_size = 5
ignore_startup_parameters = extra_float_digits
server_reset_query = DISCARD ALL
EOF
unset password runtime_password worker_password
chown 70:70 "$auth_file" "$config_file"
exec /bin/su postgres -c "exec /usr/bin/pgbouncer '$config_file'"
