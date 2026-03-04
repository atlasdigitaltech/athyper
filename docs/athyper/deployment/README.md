# Deployment Guide

Athyper deployment procedures for local development (Windows) and server deployment (Contabo VPS).

---

## Local Development (Windows)

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| **Node.js** | 20.x | [nodejs.org](https://nodejs.org) or `nvm install 20` |
| **pnpm** | 10.28+ | `npm install -g pnpm` |
| **Docker Desktop** | Latest | [docker.com](https://www.docker.com/products/docker-desktop) |
| **Git** | Latest | [git-scm.com](https://git-scm.com) |

### Setup Steps

```bash
# 1. Clone the repository
git clone <repo-url> D:\Development\athyper-private
cd D:\Development\athyper-private

# 2. Install dependencies
pnpm install

# 3. Set up environment file
copy mesh\env\local.env.example mesh\env\.env
# Edit .env with local settings (database passwords, etc.)

# 4. Generate TLS certificates for local development
.\mesh\scripts\generate-mesh-certs.bat

# 5. Start Docker infrastructure
pnpm mesh:up
# Wait for all containers to be healthy:
pnpm mesh:ps

# 6. Provision database schemas and seed data
pnpm db:provision

# 7. Generate TypeScript types from database
pnpm db:generate
pnpm kysely:codegen

# 8. Build all packages
pnpm build

# 9. Start development servers (parallel via Turborepo)
pnpm dev
```

### Access Points (Local)

| Service | URL |
|---------|-----|
| **Neon Web App** | `https://athyper.local:3000` |
| **Runtime API** | `http://localhost:4000` |
| **Keycloak Admin** | `http://localhost:8080/admin` |
| **Grafana** | `http://localhost:3001` |
| **MinIO Console** | `http://localhost:9001` |
| **Prometheus** | `http://localhost:9090` |

### Windows-Specific Notes

- **Hosts file**: Add `127.0.0.1 athyper.local auth.athyper.local` to `C:\Windows\System32\drivers\etc\hosts`
- **Docker memory**: Allocate at least 8GB RAM to Docker Desktop (Settings → Resources)
- **Line endings**: Git should be configured with `core.autocrlf=input` (the `.gitattributes` handles this)
- **Path length**: Enable long paths if you encounter issues: `git config --system core.longpaths true`
- **TLS trust**: Import `mesh/config/gateway/certs/cert.pem` into Windows certificate store as a trusted root CA for browser access without warnings

### Common Development Commands

```bash
# Start only specific services
pnpm dev --filter @athyper/runtime     # Runtime only
pnpm dev --filter @neon/web            # Next.js only

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

| Issue | Solution |
|-------|----------|
| Port conflicts | Check `netstat -an \| findstr :5432` and stop conflicting services |
| Docker not starting | Ensure WSL2 is enabled and Hyper-V is active |
| pnpm install fails | Delete `node_modules` and `pnpm-lock.yaml`, run `pnpm install` |
| DB provision fails | Check PostgreSQL is healthy: `docker logs mesh-db` |
| TLS certificate errors | Regenerate certs: `.\mesh\scripts\generate-mesh-certs.bat` |
| Out of disk space | `docker system prune -a` to clean Docker cache |
| Keycloak won't start | Check port 8080 is free; check PgBouncer auth pool is healthy |

---

## Server Deployment (Contabo VPS)

### Server Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| **CPU** | 4 vCores | 8 vCores |
| **RAM** | 16 GB | 32 GB |
| **Storage** | 200 GB SSD | 400 GB NVMe |
| **OS** | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS |
| **Network** | 200 Mbit/s | 400 Mbit/s |

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
#   - Real domain name
#   - Production Keycloak settings
#   - S3/MinIO credentials
#   - SMTP credentials (for notifications)

# 4. Set up TLS certificates
# Option A: Self-signed (staging)
./mesh/scripts/generate-mesh-certs.sh

# Option B: Let's Encrypt (production)
# Configure Traefik ACME in mesh/config/gateway/dynamic/mesh.tls.yml

# 5. Start infrastructure
docker compose -f mesh/compose/compose.yml --env-file mesh/env/.env up -d

# 6. Wait for services to be healthy
docker compose -f mesh/compose/compose.yml ps

# 7. Provision database
pnpm db:provision

# 8. Generate types and build
pnpm db:generate
pnpm kysely:codegen
pnpm build

# 9. Start application
pnpm runtime:start        # Start runtime API server
# Or for the full stack:
pnpm dev                   # Development mode
```

### Environment Configuration (Contabo)

Key settings in `mesh/env/.env`:

```env
# Database
POSTGRES_PASSWORD=<strong-password>
POSTGRES_DB=athyper
PGBOUNCER_MAX_CLIENT_CONN=200
PGBOUNCER_DEFAULT_POOL_SIZE=50

# Keycloak
KEYCLOAK_ADMIN_PASSWORD=<strong-password>
KC_HOSTNAME=auth.yourdomain.com
KC_PROXY=edge

# Redis
REDIS_PASSWORD=<strong-password>
REDIS_MAXMEMORY=2gb

# MinIO
MINIO_ROOT_USER=admin
MINIO_ROOT_PASSWORD=<strong-password>

# Application
NODE_ENV=production
LOG_LEVEL=info
DOMAIN=yourdomain.com

# TLS
TLS_CERT_PATH=/etc/traefik/certs/cert.pem
TLS_KEY_PATH=/etc/traefik/certs/key.pem
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
docker compose -f mesh/compose/compose.yml ps

# Check resource usage
docker stats

# Check disk usage
df -h
docker system df

# Check logs
docker compose -f mesh/compose/compose.yml logs -f --tail=100 <service>

# Application health
curl http://localhost:4000/api/health
```

### Backup Strategy

```bash
# Database backup (daily cron)
0 2 * * * docker exec mesh-db pg_dump -U postgres athyper | gzip > /backup/db/athyper_$(date +\%Y\%m\%d).sql.gz

# Object storage backup (weekly)
0 3 * * 0 docker exec mesh-minio mc mirror /data /backup/minio/

# Keycloak realm export (before changes)
docker exec mesh-iam /opt/keycloak/bin/kc.sh export --dir /tmp/export --realm athyper

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

| Component | Scaling Approach |
|-----------|-----------------|
| **Runtime API** | Run multiple instances behind Traefik load balancer |
| **Workers** | Scale worker count via environment config |
| **PostgreSQL** | Vertical scaling (more RAM/CPU) or read replicas |
| **Redis** | Vertical scaling or Redis Cluster |
| **MinIO** | Distributed mode for HA |
| **Keycloak** | HA cluster mode (needs shared DB) |

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

- [ ] All Docker services healthy (`docker compose ps`)
- [ ] Database provisioned (`pnpm db:provision:status`)
- [ ] Application health check passing (`curl /api/health`)
- [ ] Keycloak accessible and realm configured
- [ ] TLS working (check certificate in browser)
- [ ] Login flow working end-to-end
- [ ] Audit system operational (hash chain, outbox drain)
- [ ] Backup cron jobs running

---

## Related Documentation

- [Infrastructure](../infrastructure/README.md) — Docker Compose mesh details
- [Runbooks](../runbooks/README.md) — Operational procedures
- [Security](../security/README.md) — Security hardening
- [Build & Tooling](../BUILD-TOOLING.md) — Build system reference
