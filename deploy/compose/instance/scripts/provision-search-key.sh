#!/bin/sh
set -eu

searchcore_url="${SEARCHCORE_URL:-http://searchcore:7700}"
master_key="$(cat /run/secrets/search-master-key)"
[ -n "$master_key" ] || { echo "search master key is empty" >&2; exit 1; }
key_description="athyper-runtime-scoped-key"
key_actions='["search","documents.add","documents.delete","indexes.create","indexes.get","settings.update","tasks.get"]'
key_indexes='["documents","atlas_attachment_knowledge_neon","atlas_attachment_passages_*"]'
output_file="/run/searchcore/search-api-key"

meili() {
  curl -sS --fail-with-body --connect-timeout 5 --max-time 30 \
    -H "Authorization: Bearer ${master_key}" \
    -H "Content-Type: application/json" "$@"
}

# Compose gates startup on health; also bound readiness for direct invocation.
attempt=0
until curl -fsS --connect-timeout 2 --max-time 5 -o /dev/null "${searchcore_url}/health"; do
  attempt=$((attempt + 1))
  [ "$attempt" -lt 30 ] || { echo "searchcore did not become healthy" >&2; exit 1; }
  sleep 1
done

# Description lookup includes every page and rejects ambiguous duplicate credentials.
offset=0
matches='[]'
while :; do
  page="$(meili "${searchcore_url}/keys?limit=100&offset=${offset}")"
  found="$(printf '%s' "$page" | jq -c --arg desc "$key_description" '[.results[] | select(.description == $desc)]')"
  matches="$(jq -cn --argjson previous "$matches" --argjson found "$found" '$previous + $found')"
  offset=$((offset + 100))
  total="$(printf '%s' "$page" | jq -er '.total')"
  [ "$offset" -lt "$total" ] || break
done
count="$(printf '%s' "$matches" | jq 'length')"
[ "$count" -le 1 ] || { echo "Multiple runtime search keys exist; reconcile duplicates before startup" >&2; exit 1; }

create_key() {
  meili -X POST "${searchcore_url}/keys" \
    -d "$(jq -n --arg desc "$key_description" --argjson actions "$key_actions" --argjson indexes "$key_indexes" \
      '{description: $desc, actions: $actions, indexes: $indexes, expiresAt: null}')"
}

if [ "$count" -eq 1 ]; then
  response="$(printf '%s' "$matches" | jq -c '.[0]')"
  if ! printf '%s' "$response" | jq -e --argjson actions "$key_actions" --argjson indexes "$key_indexes" \
    '(.actions | sort) == ($actions | sort) and (.indexes | sort) == ($indexes | sort) and .expiresAt == null' >/dev/null; then
    # Permissions are immutable. Stop consumers before explicitly replacing the key;
    # recreate consumers afterwards so they read the newly published credential.
    [ "${SEARCHCORE_REPLACE_KEY:-false}" = true ] || {
      echo "Runtime search key policy differs; stop consumers and rerun with SEARCHCORE_REPLACE_KEY=true, then recreate consumers" >&2
      exit 1
    }
    existing_uid="$(printf '%s' "$response" | jq -er '.uid')"
    response="$(create_key)"
    meili -X DELETE "${searchcore_url}/keys/${existing_uid}" >/dev/null
  fi
else
  response="$(create_key)"
fi

key="$(printf '%s' "$response" | jq -er '.key | select(type == "string" and length > 0)')"
mkdir -p "$(dirname "$output_file")"
umask 077
temporary="$(mktemp "${output_file}.XXXXXX")"
trap 'rm -f "$temporary"' EXIT HUP INT TERM
printf '%s' "$key" > "$temporary"
chmod 0444 "$temporary"
mv -f "$temporary" "$output_file"
echo "Scoped Meilisearch key ready" >&2
