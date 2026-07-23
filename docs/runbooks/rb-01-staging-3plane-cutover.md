# RB-01 — Staging cutover: `feature/finance-core` → `refactor/three-plane-packages`

**Status:** Draft
**Type:** Cutover (destructive; requires full DB reset per pre-prod policy)
**Estimated window:** 3 hours (2h execution + 30m verification + 30m rollback buffer)
**Owner:** Platform + IAM
**Audience:** Anyone with SSH + sudo on `athyper-staging`

---

## 1. Summary

Deploy the three-plane package refactor to staging. This is a cutover, not an
incremental deploy: it restructures the entire package tree
(`packages/shared/` → `packages/{product,shared,domain,apps}/`), rewrites 833
DDL files (destructive drops on `address_contacts`, `apply_period_close_states`,
`delegation_grants`), introduces four new network tables
(`buyer_networks`, `neon_le_groups`, `admin_plane_bindings`,
`mesh_buyer_bindings`, `legal_entity_network_accounts`), replaces the
Keycloak realm JSON entirely, ships a new Java extension
(`iam-presentation-context`), and renames ~40 env vars.

Rehearsal on a scratch VM is required before touching real staging.

## 2. Scope of change

| Area | Change |
|------|--------|
| Server code | Package restructure `shared/` → `product/`; ~2K files renamed |
| DDL | 833 SQL files changed; destructive drops in demo tenants |
| Env vars | 8 renamed, ~25 new (per-plane hosts, upstream URLs, realm/client IDs) |
| Secrets | 2 new required: `ADMIN_WEB_CLIENT_SECRET`, `AUTH_DISCOVERY_SHARED_SECRET` |
| Keycloak | New realm files (`realm-athyper.json`, `realm-platform-control.json` + demosetup variants), custom Java extension, new Neon login theme |
| Redis | Structured ACL via `render-redis-acl.cjs` + `reload-redis-acl.sh` |
| Compose service names | `athyper-neon-web` → `neon-web`, `athyper-api` → `api` |
| DNS | 3 new hostnames required: `mesh-stg.athyper.com`, `admin-stg.athyper.com` (neon-stg exists) |
| Sessions | All users forced to re-authenticate (realm swap) |

## 3. Pre-cutover checklist

Run all items 24h before the maintenance window.

- [ ] Merged 3 code reviews of the `realm-athyper.json` diff (5,981 lines)
- [ ] Full rehearsal completed on scratch VM using this runbook end-to-end
- [ ] DNS `mesh-stg.athyper.com` resolves to staging LB
- [ ] DNS `admin-stg.athyper.com` resolves to staging LB
- [ ] `neon-stg.athyper.com` still resolves (unchanged)
- [ ] Corporate VPN CIDR obtained; TEST-NET-3 placeholder in
      `stack/config/gateway/environments/neon-workbench-routes.staging.yml`
      admin-ip-restrict replaced
- [ ] Maintenance window announced to staging users (all sessions will drop)
- [ ] Docker Desktop / staging host has ≥8 GB free RAM for image builds
- [ ] `stack/config/iam/extensions/iam-presentation-context/` Java extension
      built cleanly in isolation (`mvn package` succeeds)
- [ ] SSH access confirmed for cutover operator; `sudo` for
      `write-env-staging.sh` and directory writes under `/opt/stack/athyper/`
- [ ] Rollback tag verified on host: `git tag pre-3plane-cutover` on
      `feature/finance-core` HEAD
- [ ] On-call notified; alerting silenced for the maintenance window

## 4. Execution

### Phase 0 — Backups (30 min)

```bash
ssh athyper-staging
cd /opt/products/athyper

# 0.1 Full logical DB dump — MUST succeed before proceeding
DATE=$(date +%Y%m%d-%H%M)
BACKUP_DIR=/home/athyper/backups/pre-3plane-$DATE
mkdir -p "$BACKUP_DIR"
docker exec athyper-db-1 pg_dumpall -U postgres \
  | gzip > "$BACKUP_DIR/pg_dumpall.sql.gz"

# 0.2 Traefik ACME cert snapshot (avoid Let's Encrypt rate-limit on re-issue)
docker cp athyper-gateway-1:/certs/acme.json "$BACKUP_DIR/acme.json"

# 0.3 Current env files
sudo cp /opt/stack/athyper/bootstrap.env "$BACKUP_DIR/bootstrap.env"
sudo cp /opt/stack/athyper/secrets/.env  "$BACKUP_DIR/secrets.env"

# 0.4 Verify sizes non-zero
ls -lh "$BACKUP_DIR/"

# 0.5 Tag current commit for rollback
git tag pre-3plane-cutover-$DATE
```

