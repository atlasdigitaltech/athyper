# Observability readiness images

Loki and Tempo's pinned upstream images have no shell or HTTP client. These
derived images retain their upstream entrypoints and users and add a static,
standard-library-only Go HTTP probe. Compose executes it directly against the
local `/ready` endpoint; only HTTP 200 succeeds, redirects fail, and requests
time out after four seconds. Prometheus uses its existing `wget` executable.

Build locally from the repository root:

```sh
docker buildx bake -f deploy/docker-bake.hcl loki tempo
```

The operations Loki and both Tempo services declare build contexts. Any `ATHYPER_IMAGE_LOKI` or
`ATHYPER_IMAGE_TEMPO` override must include `/usr/local/bin/readiness`.
The build runs the probe's status-code and timeout tests. To validate both
stacks' dependency gating, Docker health states, ingestion, and restart:

```sh
ATHYPER_OBSERVABILITY_TESTS=true node --test deploy/compose/tests/observability-tmp.integration.test.mjs
```

Readiness gates initial dependent startup; Compose does not automatically stop
Grafana when a backend later becomes unhealthy.
