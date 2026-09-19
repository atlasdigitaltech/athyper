# Ingress image updates

The platform ingress, instance gateway, publication TLS proxy, and nginx outage
services use upstream images pinned as `tag@sha256:<index digest>`. The tag records
the selected version; the digest selects immutable content. These are upstream
images, so no Docker Bake rebuild is required. Registry mirroring is a separate
availability decision.

## Update procedure

1. Select the upstream release after reviewing its release notes and security
   advisories. Resolve the tag using `docker buildx imagetools inspect <tag>`.
2. Record the top-level index digest, not an individual architecture manifest or
   local image ID. Inspect `<tag>@sha256:<digest>` and confirm it includes every
   deployment architecture (currently verify Linux amd64 and arm64). Pull the
   pinned reference on each target architecture during qualification.
3. Update the references together in:
   - `deploy/compose/platform/compose.yaml`
   - `deploy/compose/instance/compose.yaml`
   - `deploy/compose/instance/compose.publication-secretstore.yaml`
   - `deploy/catalog/capabilities.yaml`
4. Run `node --test deploy/compose/tests/structure.test.mjs`. The catalog checks
   enforce matching image references and memory budgets. Report unrelated test
   failures separately rather than treating the suite as passing.
5. Qualify isolated dev, QA, and staging projects with temporary TLS material.
   Check healthy startup, non-root users, zero effective capabilities, TLS,
   browser HTML 503 and API problem JSON 503 responses, and `Retry-After: 60`.
   Test all three nginx `/healthz` endpoints. With a temporary nginx config,
   disable only 8081, then only 8082; each must fail the aggregate Docker
   healthcheck while 8080 stays healthy. Restore the config and verify recovery.
   Stop nginx normally and check successful exit without an OOM or forced kill.
6. Record the old/new digests, upstream release, architecture coverage, and test
   results in the change review. Recreate affected containers after rollout;
   restarting an existing container does not replace its image or healthcheck.
   Roll back by restoring the previous references and recreating the services.

Review upstream security updates during routine dependency maintenance and when
an applicable advisory is published; pinning must not freeze updates indefinitely.

## Operational decisions

The instance outage container probes ports 8080, 8081, and 8082 with two-second
request timeouts and a seven-second overall limit. Traefik retains independent
probes for each service. These liveness checks do not validate page rendering;
qualification also checks response content. An unhealthy Docker status alone
does not restart the container.

nginx's master manages and reaps its workers, so the outage containers do not add
an init process solely to match Traefik. Their catalog budgets remain 128 MiB for
the three instance endpoints and 64 MiB for the platform endpoint. These are
allocations, not measured minimum requirements; measure representative load
before reducing them.

The HTTP retry advice is 60 seconds at both tiers. The instance browser outage
page checks recovery every 15 seconds independently; maintenance does not
automatically reload.

## Audit clarifications

Removing `--api.dashboard=false` avoids creating an unnecessary API configuration
object. API configuration and exposing `api@internal` through a router or insecure
mode are separate concerns; the removed flag was not inert.

Quoting `restart: "no"` avoids YAML 1.1 boolean ambiguity. Establishing an actual
runtime failure for the unquoted spelling requires checking the Compose parser
used by that deployment, rather than assuming every YAML parser treats it alike.
