variable "LOCAL_TAG" {
  default = "dev-build"
}

variable "SOURCE_REVISION" {
  default = "unknown-dirty"
}

group "default" {
  targets = ["neon-web", "mesh-web", "studio-web", "runtime-server", "iam"]
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
  context = "stack/config/iam"
  dockerfile = "Dockerfile"
  tags = ["athyper/keycloak:${LOCAL_TAG}"]
}
