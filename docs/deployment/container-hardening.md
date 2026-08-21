# Container hardening and maintenance

## Package-manager version contract

The canonical pnpm release is the version in the root `package.json`
`packageManager` field. Every Docker `corepack prepare pnpm@...` instruction and
the `PNPM_VERSION` used by CI must match it.

Run the same blocking check locally:

```bash
pnpm policy:docker-toolchain
```

Do not use `pnpm@latest` in an image build.

## Build-time public variables

Next.js substitutes statically referenced `NEXT_PUBLIC_*` values during
`next build`. Setting a different value only in a running container does not
change the browser bundle. The shared `apps/Dockerfile` therefore declares the
public variables as build arguments and promotes them to builder-stage
environment variables before invoking the filtered application build.

Compose supplies those arguments through the `next-public-build-args` anchor in
`stack/compose/apps/athyper-apps.yml`. Set the source values in the environment
file used by Compose, then rebuild all affected web images:

```bash
docker compose --project-directory stack/compose build \
  neon-web mesh-web admin-web
```

Direct Docker builds must pass the arguments explicitly:

```bash
docker build -f apps/Dockerfile \
  --build-arg APP_NAME=neon \
  --build-arg APP_PACKAGE=@athyper/neon \
  --build-arg NEXT_PUBLIC_ENVIRONMENT=staging \
  --build-arg NEXT_PUBLIC_SERVICE_VERSION="$RELEASE_VERSION" \
  --build-arg NEXT_PUBLIC_SENTRY_DSN="$NEXT_PUBLIC_SENTRY_DSN" \
  -t athyper/neon:"$RELEASE_VERSION" .
```

All `NEXT_PUBLIC_*` values are browser-visible. Never pass credentials or other
secrets under that prefix. A change to any build-time public value requires a
new image; restarting an existing image is insufficient.

The current shared build contract includes:

- `NEXT_PUBLIC_ATHYPER_DASHBOARD_PREFETCH_ENTITIES`
- `NEXT_PUBLIC_AUTH_DISCOVERY_RESEND_COOLDOWN_SECONDS`
- `NEXT_PUBLIC_ENVIRONMENT`
- `NEXT_PUBLIC_GITHUB_LOGIN_ENABLED`
- `NEXT_PUBLIC_GLITCHTIP_DSN`
- `NEXT_PUBLIC_PLATFORM_CONTROL_ENABLED`
- `NEXT_PUBLIC_SENTRY_DSN`
- `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`
- `NEXT_PUBLIC_SERVICE_VERSION`

## Node image digest policy

Digest pinning was evaluated for the Node build and runtime stages. It improves
reproducibility, but a single Dockerfile contains more than one `FROM
node:24-alpine` instruction. GitHub Dependabot's Docker support updates only the
first `FROM` instruction, which could leave builder and runtime stages on
different digests.

For that reason, Node tags remain minor-line pins for now. Do not add a digest
manually until the updater is configured and tested to update every Node
reference in `apps/Dockerfile`, `server/Dockerfile.dev`, and
`server/Dockerfile.prod` atomically. The weekly clean build still pulls the
current `node:24-alpine` image and exposes upstream changes through the image
report.

## Read-only root filesystem assessment

The production server and web images run as the non-root `node` user. Runtime
uploads are streamed to object storage or held in memory; normal API, worker,
scheduler, and web operation has no identified requirement to write below
`/app`.

Some operational and development commands intentionally write reports or
generated assets into the checkout. Those commands are not production
entrypoints and must not be run in a read-only application container.

Before enabling Compose `read_only: true`, complete a staging soak for API,
worker, scheduler, Neon, Mesh, and Admin with:

- a writable `tmpfs` mounted at `/tmp`;
- application configuration mounted read-only at `/config`;
- backup, render, upload, migration, and graceful-shutdown paths exercised;
- logs emitted to stdout/stderr rather than files.

Keep `/app` read-only. If a newly discovered runtime path needs persistence,
mount that exact path explicitly instead of making `/app` writable.

## Scheduled clean builds and reports

`.github/workflows/container-maintenance.yml` runs each Monday and can also be
started manually. Scheduled runs use `docker build --no-cache --pull` for the
server runtime image. Every run publishes:

- image size in the GitHub Actions job summary and `container-size.json`;
- critical, high, and medium vulnerability counts in the job summary;
- the complete Trivy JSON report as a 30-day workflow artifact.

The vulnerability scan is initially reporting-only. Maintainers should review
the baseline before introducing a blocking severity threshold.
