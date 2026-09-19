variable "LOCAL_TAG" {
  default = "dev-build"
}

variable "SOURCE_REVISION" {
  default = "unknown-dirty"
}

group "default" {
  targets = ["neon-web", "mesh-web", "studio-web", "runtime-server", "iam"]
}

target "metabase" {
  inherits = ["_local"]
  context = "deploy/config/metabase"
  tags = ["athyper/metabase:0.51.10-hardened"]
}

target "_local" {
  platforms = ["linux/amd64"]
  output = ["type=docker"]
  labels = {
    "org.opencontainers.image.source" = "https://github.com/atlasdigitaltech/athyper"
    "org.opencontainers.image.revision" = SOURCE_REVISION
  }
}

target "neon-web" {
  inherits = ["_local"]
  context = "."
  dockerfile = "apps/Dockerfile"
  args = {
    APP_PACKAGE = "@athyper/neon"
    APP_NAME = "neon"
  }
  tags = ["athyper/neon-web:${LOCAL_TAG}"]
}

target "mesh-web" {
  inherits = ["_local"]
  context = "."
  dockerfile = "apps/Dockerfile"
  args = {
    APP_PACKAGE = "@athyper/mesh"
    APP_NAME = "mesh"
  }
  tags = ["athyper/mesh-web:${LOCAL_TAG}"]
}

target "studio-web" {
  inherits = ["_local"]
  context = "."
  dockerfile = "apps/Dockerfile"
  args = {
    APP_PACKAGE = "@athyper/studio"
    APP_NAME = "studio"
  }
  tags = ["athyper/studio-web:${LOCAL_TAG}"]
}

target "runtime-server" {
  inherits = ["_local"]
  context = "."
  dockerfile = "server/Dockerfile.prod"
  tags = ["athyper/runtime-server:${LOCAL_TAG}"]
}

target "iam" {
  inherits = ["_local"]
  context = "deploy/config/iam"
  dockerfile = "Dockerfile"
  tags = ["athyper/keycloak:${LOCAL_TAG}"]
}

# Explicit target: excluded from the default app build because it compiles ClamAV.
# CI can override output/tags to publish the qualified image by digest.
target "virusscan" {
  inherits = ["_local"]
  context = "deploy/config/virusscan"
  dockerfile = "Dockerfile"
  tags = ["athyper/clamav:1.5.2-zip-limit-1"]
}

# Explicit provisioning target; CI can override output/tags for digest publication.
target "searchcore-key-init" {
  inherits = ["_local"]
  context = "deploy/config/searchcore-key-init"
  dockerfile = "Dockerfile"
  tags = ["athyper/searchcore-key-init:1"]
}

# Build the exact local infrastructure tags consumed by Compose.
group "infrastructure" {
  targets = ["redis", "pgbouncer", "traefik", "meilisearch", "gotenberg", "tika", "seaweedfs", "s3-tools", "postgres", "virusscan", "searchcore-key-init"]
}

target "redis" {
  inherits = ["_local"]
  context = "deploy/config/redis"
  dockerfile = "Dockerfile"
  tags = ["athyper/valkey:8.1.10"]
}

target "pgbouncer" {
  inherits = ["_local"]
  context = "deploy/config/pgbouncer"
  dockerfile = "Dockerfile"
  tags = ["athyper/pgbouncer:1.25.2-hardened"]
}

target "traefik" {
  inherits = ["_local"]
  context = "deploy/config/traefik"
  dockerfile = "Dockerfile"
  tags = ["athyper/traefik:3.7.13-hardened"]
}

target "meilisearch" {
  inherits = ["_local"]
  context = "deploy/config/meilisearch"
  dockerfile = "Dockerfile"
  tags = ["athyper/meilisearch:1.13.3-hardened"]
}

target "gotenberg" {
  inherits = ["_local"]
  context = "deploy/config/gotenberg"
  dockerfile = "Dockerfile"
  tags = ["athyper/gotenberg:8.37.0-hardened"]
}

target "tika" {
  inherits = ["_local"]
  context = "deploy/config/tika"
  dockerfile = "Dockerfile"
  tags = ["athyper/tika:4.0.0-hardened"]
}

target "seaweedfs" {
  inherits = ["_local"]
  context = "deploy/config/seaweedfs"
  dockerfile = "Dockerfile"
  tags = ["athyper/seaweedfs:4.46-hardened"]
}

target "s3-tools" {
  inherits = ["_local"]
  context = "deploy/config/s3-tools"
  dockerfile = "Dockerfile"
  tags = ["athyper/s3-tools:1"]
}

target "postgres" {
  inherits = ["_local"]
  context = "deploy/config/postgres"
  dockerfile = "Dockerfile"
  tags = ["athyper/postgres:16.15-hardened"]
}

# Static readiness probe for the upstream distroless image.
target "loki" {
  inherits = ["_local"]
  context = "deploy/config/observability-readiness"
  target = "loki"
  tags = ["athyper/loki:3.6.10-ready"]
}

# Static readiness probe for the upstream distroless image.
target "tempo" {
  inherits = ["_local"]
  context = "deploy/config/observability-readiness"
  target = "tempo"
  tags = ["athyper/tempo:2.10.4-ready"]
}