### Phase 1 — Stop apps, checkout new branch (5 min)

```bash
# 1.1 Announce start of downtime
echo "$(date -u) MAINT START" >> /var/log/athyper-maintenance.log

# 1.2 Stop app services (leave core infra running)
cd /opt/products/athyper
docker compose --project-directory stack/compose stop \
  neon-web mesh-web admin-web api worker scheduler \
  || docker compose --project-directory stack/compose stop \
     athyper-neon-web athyper-mesh-web athyper-admin-web \
     athyper-api athyper-worker athyper-scheduler

# 1.3 Pull the new branch
git fetch origin refactor/three-plane-packages
git checkout refactor/three-plane-packages
git pull origin refactor/three-plane-packages
git log -1 --oneline    # verify HEAD is the intended commit
```

### Phase 2 — Env + secrets update (15 min)

```bash
# 2.1 Generate the 2 new secrets + preserve existing (idempotent)
sudo bash stack/scripts/setup/write-env-staging.sh

# Confirm the new secrets landed:
sudo grep -E '^(ADMIN_WEB_CLIENT_SECRET|AUTH_DISCOVERY_SHARED_SECRET)=' \
  /opt/stack/athyper/secrets/.env

# 2.2 Merge new bootstrap env keys
sudo cp stack/env/staging.env.example /opt/stack/athyper/bootstrap.env.new

# Preserve any staging-specific tenant values from the old bootstrap:
sudo diff /opt/stack/athyper/bootstrap.env /opt/stack/athyper/bootstrap.env.new

# Manually merge:
#   - Adopt all NEW/RENAMED keys from .new
#   - Preserve tenant-specific values from current (SMTP relay, custom hostnames,
#     resource limits) that .example won't have
sudo $EDITOR /opt/stack/athyper/bootstrap.env.new
sudo mv /opt/stack/athyper/bootstrap.env.new /opt/stack/athyper/bootstrap.env

# 2.3 Validate both files parse and every required key is present
sudo bash stack/scripts/setup/validate-env.sh \
  /opt/stack/athyper/bootstrap.env \
  /opt/stack/athyper/secrets/.env
```

Renamed keys operators must adopt (delete the old, add the new):

```
UPTIME_HOST              → STATUSWATCH_HOST
HEALTHCHECKS_HOST        → CRONWATCH_HOST
GLITCHTIP_HOST           → ERRORCOLLECT_HOST
MEILI_HOST               → SEARCHCORE_HOST
METABASE_HOST            → ANALYTICSBOARD_HOST
INFISICAL_HOST           → SECRETSTORE_HOST
HEALTHCHECKS_SECRET_KEY  → CRONWATCH_SECRET_KEY
GLITCHTIP_SECRET_KEY     → ERRORCOLLECT_SECRET_KEY
```

New keys operators must add:

```
PUBLIC_NEON_URL, PUBLIC_MESH_URL, PUBLIC_ADMIN_URL
APPS_ATHYPER_NEON_HOST, APPS_ATHYPER_MESH_HOST, APPS_ATHYPER_ADMIN_HOST
APPS_ATHYPER_NEON_UPSTREAM_URL, APPS_ATHYPER_MESH_UPSTREAM_URL, APPS_ATHYPER_ADMIN_UPSTREAM_URL
NEON_ALLOWED_HOSTS, MESH_ALLOWED_HOSTS, ADMIN_ALLOWED_HOSTS
NEON_GATEWAY_ORIGIN, MESH_GATEWAY_ORIGIN, ADMIN_GATEWAY_ORIGIN
NEON_KEYCLOAK_REALM=athyper, MESH_KEYCLOAK_REALM=athyper, ADMIN_KEYCLOAK_REALM=athyper
NEON_KEYCLOAK_CLIENT_ID=neon-web
MESH_KEYCLOAK_CLIENT_ID=mesh-web
ADMIN_KEYCLOAK_CLIENT_ID=admin-web
```

