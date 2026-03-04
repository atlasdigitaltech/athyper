# Operational Runbooks

Step-by-step procedures for common operational tasks.

---

## Index

| Runbook | Purpose |
|---------|---------|
| [Infrastructure Setup](#infrastructure-setup) | First-time local environment setup |
| [Auth Operations](#auth-operations) | Authentication troubleshooting and management |
| [Audit Go-Live](#audit-go-live) | Enabling audit governance in production |
| [Database Operations](#database-operations) | Schema management, backups, recovery |
| [Keycloak Administration](#keycloak-administration) | Realm and user management |
| [Monitoring & Alerts](#monitoring--alerts) | Telemetry stack operations |
| [Incident Response](#incident-response) | Common incident resolution procedures |

---

## Infrastructure Setup

### Prerequisites

- **Node.js** 20.x (pinned in `.nvmrc`)
- **pnpm** 10.28+ (`npm install -g pnpm`)
- **Docker Desktop** with Docker Compose
- **Git**

### First-Time Setup

```bash
# 1. Clone and install dependencies
git clone <repo-url> athyper-private
cd athyper-private
pnpm install

# 2. Set up environment
cp mesh/env/local.env.example mesh/env/.env
# Edit .env with your local settings

# 3. Generate TLS certificates
./mesh/scripts/generate-mesh-certs.sh   # Linux/macOS
./mesh/scripts/generate-mesh-certs.bat  # Windows

# 4. Start infrastructure
pnpm mesh:up

# 5. Wait for services to be healthy
pnpm mesh:ps
# Ensure all containers show "healthy" status

# 6. Provision database schemas
pnpm db:provision

# 7. Generate types
pnpm db:generate
pnpm kysely:codegen

# 8. Build all packages
pnpm build

# 9. Start development
pnpm dev
```

### Verify Setup

```bash
# Check all services are running
pnpm mesh:ps

# Check database connectivity
pnpm db:provision:status

# Run health checks
curl https://athyper.local/api/health   # (requires TLS cert trust)

# Run tests
pnpm test

# Run type check
pnpm typecheck
```

---

## Auth Operations

### Session Debugging

```bash
# Check active sessions count
redis-cli -h localhost -p 6379 KEYS "session:*" | wc -l

# Inspect a specific session (use hashed SID)
redis-cli -h localhost -p 6379 GET "session:<sid>"

# View auth audit events for a tenant
redis-cli -h localhost -p 6379 LRANGE "audit:auth:<tenantId>" 0 10
```

### Force Logout All Users

```bash
# Clear all sessions (CAUTION: logs out everyone)
redis-cli -h localhost -p 6379 KEYS "session:*" | xargs redis-cli DEL
```

### Keycloak Token Debugging

```bash
# Decode a JWT token (paste token content)
echo "<token>" | base64 -d | jq .

# Check Keycloak well-known config
curl http://localhost:8080/realms/<realm>/.well-known/openid-configuration | jq .

# Check JWKS endpoint
curl http://localhost:8080/realms/<realm>/protocol/openid-connect/certs | jq .
```

### Common Auth Issues

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| 401 on all requests | Keycloak down or unreachable | `pnpm mesh:ps` → restart Keycloak |
| CSRF 403 errors | Cookie/header mismatch | Clear cookies, check `__csrf` cookie exists |
| Session not persisting | Redis connection lost | Check Redis connectivity |
| MFA loop | MFA policy mismatch | Check Keycloak authentication flow config |
| Token refresh failures | Refresh token expired | User must re-login |

---

## Audit Go-Live

### Pre-Go-Live Checklist

1. **Verify hash chain**: Run integrity verification on test data
2. **Test encryption**: Ensure AES-256-GCM encryption/decryption works
3. **Verify DLQ**: Test DLQ write/replay/purge operations
4. **Test outbox drain**: Ensure outbox worker is running and draining
5. **Configure retention**: Set retention policies per tenant
6. **Enable feature flags**: Enable audit features gradually

### Enable Audit in Production

```bash
# 1. Run audit schema provisioning
pnpm db:provision:ddl

# 2. Verify audit tables exist
pnpm db:provision:status

# 3. Enable feature flags (via admin API or database)
# Set audit.featureFlags for each tenant:
#   hashChain: true
#   columnEncryption: true
#   redactionLevel: "standard"

# 4. Start audit workers
# Workers auto-start with the runtime — verify they're running:
curl http://localhost:4000/api/health | jq '.workers'

# 5. Verify hash chain initialization
curl http://localhost:4000/api/admin/audit/integrity/verify | jq .
```

### Monitoring Audit Health

```bash
# Check outbox depth (should stay near 0)
curl http://localhost:4000/api/admin/audit/metrics | jq '.outboxDepth'

# Check DLQ depth (should be 0 in normal operation)
curl http://localhost:4000/api/admin/audit/metrics | jq '.dlqDepth'

# Verify hash chain integrity
curl http://localhost:4000/api/admin/audit/integrity/verify | jq '.valid'
```

---

## Database Operations

### Schema Provisioning

```bash
# Full provisioning (DDL + seed)
pnpm db:provision

# DDL only (no seed data)
pnpm db:provision:ddl

# Seed only (no DDL)
pnpm db:provision:seed

# Check current provisioning status
pnpm db:provision:status

# Reset checksums and re-run everything
pnpm db:provision:reset
```

### Type Regeneration

After any schema change:

```bash
pnpm db:pull          # Pull schema from DB → Prisma schema
pnpm db:generate      # Generate Prisma client types
pnpm kysely:codegen   # Generate Kysely types
pnpm build            # Rebuild all packages
```

### Database Backup

```bash
# Full database backup
docker exec mesh-db pg_dump -U postgres athyper > backup_$(date +%Y%m%d).sql

# Schema-specific backup
docker exec mesh-db pg_dump -U postgres -n audit athyper > audit_backup.sql

# Restore from backup
docker exec -i mesh-db psql -U postgres athyper < backup_20260225.sql
```

### Connection Pool Status

```bash
# PgBouncer stats (apps pool)
docker exec mesh-dbpool-apps psql -p 6432 -U postgres pgbouncer -c "SHOW POOLS;"

# PgBouncer stats (auth pool)
docker exec mesh-dbpool-auth psql -p 6433 -U postgres pgbouncer -c "SHOW POOLS;"
```

---

## Keycloak Administration

### Export Realm

```bash
./mesh/scripts/export-iam.sh    # Linux/macOS
./mesh/scripts/export-iam.bat   # Windows
# Output: mesh/config/iam/realm-export.json
```

### Import Realm

Realm is auto-imported on first Keycloak startup from `mesh/config/iam/realm-export.json`.

To force re-import:
```bash
# Stop Keycloak
docker compose -f mesh/compose/compose.yml stop mesh-iam

# Delete Keycloak database (CAUTION: destroys all Keycloak data)
docker exec mesh-db psql -U postgres -c "DROP DATABASE keycloak; CREATE DATABASE keycloak;"

# Restart Keycloak (will re-import realm)
docker compose -f mesh/compose/compose.yml up -d mesh-iam
```

### User Management

```bash
# Create admin user via Keycloak CLI
docker exec mesh-iam /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080 --realm master --user admin --password admin

# List users
docker exec mesh-iam /opt/keycloak/bin/kcadm.sh get users -r athyper

# Reset user password
docker exec mesh-iam /opt/keycloak/bin/kcadm.sh set-password \
  -r athyper --username <user> --new-password <password>
```

---

## Monitoring & Alerts

### Access Dashboards

| Dashboard | URL | Purpose |
|-----------|-----|---------|
| Grafana | `http://localhost:3001` | Metrics, traces, logs |
| Prometheus | `http://localhost:9090` | Raw metrics queries |
| MinIO Console | `http://localhost:9001` | Object storage management |
| Keycloak Admin | `http://localhost:8080/admin` | IAM management |

### Key Metrics to Watch

| Metric | Normal Range | Alert Threshold |
|--------|-------------|----------------|
| HTTP request latency (p99) | < 500ms | > 2000ms |
| Error rate (5xx) | < 0.1% | > 1% |
| DB connection pool usage | < 70% | > 90% |
| Redis memory usage | < 80% | > 90% |
| Audit outbox depth | < 100 | > 1000 |
| Audit DLQ depth | 0 | > 0 |
| Job queue depth | < 50 | > 500 |

### Log Queries (Grafana/Loki)

```logql
# All errors
{container=~"mesh-.*"} |= "error"

# Auth failures
{container="mesh-neon"} |= "auth" |= "failure"

# Slow queries
{container="mesh-db"} |= "duration" | duration > 1000ms

# Audit events
{container="mesh-runtime"} |= "audit"
```

---

## Incident Response

### Service Down

```bash
# 1. Check which services are down
pnpm mesh:ps

# 2. Check logs for the failing service
docker compose -f mesh/compose/compose.yml logs --tail=100 <service-name>

# 3. Restart the specific service
docker compose -f mesh/compose/compose.yml restart <service-name>

# 4. If that doesn't work, recreate the service
docker compose -f mesh/compose/compose.yml up -d --force-recreate <service-name>
```

### Database Recovery

```bash
# 1. Check PostgreSQL logs
docker compose -f mesh/compose/compose.yml logs --tail=100 mesh-db

# 2. Check disk space
docker exec mesh-db df -h /var/lib/postgresql/data

# 3. Check active connections
docker exec mesh-db psql -U postgres -c "SELECT count(*) FROM pg_stat_activity;"

# 4. Kill long-running queries
docker exec mesh-db psql -U postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE duration > interval '5 minutes';"
```

### Redis Recovery

```bash
# 1. Check Redis info
redis-cli -h localhost -p 6379 INFO

# 2. Check memory usage
redis-cli -h localhost -p 6379 INFO memory

# 3. Flush specific database (CAUTION)
redis-cli -h localhost -p 6379 SELECT 0
redis-cli -h localhost -p 6379 FLUSHDB
```

---

## Related Documentation

- [Infrastructure](../infrastructure/README.md) — Docker Compose setup
- [Deployment](../deployment/README.md) — Deployment guides
- [Security](../security/README.md) — Security controls
