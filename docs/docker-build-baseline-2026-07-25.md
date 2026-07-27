# Docker build baseline — 2026-07-25

## Scope

This baseline covers the current production Dockerfiles for the runtime server
and the Neon, Mesh, and Admin Next.js applications. Existing Docker images and
BuildKit cache were preserved to avoid disrupting unrelated local work.

Environment:

- Docker Desktop 4.69.0
- Docker Engine 29.4.0
- Buildx 0.33.0
- Linux containers on `linux/amd64`
- Node base image resolved to `node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd`
- Build cache before testing: 9.122 GB, of which 4.927 GB was reclaimable

## Build results

| Image | Initial measured build | Result | Runtime image size |
| --- | ---: | --- | ---: |
| Server | 120.90 s | Failed during final TypeScript build | Not produced |
| Neon | 191.09 s | Passed | 76,833,270 bytes (76.8 MB) |
| Mesh | 64.04 s | Passed | 73,359,222 bytes (73.4 MB) |
| Admin | 50.60 s | Passed | 72,447,479 bytes (72.4 MB) |

The Neon build was the first web build against the current source state. It
transferred a 743.96 MB context, installed all 109 workspace projects, and
installed 1,049 packages.

Approximate Neon stage timings:

- Build-context transfer: 49.9 s
- Full-workspace `pnpm install`: 36.2 s
- Next production build: 91.5 s
- Final image export: 4.3 s

Mesh and Admin reused the full-repository `COPY` and `pnpm install` layers
created by the Neon build. This confirms that BuildKit shares identical layers
across the three separate Dockerfiles in the current environment.

## Server baseline blocker

The server build failed with:

```text
packages/shared/runtime-domain/atlas-agent-runtime/...:
error TS2307: Cannot find module 'zod' or its corresponding type declarations.
```

`atlas-agent-runtime` source is copied after dependency installation, but its
`package.json` is absent from the manifest-copy section of
`server/Dockerfile.prod`. Consequently, the filtered install does not discover
and install that workspace package's `zod` dependency.

The failure occurred after the adapter and service builds passed and while
running:

```text
pnpm --filter "@athyper/runtime-server" run build
```

This confirms the workspace-manifest drift finding as a current build
correctness problem rather than a hypothetical maintenance risk.

Because the server image was not produced, the following baseline checks are
blocked:

- API container startup
- Worker container startup
- Scheduler container startup
- Server `/livez`
- API shutdown-signal behavior
- Server runtime image size

## Unchanged rebuild behavior

| Image | Unchanged rebuild |
| --- | ---: |
| Neon | 4.33 s |
| Mesh | 3.77 s |
| Admin | 3.71 s |

All build stages were cached during these unchanged rebuilds.

This disproves the audit's assertion that the three Dockerfiles receive zero
layer sharing. The larger concern remains valid: because `COPY . .` precedes
`pnpm install`, any non-ignored repository source change invalidates the shared
copy layer and therefore the full-workspace install layer.

## Runtime checks

Temporary containers were created for each successful web image and removed
after verification.

| Image | Docker health | `/livez` | Generated `/_next/static` asset |
| --- | --- | ---: | ---: |
| Neon | Healthy | 200 | 200 |
| Mesh | Healthy | 200 | 200 |
| Admin | Healthy | 200 | 200 |

The standalone servers therefore start successfully, pass their configured
liveness checks, and serve generated static assets.

## Cache invalidation map

### Current Next Dockerfiles

```text
Any non-ignored repository source change
  -> invalidates COPY . .
  -> invalidates full-workspace pnpm install
  -> invalidates the selected Next build
  -> invalidates standalone runtime copies
```

An identical `COPY . .` and install layer can be shared between Neon, Mesh, and
Admin, but a source change invalidates that shared layer for all three.

### Current server Dockerfile

```text
Lockfile or copied package-manifest change
  -> invalidates filtered pnpm install

Server or packages/shared source change
  -> preserves install layer
  -> invalidates package and server compilation
```

The server's manifest-first design has the desired cache boundary, but its
manually maintained manifest set is incomplete.

## Phase 0 conclusion

Phase 0 is complete for the three web images. The server baseline is
intentionally recorded as failed because the failure provides direct evidence
for the first correctness fix.

The next implementation step is Phase 1:

1. Add the missing server dependency manifests required by the actual filtered
   workspace closure.
2. Add an automated manifest-drift verification.
3. rebuild `server/Dockerfile.prod` without relying on the stale install layer;
4. complete API, worker, scheduler, liveness, shutdown, and image-size
   measurements.