Upstream URL flips:

```
APPS_ATHYPER_WEB_UPSTREAM_URL:  http://athyper-neon-web:3000 → http://neon-web:3000
APPS_ATHYPER_API_UPSTREAM_URL:  http://athyper-api:3000      → http://api:3000
```

### Phase 3 — Database cutover (20 min, destructive)

Per pre-prod policy: full reset, no migration scripts.

```bash
# 3.1 Drop and recreate the app databases
docker exec -it athyper-db-1 psql -U postgres <<SQL
DROP DATABASE IF EXISTS athyper_neon WITH (FORCE);
DROP DATABASE IF EXISTS athyper_mesh WITH (FORCE);
CREATE DATABASE athyper_neon;
CREATE DATABASE athyper_mesh;
SQL

# 3.2 Ensure all 7 canonical databases exist
bash stack/scripts/db/session/iam/init-databases.sh

# 3.3 Apply new DDL (833 files, transaction plane)
bash stack/scripts/db/transaction/neon/init-schema.sh
bash stack/scripts/db/transaction/mesh/init-schema.sh

# 3.4 Seed core + tenant data (includes new network tables)
bash stack/scripts/db/transaction/neon/seed-db.sh
bash stack/scripts/db/transaction/mesh/seed-db.sh

# 3.5 Verify new tables exist with rows
docker exec athyper-db-1 psql -U postgres -d athyper_neon <<SQL
SELECT 'buyer_networks' t, count(*) FROM master.buyer_networks
UNION ALL SELECT 'neon_le_groups', count(*) FROM master.neon_le_groups
UNION ALL SELECT 'admin_plane_bindings', count(*) FROM master.admin_plane_bindings
UNION ALL SELECT 'mesh_buyer_bindings', count(*) FROM master.mesh_buyer_bindings
UNION ALL SELECT 'legal_entity_network_accounts', count(*) FROM master.legal_entity_network_accounts;
SQL
```

If step 3.4 fails on a seed referencing a deleted table
(`address_contacts` / `apply_period_close_states` / `delegation_grants`),
STOP and jump to §6 Rollback — the seed suite has drift the rehearsal
should have caught.

### Phase 4 — Keycloak: build extension image, re-import realms (15 min)

```bash
# 4.1 Rebuild the IAM image with the custom iam-presentation-context extension
docker compose --project-directory stack/compose \
  --env-file /opt/stack/athyper/secrets/.env \
  build iam

# 4.2 Reset IAM: wipes KC DB, restarts, imports the 4 new realm JSONs
bash stack/scripts/db/session/iam/reset-iam.sh

# 4.3 Wait for KC health
until curl -sf http://localhost:8443/health/ready >/dev/null; do sleep 5; done
echo "KC ready"

# 4.4 Render + apply new Redis ACL
node tools/scripts/render-redis-acl.cjs \
  > /opt/stack/athyper/config/memorycache/redis-acl.conf
bash stack/scripts/stack/reload-redis-acl.sh athyper-memorycache-1

# 4.5 Apply realm demo setup + IAM realm policy
node tools/scripts/apply-iam-realm-policy.cjs
node tools/scripts/apply-realm-demo-setup.cjs
node tools/scripts/update-realm-neon.cjs
```

### Phase 5 — Build + start app images (20–40 min)

```bash
# 5.1 Rebuild all 6 app images (server code restructure requires this)
COMPOSE_PROFILES=core,apps docker compose \
  --project-directory stack/compose \
  --env-file /opt/stack/athyper/secrets/.env \
  -f stack/compose/athyper.base.yml \
  -f stack/compose/apps/athyper-apps.yml \
  -f stack/compose/athyper.override.staging.yml \
  build --no-cache api worker scheduler neon-web mesh-web admin-web

# 5.2 Start the app profile
bash stack/scripts/stack-profile/up.sh apps

# 5.3 Confirm containers all report (health: starting) → (healthy) within 90s
watch -n 5 'docker ps --filter "name=athyper-" --format \
  "table {{.Names}}\t{{.Status}}"'
```

