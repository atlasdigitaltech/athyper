# Deployment Guide

Athyper deployment procedures for local development (Windows) and server deployment (Contabo VPS).

---

## Local Development (Windows)

### Prerequisites

| Tool               | Version | Install                                                      |
| ------------------ | ------- | ------------------------------------------------------------ |
| **Node.js**        | 20.x    | [nodejs.org](https://nodejs.org) or `nvm install 20`         |
| **pnpm**           | 10.28+  | `npm install -g pnpm`                                        |
| **Docker Desktop** | Latest  | [docker.com](https://www.docker.com/products/docker-desktop) |
| **Git**            | Latest  | [git-scm.com](https://git-scm.com)                           |
| **mkcert**         | Latest  | `winget install FiloSottile.mkcert`                          |

### Setup Steps

```bash
# 1. Clone the repository
git clone <repo-url> D:\Development\athyper-private
cd D:\Development\athyper-private

# 2. Install dependencies
pnpm install

# 3. Configure hosts file (run as Administrator)
# Add to C:\Windows\System32\drivers\etc\hosts:
#   127.0.0.1 gateway.mesh.athyper.local
#   127.0.0.1 iam.mesh.athyper.local
#   127.0.0.1 objectstorage.mesh.athyper.local
#   127.0.0.1 objectstorage.console.mesh.athyper.local
#   127.0.0.1 telemetry.mesh.athyper.local
#   127.0.0.1 metrics.mesh.athyper.local
#   127.0.0.1 traces.mesh.athyper.local
#   127.0.0.1 logs.mesh.athyper.local
#   127.0.0.1 neon.athyper.local
#   127.0.0.1 api.athyper.local

# 4. Set up environment file
copy mesh\env\local.env.example mesh\env\.env

# 5. Generate TLS certificates for local development
.\mesh\scripts\generate-mesh-certs.bat

# 6. Initialize data directories
.\mesh\scripts\init-data.bat

# 7. Start Docker infrastructure
pnpm mesh:up
# Wait for all containers to be healthy (~30s for Keycloak):
pnpm mesh:ps

# 8. Provision database schemas and seed data
pnpm db:provision

# 9. Import Keycloak realm (users, clients, roles)
.\mesh\scripts\initdb-iam.bat

# 10. Generate TypeScript types from database
pnpm db:generate
pnpm kysely:codegen

# 11. Build all packages
pnpm build

# 12. Configure Neon web app
copy products\neon\apps\web\.env.example products\neon\apps\web\.env.local

# 13. Start development servers
pnpm dev
```

### Access Points (Local)

All services are accessed via the Traefik gateway on HTTPS (port 443), using the local TLS certificates.

| Service                 | URL                                                |
| ----------------------- | -------------------------------------------------- |
| **Neon Web App**        | `http://localhost:3001`                            |
| **Runtime API**         | `https://api.athyper.local`                        |
| **Keycloak Admin**      | `https://iam.mesh.athyper.local`                   |
| **Grafana (Telemetry)** | `https://telemetry.mesh.athyper.local`             |
| **Prometheus**          | `https://metrics.mesh.athyper.local`               |
| **Tempo (Traces)**      | `https://traces.mesh.athyper.local`                |
| **Loki (Logs)**         | `https://logs.mesh.athyper.local`                  |
| **MinIO Console**       | `https://objectstorage.console.mesh.athyper.local` |
| **MinIO S3 API**        | `https://objectstorage.mesh.athyper.local`         |

### Windows-Specific Notes

- **Docker memory**: Allocate at least 8GB RAM to Docker Desktop (Settings → Resources)
- **Line endings**: Git should be configured with `core.autocrlf=input` (the `.gitattributes` handles this)
- **Path length**: Enable long paths if you encounter issues: `git config --system core.longpaths true`
- **TLS trust**: mkcert automatically installs its CA into the system trust store. If browsers still show warnings, run `mkcert -install` again
- **Restart shell**: After installing mkcert via winget, restart your terminal for it to appear in PATH

### Common Development Commands

```bash
# Start only specific services
pnpm dev --filter @neon/web            # Next.js web app only (http://localhost:3001)
pnpm runtime:start:watch              # Runtime API with auto-restart on changes
pnpm runtime:start:dev                # Runtime API (single run, no watch)
pnpm runtime:start                    # Runtime API from pre-built dist/

# Run tests
pnpm test                              # All tests via Turborepo
npx vitest run                         # All tests directly
npx vitest run framework/runtime       # Runtime tests only
npx vitest --watch                     # Watch mode

# Type checking
pnpm typecheck                         # All packages
npx tsc --noEmit --project framework/runtime/tsconfig.json  # Runtime only

# Linting
pnpm lint                              # All packages
pnpm lint:fix                          # Auto-fix issues

# Full quality check
pnpm check                             # lint + typecheck + test + depcheck

# Database operations
pnpm db:provision                      # Run DDL + seed
pnpm db:provision:status               # Check provisioning status
pnpm db:provision:reset                # Drop all schemas and re-seed
pnpm db:studio                         # Open Prisma Studio

# Infrastructure
pnpm mesh:up                           # Start Docker services
pnpm mesh:down                         # Stop Docker services
pnpm mesh:ps                           # Check service status
pnpm mesh:logs                         # Tail service logs

# Clean and rebuild
pnpm clean                             # Remove build artifacts
pnpm clean:reset                       # Full clean + reinstall + rebuild
```

### Troubleshooting (Windows)

| Issue                       | Solution                                                                       |
| --------------------------- | ------------------------------------------------------------------------------ |
| Port conflicts              | Check `netstat -an \| findstr :5432` and stop conflicting services             |
| Docker not starting         | Ensure WSL2 is enabled and Hyper-V is active                                   |
| pnpm install fails          | Delete `node_modules` and `pnpm-lock.yaml`, run `pnpm install`                 |
| DB provision fails          | Check PostgreSQL is healthy: `docker logs athyper-mesh-db-1`                   |
| "variable is not set" warns | Always use `--env-file` or run `copy mesh\env\local.env.example mesh\env\.env` |
| "database does not exist"   | Run `.\mesh\scripts\init-data.bat`, then `pnpm mesh:down` + `pnpm mesh:up`     |
| TLS certificate errors      | Regenerate certs: `.\mesh\scripts\generate-mesh-certs.bat`                     |
| mkcert not found            | Restart terminal after install, or `winget install FiloSottile.mkcert`         |
| Out of disk space           | `docker system prune -a` to clean Docker cache                                 |
| Keycloak won't start        | Check dbpool-auth is healthy: `pnpm mesh:ps`                                   |
| Container "is a directory"  | Stop mesh, delete `mesh/data/`, run `init-data.bat`, restart mesh              |

---

## Server Deployment (Contabo VPS)

### Server Requirements

| Resource    | Minimum          | Recommended      |
| ----------- | ---------------- | ---------------- |
| **CPU**     | 4 vCores         | 8 vCores         |
| **RAM**     | 16 GB            | 32 GB            |
| **Storage** | 200 GB SSD       | 400 GB NVMe      |
| **OS**      | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS |
| **Network** | 200 Mbit/s       | 400 Mbit/s       |

### Initial Server Setup

```bash
# 1. Update system
sudo apt update && sudo apt upgrade -y

# 2. Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
# Log out and back in for group changes

# 3. Install Docker Compose plugin
sudo apt install docker-compose-plugin -y

# 4. Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 5. Install pnpm
npm install -g pnpm

# 6. Configure firewall
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable

# 7. Set up swap (if RAM < 32GB)
sudo fallocate -l 8G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### Application Deployment

```bash
# 1. Clone repository
git clone <repo-url> /opt/athyper
cd /opt/athyper

# 2. Install dependencies
pnpm install --frozen-lockfile

# 3. Configure environment
cp mesh/env/staging.env.example mesh/env/.env
# Edit .env with production values:
#   - Strong database passwords
#   - Real domain names for all *_HOST variables
#   - Production Keycloak settings
#   - S3/MinIO credentials
#   - OTLP endpoint

# 4. Set up TLS certificates
# Option A: Self-signed (staging)
./mesh/scripts/generate-mesh-certs.sh

# Option B: Let's Encrypt (production)
# Configure Traefik ACME in mesh/config/gateway/dynamic/mesh.tls.yml

# 5. Initialize data directories
./mesh/scripts/init-data.sh

# 6. Start infrastructure
./mesh/scripts/up.sh
# Or directly:
docker compose -f mesh/compose/compose.yml --env-file mesh/env/.env --profile mesh up -d

# 7. Wait for services to be healthy
docker compose -f mesh/compose/compose.yml --env-file mesh/env/.env --profile mesh ps

# 8. Provision database
DATABASE_ADMIN_URL=postgresql://athyperadmin:<password>@localhost:5432/athyper_dev1 \
  pnpm db:provision

# 9. Import Keycloak realm
./mesh/scripts/initdb-iam.sh

# 10. Generate types and build
pnpm db:generate
pnpm kysely:codegen
pnpm build

# 11. Start application
pnpm runtime:start        # Start runtime API server
```

### Environment Configuration (Contabo)

Key settings in `mesh/env/.env`:

```env
# Database
DB_ADMIN_PASSWORD=<strong-password>
DATABASE_URL=postgresql://athyperadmin:<strong-password>@dbpool-apps:6432/athyper_dev1
DATABASE_ADMIN_URL=postgresql://athyperadmin:<strong-password>@db:5432/athyper_dev1

# Keycloak
IAM_ADMIN=athyperadmin
IAM_ADMIN_PASSWORD=<strong-password>
IAM_DB_PASSWORD=<strong-password>
IAM_CLIENT_SECRET=<strong-secret>

# Redis
MEMORYCACHE_PASSWORD=<strong-password>
REDIS_URL=redis://:<strong-password>@memorycache:6379/0

# MinIO
S3_ACCESS_KEY=<access-key>
S3_SECRET_KEY=<strong-secret>

# Application
LOG_LEVEL=info

# Hostnames (use real domain)
GATEWAY_HOST=gateway.yourdomain.com
IAM_HOST=iam.yourdomain.com
TELEMETRY_HOST=telemetry.yourdomain.com
APPS_ATHYPER_API_HOST=api.yourdomain.com
APPS_ATHYPER_WEB_HOST=app.yourdomain.com
```

### Domain & DNS Setup

1. Point your domain's A record to the Contabo server IP
2. Configure Traefik routing in `mesh/config/gateway/dynamic/mesh.workbench.yml`:

```yaml
http:
  routers:
    neon-web:
      rule: "Host(`yourdomain.com`)"
      service: neon-web
      tls: {}
    keycloak:
      rule: "Host(`auth.yourdomain.com`)"
      service: keycloak
      tls: {}
```

### Process Management

For production, use a process manager:

```bash
# Option A: systemd service
sudo tee /etc/systemd/system/athyper-runtime.service << 'EOF'
[Unit]
Description=Athyper Runtime API
After=docker.service
Requires=docker.service

[Service]
Type=simple
User=athyper
WorkingDirectory=/opt/athyper
ExecStart=/usr/bin/node framework/runtime/dist/main.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable athyper-runtime
sudo systemctl start athyper-runtime

# Option B: PM2 (Node.js process manager)
npm install -g pm2
pm2 start framework/runtime/dist/main.js --name athyper-runtime
pm2 startup
pm2 save
```

### Monitoring on Contabo

```bash
# Check service status
docker compose -f mesh/compose/compose.yml --env-file mesh/env/.env --profile mesh ps

# Check resource usage
docker stats

# Check disk usage
df -h
docker system df

# Check logs
docker compose -f mesh/compose/compose.yml --env-file mesh/env/.env --profile mesh logs -f --tail=100 <service>

# Application health
curl http://localhost:4000/api/health
```

### Backup Strategy

```bash
# Database backup (daily cron)
0 2 * * * docker exec athyper-mesh-db-1 pg_dump -U athyperadmin athyper_dev1 | gzip > /backup/db/athyper_$(date +\%Y\%m\%d).sql.gz

# Object storage backup (weekly)
0 3 * * 0 docker exec athyper-mesh-objectstorage-1 mc mirror /data /backup/minio/

# Keycloak realm export (before changes)
./mesh/scripts/export-iam.sh

# Retention: keep 30 days of daily backups, 12 weeks of weekly backups
find /backup/db -name "*.sql.gz" -mtime +30 -delete
find /backup/minio -mtime +84 -delete
```

### Security Hardening (Production)

```bash
# 1. Disable password auth for SSH
sudo sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl restart sshd

# 2. Install fail2ban
sudo apt install fail2ban -y
sudo systemctl enable fail2ban

# 3. Configure automatic security updates
sudo apt install unattended-upgrades -y
sudo dpkg-reconfigure -plow unattended-upgrades

# 4. Restrict Docker daemon
# Ensure Docker socket is not exposed externally
# Use rootless Docker if possible

# 5. Enable Docker log rotation
sudo tee /etc/docker/daemon.json << 'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
EOF
sudo systemctl restart docker
```

### Scaling Considerations

| Component       | Scaling Approach                                    |
| --------------- | --------------------------------------------------- |
| **Runtime API** | Run multiple instances behind Traefik load balancer |
| **Workers**     | Scale worker count via environment config           |
| **PostgreSQL**  | Vertical scaling (more RAM/CPU) or read replicas    |
| **Redis**       | Vertical scaling or Redis Cluster                   |
| **MinIO**       | Distributed mode for HA                             |
| **Keycloak**    | HA cluster mode (needs shared DB)                   |

---

## Deployment Checklist

### Pre-Deployment

- [ ] Environment file configured with strong passwords
- [ ] TLS certificates generated or configured
- [ ] DNS records pointing to server
- [ ] Firewall rules configured (22, 80, 443 only)
- [ ] Backup strategy implemented
- [ ] Monitoring configured (Grafana dashboards)
- [ ] SSH key-based auth enabled, password auth disabled

### Post-Deployment

- [ ] All Docker services healthy (`pnpm mesh:ps` or `docker compose ps`)
- [ ] Database provisioned (`pnpm db:provision:status`)
- [ ] Keycloak realm imported (`initdb-iam` script ran successfully)
- [ ] Application health check passing (`curl /api/health`)
- [ ] Keycloak accessible and realm configured
- [ ] TLS working (check certificate in browser)
- [ ] Login flow working end-to-end
- [ ] Audit system operational (hash chain, outbox drain)
- [ ] Backup cron jobs running

---

## Related Documentation

- [Developer Setup](../../DEVELOPER-SETUP.md) — Detailed local setup guide with troubleshooting
- [Infrastructure](../infrastructure/README.md) — Docker Compose mesh details
- [Runbooks](../runbooks/README.md) — Operational procedures
- [Security](../security/README.md) — Security hardening
- [Build & Tooling](../BUILD-TOOLING.md) — Build system reference
