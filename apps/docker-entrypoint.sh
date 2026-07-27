#!/bin/sh
set -eu

case "${APP_NAME:-}" in
  neon|mesh|admin) ;;
  *)
    echo "Unsupported or missing APP_NAME: ${APP_NAME:-<unset>}" >&2
    exit 64
    ;;
esac

server_path="/app/apps/${APP_NAME}/server.js"
if [ ! -f "${server_path}" ]; then
  echo "Standalone server not found: ${server_path}" >&2
  exit 66
fi

exec node "${server_path}"
