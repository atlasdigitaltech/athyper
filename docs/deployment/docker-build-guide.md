# Docker build guide

The server Dockerfiles are:

- `server/Dockerfile.dev`
- `server/Dockerfile.prod`

Both copy the workspace lockfile and package manifests first, run `pnpm install`, then copy source
and build inside Linux. Product package manifests under `packages/product/{neon,admin,mesh}` are
part of the dependency layer, so the container resolves the same workspace graph as CI.

Build from the repository root:

```bash
docker build -f server/Dockerfile.prod .
```

Do not introduce source junctions, host-specific absolute paths, or copied Windows dependency
trees into the image. Only pnpm-created links below `node_modules` are expected.
