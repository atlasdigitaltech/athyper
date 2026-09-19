# IAM config

This directory contains the Keycloak image, realm imports, presentation provider
extension and login/email theme.

Build the optimized image from the repository root:

```sh
docker buildx bake -f deploy/docker-bake.hcl iam
```

See the [container wiring runbook](../../docs/operations/container-wiring.md),
[provider contract](providers/README.md), [theme documentation](themes/neon/login/README.md)
and [deployment checks](../../compose/tests/README.md) for configuration and verification.