### Phase 6 — Verification (15 min)

```bash
# 6.1 Livez probes on all 4 public hostnames
for h in neon mesh admin; do
  code=$(curl -s -o /dev/null -w "%{http_code}" https://${h}-stg.athyper.com/livez)
  echo "${h}-stg: $code"
done
curl -s -o /dev/null -w "api-stg: %{http_code}\n" https://api-stg.athyper.com/livez

# 6.2 Readyz on api (dependency-aware)
curl -sf https://api-stg.athyper.com/readyz | jq .

# 6.3 Smoke suite
bash stack/scripts/smoke-staging.sh

# 6.4 Manual login smoke per plane (different realm/client each)
#     - https://neon-stg.athyper.com/login  →  neon-web KC client
#     - https://mesh-stg.athyper.com/login  →  mesh-web KC client
#     - https://admin-stg.athyper.com/login →  admin-web (VPN only)

# 6.5 Trace outbox draining (worker health)
docker exec athyper-db-1 psql -U postgres -d athyper_neon -c \
  "SELECT count(*) FROM event.outbox WHERE claimed_at IS NULL;"
# Expect < 100 within 2 min of worker start
```

If any of §6.1–6.4 fail: jump to §6 Rollback.

## 5. Post-cutover cleanup (within 24h)

- [ ] Announce maintenance window closed
- [ ] Un-silence alerting
- [ ] Delete pre-cutover backup after 7 days (retain 24h at minimum for safety)
- [ ] Update `MEMORY.md` project state to reflect new branch on staging
- [ ] Note any deviations from this runbook in a follow-up PR

## 6. Rollback

Trigger if any Phase 6 verification fails or Phase 3–5 error unrecoverably.

```bash
# 1. Stop new app containers
docker compose --project-directory stack/compose stop \
  neon-web mesh-web admin-web api worker scheduler

# 2. Checkout previous branch
git checkout pre-3plane-cutover-$DATE  # the tag from Phase 0.5

# 3. Restore DB
BACKUP_DIR=/home/athyper/backups/pre-3plane-$DATE
gunzip -c "$BACKUP_DIR/pg_dumpall.sql.gz" \
  | docker exec -i athyper-db-1 psql -U postgres

# 4. Restore ACME cert
docker cp "$BACKUP_DIR/acme.json" athyper-gateway-1:/certs/acme.json

# 5. Restore env files
sudo cp "$BACKUP_DIR/bootstrap.env" /opt/stack/athyper/bootstrap.env
sudo cp "$BACKUP_DIR/secrets.env"   /opt/stack/athyper/secrets/.env

# 6. Restore IAM (previous realm JSON)
bash stack/scripts/db/session/iam/reset-iam.sh

# 7. Rebuild + start apps on old branch
COMPOSE_PROFILES=core,apps docker compose \
  --project-directory stack/compose \
  --env-file /opt/stack/athyper/secrets/.env \
  -f stack/compose/athyper.base.yml \
  -f stack/compose/apps/athyper-apps.yml \
  -f stack/compose/athyper.override.staging.yml \
  build api worker scheduler neon-web mesh-web admin-web

bash stack/scripts/stack-profile/up.sh apps

# 8. Verify §6.1–6.3 pass on old branch
```

Rollback estimated at 45 min. If the DB restore fails, escalate — the backup
snapshot is the last line of defence.

## 7. Known risks

| Risk | Mitigation |
|------|-----------|
| Seed file references a deleted table | Rehearsal on scratch VM catches this |
| KC extension jar fails to load in Docker image | Build tested in isolation before cutover |
| Let's Encrypt rate-limits new plane hostnames | Use staging resolver; certs backed up in Phase 0.2 |
| Session store namespace collision across realms | Verified in rehearsal; each plane has own KC client |
| Redis ACL breaks BullMQ worker | `reload-redis-acl.sh` reversible; keep old ACL file backup |
| Traefik file-provider caches old upstream | Recreate `gateway` container after env changes |
| Worker cannot start after image rebuild (bundling issue) | Verified locally via `dev-container.bat --build` before cutover |

## 8. Sign-off

Cutover operator: _______________  Date: _______  Result: pass / rollback / partial

Post-cutover on-call: _______________ Handoff time: _______
