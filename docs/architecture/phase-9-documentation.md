# Phase 9 — Documentation

The package architecture documentation is now aligned with the canonical three-plane source
layout, deployment profiles, and release boundary checks.

Primary references:

- [Package ownership matrix](./package-ownership-matrix.md)
- [Folder boundary map](../local/architecture/folder-boundary-map.md)
- [Deployment guide](../deployment/deployment-guide.md)
- [Docker build guide](../deployment/docker-build-guide.md)
- [Package creation guide](./package-creation-guide.md)
- [Import conventions](./import-conventions.md)
- [Shared versus product rules](./shared-vs-product-rules.md)
- [Junction retirement](./junction-retirement.md)
- [Deployment profiles](../../config/deployment/profiles.json)

All canonical source paths are portable physical directories. Windows junctions are retired from
source layout; only pnpm-generated dependency links under `node_modules` are expected after a
platform-specific install.
